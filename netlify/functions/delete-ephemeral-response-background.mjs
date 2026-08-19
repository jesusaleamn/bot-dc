import { deleteOriginalInteractionResponse } from "../../src/netlify/discord-api.mjs";
import {
  getCleanupSignatureHeaderName,
  verifyCleanupSignature,
} from "../../src/netlify/ephemeral-cleanup.mjs";

const MAX_DELAY_MS = 15000;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function headerValue(headers, name) {
  return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "method_not_allowed",
    };
  }

  const rawBody = event.body ?? "";
  const signature = headerValue(event.headers ?? {}, getCleanupSignatureHeaderName());
  if (!verifyCleanupSignature(rawBody, signature)) {
    return {
      statusCode: 401,
      body: "invalid_signature",
    };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return {
      statusCode: 400,
      body: "invalid_json",
    };
  }

  const delayMs = Math.min(Number(payload.delayMs) || 0, MAX_DELAY_MS);
  if (delayMs > 0) {
    await sleep(delayMs);
  }

  await deleteOriginalInteractionResponse(payload.applicationId, payload.interactionToken);

  return {
    statusCode: 204,
    body: "",
  };
}
