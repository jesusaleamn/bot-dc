import assert from "node:assert/strict";
import test from "node:test";

import { buildActivityEmbed, buildOrdersEmbed, renderInventory } from "../../src/netlify/render.mjs";

test("renderInventory shows empty state", () => {
  const rendered = renderInventory("Alquimia", []);

  assert.equal(rendered.title, "🧪 INVENTARIO — ALQUIMIA");
  assert.match(rendered.description, /No hay objetos registrados/);
});

test("renderInventory sorts items by id", () => {
  const rendered = renderInventory("Leñadores", [
    { item_id: 601, name: "Ramas", quantity: 15 },
    { item_id: 102, name: "Leña", quantity: 120 },
  ]);

  assert.ok(rendered.description.indexOf("102 │ Leña") < rendered.description.indexOf("601 │ Ramas"));
  assert.match(rendered.description, /120/);
});

test("buildOrdersEmbed shows active orders and counters", () => {
  const embed = buildOrdersEmbed({
    inventory: { name: "Alquimia" },
    orders: [
      {
        order_no: 1,
        requester_user_id: "123",
        item_id: 101,
        item_name: "Poción de vida",
        requested_quantity: 120,
        delivered_quantity: 40,
      },
    ],
    completedThisWeek: 5,
    completedTotal: 12,
  });

  assert.match(embed.description, /#1/);
  assert.match(embed.description, /<@123>/);
  assert.match(embed.description, /Falta: 80/);
  assert.match(embed.description, /Completados esta semana: 5/);
});

test("buildActivityEmbed mentions Discord users", () => {
  const embed = buildActivityEmbed([
    {
      user_id: "123",
      item_id: 101,
      item_name: "Poción de vida",
      total_added: 10,
      total_removed: 120,
      add_count: 1,
      subtract_count: 3,
    },
  ]);

  assert.match(embed.description, /<@123>/);
  assert.match(embed.description, /Neto: `-110`/);
});
