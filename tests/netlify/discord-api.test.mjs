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

test("editInventoryMessage accepts visible message content and clears embeds", async () => {
  process.env.DISCORD_TOKEN = "bot-token";
  let requestBody = null;

  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "message-id" }),
    };
  };

  await editInventoryMessage("channel-id", "message-id", {
    content: "**INVENTARIO**\n```text\nID │ MATERIAL\n```",
    embeds: [],
  });

  assert.equal(requestBody.content, "**INVENTARIO**\n```text\nID │ MATERIAL\n```");
  assert.deepEqual(requestBody.embeds, []);
});

test("editInventoryMessage retries Discord 429 responses", async () => {
  process.env.DISCORD_TOKEN = "bot-token";
  let calls = 0;

  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: false,
        status: 429,
        headers: new Headers(),
        text: async () => JSON.stringify({ retry_after: 0 }),
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "message-id" }),
    };
  };

  await editInventoryMessage("channel-id", "message-id", { title: "Inventory" });

  assert.equal(calls, 2);
});
