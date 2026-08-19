import { DISCORD_API_BASE } from "./constants.mjs";
import { InventoryError, InventoryMessageMissingError } from "./errors.mjs";

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
    throw new InventoryError("❌ No tengo permisos para enviar, leer historial o editar el mensaje permanente.");
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

export async function sendInventoryMessage(channelId, embed) {
  return discordRequest(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      embeds: [embed],
    }),
  });
}

export async function editInventoryMessage(channelId, messageId, embed) {
  return discordRequest(`/channels/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      embeds: [embed],
    }),
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

