import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";
import nacl from "tweetnacl";

import { handler as discordInteractionsFunction } from "../../netlify/functions/discord-interactions.mjs";
import { handleDiscordInteraction } from "../../src/netlify/handler.mjs";
import {
  getDiscordPublicKeyStatus,
  verifyDiscordSignature,
} from "../../src/netlify/security.mjs";

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

test("verifyDiscordSignature accepts a quoted public key", () => {
  const keyPair = nacl.sign.keyPair();
  const event = signedEvent({ type: 1 }, keyPair);
  const publicKey = `"${Buffer.from(keyPair.publicKey).toString("hex")}"`;

  assert.equal(verifyDiscordSignature(event, publicKey), true);
});

test("verifyDiscordSignature rejects malformed public keys without throwing", () => {
  const keyPair = nacl.sign.keyPair();
  const event = signedEvent({ type: 1 }, keyPair);

  assert.equal(verifyDiscordSignature(event, "not-a-discord-public-key"), false);
  assert.equal(getDiscordPublicKeyStatus("not-a-discord-public-key").valid, false);
});

test("handleDiscordInteraction replies to Discord PING", async () => {
  const keyPair = nacl.sign.keyPair();
  const event = signedEvent({ type: 1 }, keyPair);
  process.env.DISCORD_PUBLIC_KEY = Buffer.from(keyPair.publicKey).toString("hex");

  const response = await handleDiscordInteraction(event);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { type: 1 });
});

test("netlify function entrypoint replies to Discord PING", async () => {
  const keyPair = nacl.sign.keyPair();
  const event = signedEvent({ type: 1 }, keyPair);
  process.env.DISCORD_PUBLIC_KEY = Buffer.from(keyPair.publicKey).toString("hex");

  const response = await discordInteractionsFunction(event);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { type: 1 });
});

test("handleDiscordInteraction rejects unsigned PING requests", async () => {
  process.env.DISCORD_PUBLIC_KEY = Buffer.from(nacl.sign.keyPair().publicKey).toString("hex");

  const response = await handleDiscordInteraction({
    httpMethod: "POST",
    headers: {},
    body: JSON.stringify({ type: 1 }),
    isBase64Encoded: false,
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.body, "invalid request signature");
});
