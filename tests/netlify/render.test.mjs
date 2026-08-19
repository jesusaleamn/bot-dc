import assert from "node:assert/strict";
import test from "node:test";

import { renderInventory } from "../../src/netlify/render.mjs";

test("renderInventory shows empty state", () => {
  const rendered = renderInventory("Alquimia", []);

  assert.equal(rendered.title, "🧪 INVENTARIO — ALQUIMIA");
  assert.match(rendered.description, /No hay objetos registrados/);
});

test("renderInventory sorts items by id", () => {
  const rendered = renderInventory("Leñadores", [
    { item_id: 3, name: "Ramas", quantity: 15 },
    { item_id: 1, name: "Leña", quantity: 120 },
  ]);

  assert.ok(rendered.description.indexOf(" 1 │ Leña") < rendered.description.indexOf(" 3 │ Ramas"));
  assert.match(rendered.description, /120/);
});

