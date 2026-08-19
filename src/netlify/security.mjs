import { Buffer } from "node:buffer";
import nacl from "tweetnacl";

const DISCORD_PUBLIC_KEY_LENGTH = 64;
const DISCORD_SIGNATURE_LENGTH = 128;

export function getRawBody(event) {
  const body = event.body ?? "";
  if (event.isBase64Encoded) {
    return Buffer.from(body, "base64");
  }
  return Buffer.from(body, "utf8");
}

export function normalizeDiscordPublicKey(publicKey) {
  if (!publicKey) {
    return "";
  }

  return String(publicKey)
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

export function getDiscordPublicKeyStatus(publicKey) {
  const normalized = normalizeDiscordPublicKey(publicKey);

  if (!normalized) {
    return {
      configured: false,
      valid: false,
      reason: "missing",
    };
  }

  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    return {
      configured: true,
      valid: false,
      reason: "not_hex",
    };
  }

  if (normalized.length !== DISCORD_PUBLIC_KEY_LENGTH) {
    return {
      configured: true,
      valid: false,
      reason: "wrong_length",
    };
  }

  return {
    configured: true,
    valid: true,
    reason: "ok",
  };
}

export function verifyDiscordSignature(event, publicKey) {
  const signature = event.headers["x-signature-ed25519"] ?? event.headers["X-Signature-Ed25519"];
  const timestamp = event.headers["x-signature-timestamp"] ?? event.headers["X-Signature-Timestamp"];
  const normalizedPublicKey = normalizeDiscordPublicKey(publicKey);
  const publicKeyStatus = getDiscordPublicKeyStatus(normalizedPublicKey);

  if (!signature || !timestamp || !publicKeyStatus.valid) {
    return false;
  }

  if (!/^[0-9a-fA-F]+$/.test(signature) || signature.length !== DISCORD_SIGNATURE_LENGTH) {
    return false;
  }

  const rawBody = getRawBody(event);
  const message = Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]);

  try {
    return nacl.sign.detached.verify(
      message,
      Buffer.from(signature, "hex"),
      Buffer.from(normalizedPublicKey, "hex"),
    );
  } catch {
    return false;
  }
}
