import { Buffer } from "node:buffer";
import nacl from "tweetnacl";

export function getRawBody(event) {
  const body = event.body ?? "";
  if (event.isBase64Encoded) {
    return Buffer.from(body, "base64");
  }
  return Buffer.from(body, "utf8");
}

export function verifyDiscordSignature(event, publicKey) {
  const signature = event.headers["x-signature-ed25519"] ?? event.headers["X-Signature-Ed25519"];
  const timestamp = event.headers["x-signature-timestamp"] ?? event.headers["X-Signature-Timestamp"];

  if (!signature || !timestamp || !publicKey) {
    return false;
  }

  const rawBody = getRawBody(event);
  const message = Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]);

  return nacl.sign.detached.verify(
    message,
    Buffer.from(signature, "hex"),
    Buffer.from(publicKey, "hex"),
  );
}

