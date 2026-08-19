import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";
import nacl from "tweetnacl";

import { handleDiscordInteraction } from "../../src/netlify/handler.mjs";
import { verifyDiscordSignature } from "../../src/netlify/security.mjs";

function signedEvent(payload, keyPair) {
  const body = JSON.stringify(payload);
  const timestamp = "1700000000";
  const message = Buffer.concat([Buffer.from(timestamp), Buffer.from(body)]);
  const signature = Buffer.from(nacl.sign.detached(message, keyPair.secretKey)).toString("hex");

  return {
    httpMethod: "POST",
    headers: {
      "x-signature-ed25519": signature,
      "x-signature-timestamp": timestamp,
    },
    body,
    isBase64Encoded: false,
  };
}

test("verifyDiscordSignature accepts a valid signature", () => {
  const keyPair = nacl.sign.keyPair();
  const event = signedEvent({ type: 1 }, keyPair);
  const publicKey = Buffer.from(keyPair.publicKey).toString("hex");

  assert.equal(verifyDiscordSignature(event, publicKey), true);
});

test("handleDiscordInteraction replies to Discord PING", async () => {
  const keyPair = nacl.sign.keyPair();
  const event = signedEvent({ type: 1 }, keyPair);
  process.env.DISCORD_PUBLIC_KEY = Buffer.from(keyPair.publicKey).toString("hex");

  const response = await handleDiscordInteraction(event);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { type: 1 });
});

