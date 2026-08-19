import { COMMANDS } from "../src/netlify/commands.mjs";
import { registerApplicationCommands } from "../src/netlify/discord-api.mjs";

const applicationId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID ?? process.env.COMMAND_GUILD_ID ?? null;

if (!applicationId) {
  console.error("Falta DISCORD_APPLICATION_ID.");
  process.exit(1);
}

if (!process.env.DISCORD_TOKEN) {
  console.error("Falta DISCORD_TOKEN.");
  process.exit(1);
}

const registered = await registerApplicationCommands(applicationId, COMMANDS, guildId);

console.log(
  guildId
    ? `Registrados ${registered.length} comandos en el servidor ${guildId}.`
    : `Registrados ${registered.length} comandos globales.`,
);

