import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { access, writeFile } from "node:fs/promises";
import { constants } from "node:fs";

const envPath = ".env.netlify.local";

function clean(value) {
  return value.trim();
}

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function askRequired(rl, label) {
  while (true) {
    const value = clean(await rl.question(`${label}: `));
    if (value) return value;
    console.log("Este valor es obligatorio.");
  }
}

const rl = createInterface({ input, output });

try {
  if (await fileExists(envPath)) {
    const overwrite = clean(await rl.question(`${envPath} ya existe. ¿Sobrescribir? (s/N): `)).toLowerCase();
    if (!["s", "si", "sí", "y", "yes"].includes(overwrite)) {
      console.log("No se ha modificado nada.");
      process.exit(0);
    }
  }

  console.log("\nPega los datos de Discord Developer Portal y Neon.\n");

  const discordToken = await askRequired(rl, "DISCORD_TOKEN");
  const applicationId = await askRequired(rl, "DISCORD_APPLICATION_ID");
  const publicKey = await askRequired(rl, "DISCORD_PUBLIC_KEY");
  const databaseUrl = await askRequired(rl, "DATABASE_URL de Neon");
  const guildId = clean(await rl.question("DISCORD_GUILD_ID de tu servidor de pruebas (opcional): "));
  const netlifyUrl = clean(await rl.question("URL de Netlify, si ya la tienes (opcional): "));

  const contents = [
    `DISCORD_TOKEN=${discordToken}`,
    `DISCORD_APPLICATION_ID=${applicationId}`,
    `DISCORD_PUBLIC_KEY=${publicKey}`,
    `DATABASE_URL=${databaseUrl}`,
    `DISCORD_GUILD_ID=${guildId}`,
    "",
  ].join("\n");

  await writeFile(envPath, contents, "utf8");

  console.log(`\nCreado ${envPath}.`);
  console.log("\nComandos siguientes:");
  console.log("npm install");
  console.log("npm run register:commands:local");
  console.log("\nURL para invitar el bot:");
  console.log(`https://discord.com/oauth2/authorize?client_id=${applicationId}&permissions=84992&scope=bot%20applications.commands`);

  if (netlifyUrl) {
    const normalizedUrl = netlifyUrl.replace(/\/+$/, "");
    console.log("\nInteractions Endpoint URL para Discord:");
    console.log(`${normalizedUrl}/discord-interactions`);
    console.log("\nHealth check:");
    console.log(`${normalizedUrl}/health`);
  } else {
    console.log("\nCuando Netlify te dé la URL, el endpoint será:");
    console.log("https://TU-SITIO.netlify.app/discord-interactions");
  }
} finally {
  rl.close();
}

