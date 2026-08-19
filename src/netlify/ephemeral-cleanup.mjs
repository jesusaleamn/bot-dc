import { createHmac, timingSafeEqual } from "node:crypto";

import { EPHEMERAL_DELETE_DELAY_MS } from "./constants.mjs";

const SIGNATURE_HEADER = "x-inventory-cleanup-signature";
const SCHEDULE_TIMEOUT_MS = 750;

function cleanupSecret() {
  return process.env.DISCORD_TOKEN ?? "";
}

function cleanupPayload({ applicationId, interactionToken, delayMs }) {
  return JSON.stringify({
    applicationId,
    interactionToken,
    delayMs,
  });
}

function signPayload(payload) {
  const secret = cleanupSecret();
  if (!secret) {
    return "";
  }

  return createHmac("sha256", secret).update(payload).digest("hex");
}

function getSiteUrl() {
  return (process.env.URL ?? "https://botinventariodc.netlify.app").replace(/\/+$/, "");
}

export function getCleanupSignatureHeaderName() {
  return SIGNATURE_HEADER;
}

export function verifyCleanupSignature(payload, signature) {
  const expected = signPayload(payload);
  if (
    !expected ||
    !signature ||
    expected.length !== signature.length ||
    !/^[0-9a-fA-F]+$/.test(signature)
  ) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

export async function scheduleEphemeralResponseDeletion({
  applicationId,
  interactionToken,
  delayMs = EPHEMERAL_DELETE_DELAY_MS,
}) {
  if (!applicationId || !interactionToken || process.env.EPHEMERAL_DELETE_ENABLED === "false") {
    return false;
  }

  const payload = cleanupPayload({ applicationId, interactionToken, delayMs });
  const signature = signPayload(payload);
  if (!signature) {
    console.warn("Cannot schedule ephemeral cleanup without DISCORD_TOKEN.");
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCHEDULE_TIMEOUT_MS);

  try {
    const response = await fetch(`${getSiteUrl()}/.netlify/functions/delete-ephemeral-response-background`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [SIGNATURE_HEADER]: signature,
      },
      body: payload,
      signal: controller.signal,
    });

    if (!response.ok && response.status !== 202) {
      console.warn("Ephemeral cleanup background function was not accepted", response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.warn("Could not schedule ephemeral cleanup", error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
