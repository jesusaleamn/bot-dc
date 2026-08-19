from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True, slots=True)
class InventoryDTO:
    id: int
    guild_id: str
    channel_id: str
    name: str
    message_id: str | None
    version: int


@dataclass(frozen=True, slots=True)
class InventoryItemDTO:
    item_id: int
    name: str
    quantity: int


@dataclass(frozen=True, slots=True)
class InventoryViewDTO:
    inventory: InventoryDTO
    items: list[InventoryItemDTO]


@dataclass(frozen=True, slots=True)
class QuantityChangeDTO:
    item_id: int
    name: str
    before_quantity: int
    after_quantity: int


@dataclass(frozen=True, slots=True)
class HistoryEntryDTO:
    created_at: datetime
    user_id: str
    operation: str
    item_id: int | None
    item_name: str | None
    amount: int | None
    before_quantity: int | None
    after_quantity: int | None
    before_name: str | None
    after_name: str | None

