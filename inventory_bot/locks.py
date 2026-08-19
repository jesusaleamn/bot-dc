from __future__ import annotations

import asyncio
from collections import defaultdict


class InventoryLockManager:
    def __init__(self) -> None:
        self._locks: defaultdict[tuple[int, int], asyncio.Lock] = defaultdict(asyncio.Lock)

    def for_inventory(self, guild_id: int, channel_id: int) -> asyncio.Lock:
        return self._locks[(guild_id, channel_id)]

