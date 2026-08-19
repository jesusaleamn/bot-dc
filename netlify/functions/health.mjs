import { getDiscordPublicKeyStatus } from "../../src/netlify/security.mjs";

function hasEnv(name) {
  return Boolean(String(process.env[name] ?? "").trim());
}

export async function handler() {
  const publicKey = getDiscordPublicKeyStatus(process.env.DISCORD_PUBLIC_KEY);

  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      status: "ok",
      service: "discord-guild-inventory-netlify",
      endpoints: {
        discordInteractions: "/discord-interactions",
        discordInteractionsFunction: "/.netlify/functions/discord-interactions",
      },
      discord: {
        applicationIdConfigured: hasEnv("DISCORD_APPLICATION_ID"),
        tokenConfigured: hasEnv("DISCORD_TOKEN"),
        publicKeyConfigured: publicKey.configured,
        publicKeyValidShape: publicKey.valid,
        publicKeyStatus: publicKey.reason,
      },
      database: {
        urlConfigured: hasEnv("DATABASE_URL"),
      },
      security: {
        unsignedInteractionRequestsReturn401: true,
      },
    }),
  };
}
