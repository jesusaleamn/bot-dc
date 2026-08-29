import { DISCORD_API_BASE } from "./constants.mjs";
import { BotPermissionError, InventoryError, InventoryMessageMissingError } from "./errors.mjs";

const DISCORD_RATE_LIMIT_RETRIES = 2;

async function discordRequest(path, options = {}, attempt = 0) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new InventoryError("❌ Falta DISCORD_TOKEN en Netlify.");
  }

  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    ...options,
    headers: {
      authorization: `Bot ${token}`,
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (response.status === 429) {
    const body = await response.text();
    const waitMs = getDiscordRetryAfterMs(body, response.headers);

    if (attempt < DISCORD_RATE_LIMIT_RETRIES) {
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      return discordRequest(path, options, attempt + 1);
    }

    console.error("Discord API rate limit", body);
    throw new InventoryError("⏳ Discord está limitando las actualizaciones. Espera unos segundos e inténtalo de nuevo.");
  }

  if (response.status === 404) {
    throw new InventoryMessageMissingError();
  }

  if (response.status === 403) {
    throw new BotPermissionError();
  }

  if (!response.ok) {
    const body = await response.text();
    console.error("Discord API error", response.status, body);
    throw new InventoryError("❌ Discord rechazó la operación. Revisa permisos e inténtalo de nuevo.");
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function getDiscordRetryAfterMs(body, headers) {
  let retryAfterSeconds = Number(headers?.get?.("retry-after"));

  try {
    const payload = JSON.parse(body);
    const bodyRetryAfter = Number(payload.retry_after);
    if (Number.isFinite(bodyRetryAfter)) {
      retryAfterSeconds = bodyRetryAfter;
    }
  } catch {
    // Discord normally sends JSON for 429 responses; the header fallback is enough otherwise.
  }

  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds < 0) {
    retryAfterSeconds = 1;
  }

  const retryAfterMs = Math.ceil(retryAfterSeconds * 1000);
  return retryAfterMs > 0 ? retryAfterMs + 250 : 0;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeEmbeds(embedOrEmbeds) {
  return Array.isArray(embedOrEmbeds) ? embedOrEmbeds : [embedOrEmbeds];
}

function normalizeMessagePayload(message) {
  if (
    message
    && !Array.isArray(message)
    && (
      Object.hasOwn(message, "content")
      || Object.hasOwn(message, "embeds")
      || Object.hasOwn(message, "allowed_mentions")
    )
  ) {
    return message;
  }

  return {
    embeds: normalizeEmbeds(message),
  };
}

export async function sendInventoryMessage(channelId, message) {
  return discordRequest(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify(normalizeMessagePayload(message)),
  });
}

export async function editInventoryMessage(channelId, messageId, message) {
  return discordRequest(`/channels/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify(normalizeMessagePayload(message)),
  });
}

export async function deleteInventoryMessage(channelId, messageId) {
  return discordRequest(`/channels/${channelId}/messages/${messageId}`, {
    method: "DELETE",
  });
}

export async function registerApplicationCommands(applicationId, commands, guildId = null) {
  const path = guildId
    ? `/applications/${applicationId}/guilds/${guildId}/commands`
    : `/applications/${applicationId}/commands`;

  return discordRequest(path, {
    method: "PUT",
    body: JSON.stringify(commands),
  });
}

export async function deleteOriginalInteractionResponse(applicationId, interactionToken) {
  const response = await fetch(
    `${DISCORD_API_BASE}/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    {
      method: "DELETE",
    },
  );

  if (response.status === 204 || response.status === 404) {
    return;
  }

  if (!response.ok) {
    const body = await response.text();
    console.error("Discord interaction cleanup error", response.status, body);
  }
}
