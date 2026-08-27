import { DISCORD_API_BASE } from "./constants.mjs";
import { BotPermissionError, InventoryError, InventoryMessageMissingError } from "./errors.mjs";

async function discordRequest(path, options = {}) {
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

function normalizeEmbeds(embedOrEmbeds) {
  return Array.isArray(embedOrEmbeds) ? embedOrEmbeds : [embedOrEmbeds];
}

export async function sendInventoryMessage(channelId, embedOrEmbeds) {
  return discordRequest(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      embeds: normalizeEmbeds(embedOrEmbeds),
    }),
  });
}

export async function editInventoryMessage(channelId, messageId, embedOrEmbeds) {
  return discordRequest(`/channels/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      embeds: normalizeEmbeds(embedOrEmbeds),
    }),
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
