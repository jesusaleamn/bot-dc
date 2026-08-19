import { handleDiscordInteraction } from "../../src/netlify/handler.mjs";


export async function handler(event) {
  return handleDiscordInteraction(event);
}

