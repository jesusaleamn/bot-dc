import assert from "node:assert/strict";
import test from "node:test";

import { ADMIN_COMMANDS, COMMANDS } from "../../src/netlify/commands.mjs";
import { hasInventoryAdminPermission } from "../../src/netlify/permissions.mjs";
import { handler as healthHandler } from "../../netlify/functions/health.mjs";
import { handler as inviteHandler } from "../../netlify/functions/invite.mjs";

function commandByName(name) {
  return COMMANDS.find((command) => command.name === name);
}

function optionByName(command, name) {
  return command.options?.find((option) => option.name === name);
}

test("registers the expected slash command names", () => {
  assert.deepEqual(
    COMMANDS.map((command) => command.name),
    [
      "inventario",
      "crear",
      "sumar",
      "restar",
      "editar",
      "borrar",
      "ver",
      "recrear_inventario",
      "historial",
      "pedidos",
      "pedido_crear",
      "pedido_llevar",
      "pedido_completar",
      "pedidos_completados",
      "actividad",
      "ayuda",
    ],
  );
});

test("sumar and restar can be used with only id or any positive amount", () => {
  for (const commandName of ["sumar", "restar"]) {
    const command = commandByName(commandName);
    const amount = optionByName(command, "cantidad");

    assert.equal(amount.required, false);
    assert.equal(amount.min_value, 1);
    assert.equal(amount.max_value, 2147483647);
    assert.equal("choices" in amount, false);
  }
});

test("item ids can use three digits", () => {
  for (const commandName of ["crear", "sumar", "restar", "editar", "borrar", "pedido_crear"]) {
    const command = commandByName(commandName);
    const id = optionByName(command, "id");

    assert.equal(id.min_value, 1);
    assert.equal(id.max_value, 999);
  }
});

test("pedido_crear can assign the request to a Discord user", () => {
  const command = commandByName("pedido_crear");
  const user = optionByName(command, "usuario");

  assert.equal(user.required, false);
  assert.equal(user.type, 6);
});

test("only borrar requires elevated Discord permissions", () => {
  assert.deepEqual([...ADMIN_COMMANDS], ["borrar"]);
});

test("admin permission accepts administrator, manage channels, or manage guild", () => {
  assert.equal(hasInventoryAdminPermission({ member: { permissions: String(1 << 3) } }), true);
  assert.equal(hasInventoryAdminPermission({ member: { permissions: String(1 << 4) } }), true);
  assert.equal(hasInventoryAdminPermission({ member: { permissions: String(1 << 5) } }), true);
  assert.equal(hasInventoryAdminPermission({ member: { permissions: "0" } }), false);
});

test("invite function redirects to Discord OAuth install URL", async () => {
  process.env.DISCORD_APPLICATION_ID = "1234567890";

  const response = await inviteHandler();

  assert.equal(response.statusCode, 302);
  assert.match(response.headers.location, /discord\.com\/oauth2\/authorize/);
  assert.match(response.headers.location, /client_id=1234567890/);
  assert.match(response.headers.location, /permissions=84992/);
});

test("health function reports configuration shape without exposing secrets", async () => {
  process.env.DISCORD_APPLICATION_ID = "1234567890";
  process.env.DISCORD_TOKEN = "secret-token";
  process.env.DISCORD_PUBLIC_KEY = "a".repeat(64);
  process.env.DATABASE_URL = "postgresql://user:pass@example.com/db";

  const response = await healthHandler();
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(payload.discord.applicationIdConfigured, true);
  assert.equal(payload.discord.tokenConfigured, true);
  assert.equal(payload.discord.publicKeyConfigured, true);
  assert.equal(payload.discord.publicKeyValidShape, true);
  assert.equal(payload.database.urlConfigured, true);
  assert.equal(JSON.stringify(payload).includes("secret-token"), false);
  assert.equal(JSON.stringify(payload).includes("postgresql://"), false);
});
