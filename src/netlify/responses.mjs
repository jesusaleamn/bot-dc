import { InteractionResponseType, MessageFlags } from "./constants.mjs";

export function httpJson(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  };
}

export function pongResponse() {
  return httpJson(200, {
    type: InteractionResponseType.PONG,
  });
}

export function interactionMessage({ content, embeds, ephemeral = true }) {
  const data = {};
  if (content) data.content = content;
  if (embeds) data.embeds = embeds;
  if (ephemeral) data.flags = MessageFlags.EPHEMERAL;

  return httpJson(200, {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data,
  });
}

