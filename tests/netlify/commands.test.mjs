import assert from "node:assert/strict";
import test from "node:test";

import { COMMANDS } from "../../src/netlify/commands.mjs";
import { hasInventoryAdminPermission } from "../../src/netlify/permissions.mjs";

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
      "ayuda",
    ],
  );
});

test("admin permission accepts administrator, manage channels, or manage guild", () => {
  assert.equal(hasInventoryAdminPermission({ member: { permissions: String(1 << 3) } }), true);
  assert.equal(hasInventoryAdminPermission({ member: { permissions: String(1 << 4) } }), true);
  assert.equal(hasInventoryAdminPermission({ member: { permissions: String(1 << 5) } }), true);
  assert.equal(hasInventoryAdminPermission({ member: { permissions: "0" } }), false);
});

