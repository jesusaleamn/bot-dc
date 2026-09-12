import assert from "node:assert/strict";
import test from "node:test";

import {
  buildActivityEmbed,
  buildEconomyEmbed,
  buildEconomyPages,
  buildGeneralInventoryEmbeds,
  buildGeneralInventoryPages,
  buildInventoryPages,
  buildInventoryTextPages,
  buildMemberActivityEmbed,
  buildMemberActivityPages,
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

test("buildInventoryTextPages renders visible text for users without embeds", () => {
  const pages = buildInventoryTextPages({ table_id: 101, name: "Alquimia" }, [
    { item_id: 102, name: "Leña", quantity: 120, priority: "high" },
  ]);

  assert.equal(pages.length, 1);
  assert.match(pages[0], /INVENTARIO 101/);
  assert.match(pages[0], /102 │ A/);
  assert.match(pages[0], /120/);
});

test("buildInventoryTextPages splits large text responses below Discord limits", () => {
  const pages = buildInventoryTextPages(
    { table_id: 105, name: "Peletería" },
    Array.from({ length: 120 }, (_, index) => ({
      item_id: index + 1,
      name: `Material extenso ${index + 1}`,
      quantity: 100 + index,
      priority: index % 3 === 0 ? "high" : "none",
    })),
  );

  assert.ok(pages.length > 1);
  assert.match(pages[0], /\(1\/[0-9]+\)/);
  for (const page of pages) {
    assert.ok(page.length <= 1800);
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

test("buildMemberActivityEmbed groups movement totals by Discord user", () => {
  const embed = buildMemberActivityEmbed({
    inventory: { table_id: 101, name: "Alquimia" },
    summaries: [
      {
        user_id: "123",
        item_id: 1,
        item_name: "Poción menor",
        total_added: 150,
        total_removed: 20,
        net_total: 130,
        add_count: 2,
        subtract_count: 1,
      },
    ],
    recentReasons: [
      {
        created_at: "2026-09-12T10:15:00.000Z",
        user_id: "123",
        operation: "sumar",
        item_id: 1,
        item_name: "Poción menor",
        amount: 150,
        reason: "Entrega de guardia",
      },
    ],
  });

  assert.equal(embed.title, "👥 MIEMBROS — ALQUIMIA");
  assert.match(embed.description, /Motivos recientes/);
  assert.match(embed.description, /Entrega de guardia/);
  assert.match(embed.fields[0].value, /<@123>/);
  assert.match(embed.fields[0].value, /Poción menor/);
  assert.match(embed.fields[0].value, /\+130/);
});

test("buildEconomyEmbed shows sales, purchases, and balance", () => {
  const embed = buildEconomyEmbed({
    inventory: { table_id: 101, name: "Alquimia" },
    totals: {
      incomeTotal: 1000,
      expenseTotal: 250,
      balance: 750,
    },
    summaries: [
      {
        item_id: 1,
        item_name: "Poción menor",
        sold_quantity: 10,
        bought_quantity: 2,
        income_total: 1000,
        expense_total: 250,
        balance: 750,
      },
    ],
    recentEntries: [
      {
        created_at: "2026-09-12T10:15:00.000Z",
        user_id: "123",
        operation: "venta",
        item_id: 1,
        item_name: "Poción menor",
        quantity: 10,
        total: 1000,
        reason: "Pedido de la guardia",
      },
    ],
  });

  assert.equal(embed.title, "💰 ECONOMÍA — ALQUIMIA");
  assert.equal(embed.fields[0].name, "TOTAL DE NETTING");
  assert.match(embed.fields[0].value, /Ingresos acumulados: `1.000`/);
  assert.match(embed.fields[0].value, /\*\*\+750 netting\*\*/);
  assert.match(embed.fields[1].value, /Poción menor/);
  assert.match(embed.fields[2].value, /Pedido de la guardia/);
});

test("member pages retain every user and material within Discord field limits", () => {
  const summaries = Array.from({ length: 120 }, (_, index) => ({
    user_id: String(Math.floor(index / 20)), item_id: index + 1,
    item_name: "Material largo", total_added: 100, total_removed: 20, net_total: 80,
  }));
  const pages = buildMemberActivityPages({ inventory: { name: "Alquimia", table_id: 101 }, summaries, recentReasons: [] });
  assert.equal(pages.length, 6);
  const rendered = pages.map((page) => page.description).join("\n");
  for (const row of summaries) assert.match(rendered, new RegExp(`\\b${row.item_id} Material`));
  for (const page of pages) assert.ok(page.description.length <= 4096);
});

test("member pages split only at the description limit without losing rows", () => {
  const summaries = Array.from({ length: 200 }, (_, index) => ({
    user_id: "123", item_id: index + 1, item_name: "Material largo",
    total_added: 100, total_removed: 20, net_total: 80,
  }));
  const pages = buildMemberActivityPages({ inventory: { name: "Alquimia", table_id: 101 }, summaries, recentReasons: [] });
  assert.ok(pages.length > 1);
  const rendered = pages.map((page) => page.description).join("\n");
  for (const row of summaries) assert.match(rendered, new RegExp(`\\b${row.item_id} Material`));
  for (const page of pages) assert.ok(page.description.length <= 4096);
});

test("member balances distinguish negative, low, zero and healthy contributions", () => {
  const summaries = [-20, 0, 10, 11].map((net, index) => ({
    user_id: String(index), item_id: 1, item_name: "Material",
    total_added: 100, total_removed: 100 - net, net_total: net,
  }));
  const pages = buildMemberActivityPages({ inventory: { name: "Alquimia", table_id: 101 }, summaries, recentReasons: [] });
  assert.deepEqual(pages.map((page) => page.color), [0xc53030, 0xf59e0b, 0xf59e0b, 0x2f855a]);
  for (const [index, icon] of ["🔴", "🟠", "🟠", "🟢"].entries()) assert.ok(pages[index].description.includes(icon));
});

test("economy pages retain all materials with large totals within Discord limits", () => {
  const summaries = Array.from({ length: 50 }, (_, index) => ({
    item_id: index + 1, item_name: "Material largo", sold_quantity: "999999999999999999",
    bought_quantity: "999999999999999999", balance: 999999999999999,
  }));
  const pages = buildEconomyPages({ inventory: { name: "Alquimia", table_id: 101 },
    totals: { incomeTotal: 0, expenseTotal: 0, balance: 0 }, summaries, recentEntries: [] });
  assert.equal(pages.length, 9);
  for (const page of pages) for (const field of page.fields) assert.ok(field.value.length <= 1024);
});
