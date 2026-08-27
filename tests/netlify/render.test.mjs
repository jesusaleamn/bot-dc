import assert from "node:assert/strict";
import test from "node:test";

import {
  buildActivityEmbed,
  buildGeneralInventoryEmbeds,
  buildGeneralInventoryPages,
  buildInventoryPages,
  buildOrdersEmbed,
  renderInventory,
} from "../../src/netlify/render.mjs";

test("renderInventory shows empty state", () => {
  const rendered = renderInventory("Alquimia", []);

  assert.equal(rendered.title, "🧪 INVENTARIO — ALQUIMIA");
  assert.match(rendered.description, /No hay objetos registrados/);
});

test("renderInventory sorts items by id", () => {
  const rendered = renderInventory({ table_id: 101, name: "Leñadores" }, [
    { item_id: 601, name: "Ramas", quantity: 15, priority: "none" },
    { item_id: 102, name: "Leña", quantity: 120, priority: "high" },
  ]);

  assert.equal(rendered.title, "🧪 INVENTARIO 101 — LEÑADORES");
  assert.ok(rendered.description.indexOf("102 │ A") < rendered.description.indexOf("601 │ -"));
  assert.match(rendered.description, /120/);
});

test("buildGeneralInventoryEmbeds renders nested inventory tables", () => {
  const embeds = buildGeneralInventoryEmbeds({
    inventories: [
      {
        table_id: 101,
        channel_id: "111",
        name: "Alquimia",
        items: [{ item_id: 1, name: "Poción menor", quantity: 20, priority: "medium" }],
      },
      {
        table_id: 102,
        channel_id: "222",
        name: "Cocina",
        items: [{ item_id: 1, name: "Pan", quantity: 8, priority: "low" }],
      },
    ],
  });

  assert.equal(embeds.length, 2);
  assert.equal(embeds[0].title, "📚 TABLA 101 — ALQUIMIA");
  assert.match(embeds[0].description, /  1 │ M/);
  assert.match(embeds[1].footer.text, /<#222>/);
});

test("buildInventoryPages splits large personal inventories", () => {
  const pages = buildInventoryPages(
    { table_id: 105, name: "Peletería" },
    Array.from({ length: 120 }, (_, index) => ({
      item_id: index + 1,
      name: `Material extenso ${index + 1}`,
      quantity: 100 + index,
      priority: index % 3 === 0 ? "high" : "none",
    })),
  );

  assert.ok(pages.length > 1);
  assert.match(pages[0].title, /\(1\/2\)|\(1\/3\)|\(1\/4\)/);
  for (const page of pages) {
    assert.ok(page.description.length <= 3600);
  }
});

test("buildGeneralInventoryPages keeps Discord embed payloads below one-message limits", () => {
  const inventories = Array.from({ length: 5 }, (_, inventoryIndex) => ({
    table_id: 101 + inventoryIndex,
    channel_id: String(1000 + inventoryIndex),
    name: `Gremio ${inventoryIndex + 1}`,
    items: Array.from({ length: 30 }, (_, itemIndex) => ({
      item_id: itemIndex + 1,
      name: `Material muy largo ${inventoryIndex + 1}-${itemIndex + 1}`,
      quantity: 1000 + itemIndex,
      priority: itemIndex % 2 === 0 ? "high" : "none",
    })),
  }));

  const pages = buildGeneralInventoryPages({ inventories });

  assert.ok(pages.length > 1);
  for (const page of pages) {
    assert.ok(page.length <= 10);
    const totalText = page.reduce(
      (total, embed) => total + embed.title.length + embed.description.length + embed.footer.text.length,
      0,
    );
    assert.ok(totalText <= 5200);
  }
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
