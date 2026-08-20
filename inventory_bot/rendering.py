from __future__ import annotations

from dataclasses import dataclass

import discord

from inventory_bot.dtos import InventoryItemDTO

MATERIAL_WIDTH = 28
ITEM_ID_WIDTH = 3


@dataclass(frozen=True, slots=True)
class RenderedInventory:
    title: str
    description: str
    color: int = 0x2F855A


def _shorten(value: str, width: int) -> str:
    value = value.strip()
    if len(value) <= width:
        return value
    return f"{value[: width - 3]}..."


def render_inventory(name: str, items: list[InventoryItemDTO]) -> RenderedInventory:
    title = f"🧪 INVENTARIO — {name.strip().upper()}"

    if not items:
        return RenderedInventory(title=title, description="> No hay objetos registrados.")

    lines = [
        f"{'ID':>{ITEM_ID_WIDTH}} │ {'MATERIAL':<{MATERIAL_WIDTH}} │ {'CANTIDAD':>8}",
        f"{'─' * ITEM_ID_WIDTH}─┼─{'─' * MATERIAL_WIDTH}─┼─{'─' * 8}",
    ]
    for item in sorted(items, key=lambda entry: entry.item_id):
        material = _shorten(item.name, MATERIAL_WIDTH)
        lines.append(f"{item.item_id:>{ITEM_ID_WIDTH}} │ {material:<{MATERIAL_WIDTH}} │ {item.quantity:>8}")

    return RenderedInventory(title=title, description=f"```text\n{chr(10).join(lines)}\n```")


def build_inventory_embed(name: str, items: list[InventoryItemDTO]) -> discord.Embed:
    rendered = render_inventory(name, items)
    embed = discord.Embed(
        title=rendered.title,
        description=rendered.description,
        color=rendered.color,
    )
    embed.set_footer(text="Inventario compartido de este canal")
    return embed
