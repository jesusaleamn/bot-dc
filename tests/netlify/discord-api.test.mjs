import assert from "node:assert/strict";
import test from "node:test";

import { editInventoryMessage } from "../../src/netlify/discord-api.mjs";
import { BotPermissionError } from "../../src/netlify/errors.mjs";

const originalFetch = globalThis.fetch;
const originalDiscordToken = process.env.DISCORD_TOKEN;

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv("DISCORD_TOKEN", originalDiscordToken);
});

test("Discord 403 is reported as missing bot permissions", async () => {
  process.env.DISCORD_TOKEN = "bot-token";
  globalThis.fetch = async () => ({
    ok: false,
    status: 403,
    text: async () => "Missing Permissions",
  });

  await assert.rejects(
    () => editInventoryMessage("channel-id", "message-id", { title: "Inventory" }),
    (error) => {
      assert.equal(error instanceof BotPermissionError, true);
      assert.match(error.userMessage, /bot no tiene permisos/i);
      return true;
    },
  );
});
