from inventory_bot.dtos import InventoryItemDTO
from inventory_bot.rendering import render_inventory


def test_render_empty_inventory() -> None:
    rendered = render_inventory("Alquimia", [])

    assert rendered.title == "🧪 INVENTARIO — ALQUIMIA"
    assert "No hay objetos registrados" in rendered.description


def test_render_inventory_orders_items_by_id() -> None:
    rendered = render_inventory(
        "Leñadores",
        [
            InventoryItemDTO(item_id=3, name="Ramas", quantity=15),
            InventoryItemDTO(item_id=1, name="Leña", quantity=120),
        ],
    )

    assert rendered.description.index(" 1 │ Leña") < rendered.description.index(" 3 │ Ramas")
    assert "120" in rendered.description

