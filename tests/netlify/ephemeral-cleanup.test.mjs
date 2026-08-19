import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { handler as cleanupHandler } from "../../netlify/functions/delete-ephemeral-response-background.mjs";
import {
  getCleanupSignatureHeaderName,
  scheduleEphemeralResponseDeletion,
  verifyCleanupSignature,
} from "../../src/netlify/ephemeral-cleanup.mjs";

const originalFetch = globalThis.fetch;
const originalDiscordToken = process.env.DISCORD_TOKEN;
const originalUrl = process.env.URL;

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function sign(body, secret = process.env.DISCORD_TOKEN) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv("DISCORD_TOKEN", originalDiscordToken);
  restoreEnv("URL", originalUrl);
});

test("scheduleEphemeralResponseDeletion invokes the background function with a signed body", async () => {
  process.env.DISCORD_TOKEN = "cleanup-secret";
  process.env.URL = "https://example.netlify.app";

  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 202,
    };
  };

  const scheduled = await scheduleEphemeralResponseDeletion({
    applicationId: "app-id",
    interactionToken: "interaction-token",
    delayMs: 123,
  });

  assert.equal(scheduled, true);
  assert.equal(
    request.url,
    "https://example.netlify.app/.netlify/functions/delete-ephemeral-response-background",
  );
  assert.equal(request.options.method, "POST");
  assert.equal(
    verifyCleanupSignature(
      request.options.body,
      request.options.headers[getCleanupSignatureHeaderName()],
    ),
    true,
  );
});

test("cleanup background function rejects unsigned requests", async () => {
  process.env.DISCORD_TOKEN = "cleanup-secret";

  const response = await cleanupHandler({
    httpMethod: "POST",
    headers: {},
    body: JSON.stringify({
      applicationId: "app-id",
      interactionToken: "interaction-token",
      delayMs: 0,
    }),
  });

  assert.equal(response.statusCode, 401);
});

test("cleanup background function deletes the original interaction response", async () => {
  process.env.DISCORD_TOKEN = "cleanup-secret";
  const body = JSON.stringify({
    applicationId: "app-id",
    interactionToken: "interaction-token",
    delayMs: 0,
  });

  let deleteRequest;
  globalThis.fetch = async (url, options) => {
    deleteRequest = { url, options };
    return {
      ok: true,
      status: 204,
    };
  };

  const response = await cleanupHandler({
    httpMethod: "POST",
    headers: {
      [getCleanupSignatureHeaderName()]: sign(body),
    },
    body,
  });

  assert.equal(response.statusCode, 204);
  assert.equal(
    deleteRequest.url,
    "https://discord.com/api/v10/webhooks/app-id/interaction-token/messages/@original",
  );
  assert.equal(deleteRequest.options.method, "DELETE");
});
