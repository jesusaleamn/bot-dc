from __future__ import annotations

from sqlalchemy import desc, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from inventory_bot.dtos import (
    HistoryEntryDTO,
    InventoryDTO,
    InventoryItemDTO,
    InventoryViewDTO,
    QuantityChangeDTO,
)
from inventory_bot.errors import (
    InsufficientQuantityError,
    InventoryAlreadyExistsError,
    InventoryNotFoundError,
    ItemAlreadyExistsError,
    ItemNotFoundError,
)
from inventory_bot.models import Inventory, InventoryHistory, InventoryItem, utc_now

SessionFactory = async_sessionmaker[AsyncSession]


def _as_str(value: int) -> str:
    return str(value)


def _clean_name(value: str, *, max_length: int = 100) -> str:
    cleaned = " ".join(value.strip().split())
    if not cleaned:
        raise ValueError("El nombre no puede estar vacío.")
    if len(cleaned) > max_length:
        raise ValueError(f"El nombre no puede superar {max_length} caracteres.")
    return cleaned


def _inventory_dto(inventory: Inventory) -> InventoryDTO:
    return InventoryDTO(
        id=inventory.id,
        guild_id=inventory.guild_id,
        channel_id=inventory.channel_id,
        name=inventory.name,
        message_id=inventory.message_id,
        version=inventory.version,
    )


def _item_dto(item: InventoryItem) -> InventoryItemDTO:
    return InventoryItemDTO(
        item_id=item.item_id,
        name=item.name,
        quantity=item.quantity,
    )


async def _get_inventory(
    session: AsyncSession,
    guild_id: int,
    channel_id: int,
    *,
    for_update: bool = False,
) -> Inventory | None:
    statement = select(Inventory).where(
        Inventory.guild_id == _as_str(guild_id),
        Inventory.channel_id == _as_str(channel_id),
    )
    if for_update:
        statement = statement.with_for_update()
    result = await session.execute(statement)
    return result.scalar_one_or_none()


async def _require_inventory(
    session: AsyncSession,
    guild_id: int,
    channel_id: int,
    *,
    for_update: bool = False,
) -> Inventory:
    inventory = await _get_inventory(session, guild_id, channel_id, for_update=for_update)
    if inventory is None:
        raise InventoryNotFoundError()
    return inventory


def _record_history(
    session: AsyncSession,
    inventory: Inventory,
    *,
    user_id: int,
    operation: str,
    item_id: int | None = None,
    item_name: str | None = None,
    amount: int | None = None,
    before_quantity: int | None = None,
    after_quantity: int | None = None,
    before_name: str | None = None,
    after_name: str | None = None,
) -> None:
    session.add(
        InventoryHistory(
            inventory_id=inventory.id,
            guild_id=inventory.guild_id,
            channel_id=inventory.channel_id,
            item_id=item_id,
            item_name=item_name,
            operation=operation,
            amount=amount,
            before_quantity=before_quantity,
            after_quantity=after_quantity,
            before_name=before_name,
            after_name=after_name,
            user_id=_as_str(user_id),
        )
    )


def _touch(inventory: Inventory) -> None:
    inventory.version += 1
    inventory.updated_at = utc_now()


async def create_inventory(
    session_factory: SessionFactory,
    *,
    guild_id: int,
    channel_id: int,
    name: str,
    user_id: int,
) -> InventoryDTO:
    cleaned_name = _clean_name(name)
    async with session_factory() as session:
        try:
            async with session.begin():
                inventory = Inventory(
                    guild_id=_as_str(guild_id),
                    channel_id=_as_str(channel_id),
                    name=cleaned_name,
                    created_by=_as_str(user_id),
                )
                session.add(inventory)
                await session.flush()
                _record_history(session, inventory, user_id=user_id, operation="inventario")
                dto = _inventory_dto(inventory)
        except IntegrityError as exc:
            raise InventoryAlreadyExistsError() from exc
    return dto


async def set_inventory_message_id(
    session_factory: SessionFactory,
    *,
    guild_id: int,
    channel_id: int,
    message_id: int,
    user_id: int | None = None,
    record_recreate: bool = False,
) -> InventoryDTO:
    async with session_factory() as session:
        async with session.begin():
            inventory = await _require_inventory(session, guild_id, channel_id, for_update=True)
            inventory.message_id = _as_str(message_id)
            inventory.updated_at = utc_now()
            if record_recreate and user_id is not None:
                _touch(inventory)
                _record_history(session, inventory, user_id=user_id, operation="recrear_inventario")
            dto = _inventory_dto(inventory)
    return dto


async def get_inventory_view(
    session_factory: SessionFactory,
    *,
    guild_id: int,
    channel_id: int,
) -> InventoryViewDTO:
    async with session_factory() as session:
        inventory = await _require_inventory(session, guild_id, channel_id)
        result = await session.execute(
            select(InventoryItem)
            .where(InventoryItem.inventory_id == inventory.id)
            .order_by(InventoryItem.item_id.asc())
        )
        items = [_item_dto(item) for item in result.scalars().all()]
        return InventoryViewDTO(inventory=_inventory_dto(inventory), items=items)


async def create_item(
    session_factory: SessionFactory,
    *,
    guild_id: int,
    channel_id: int,
    item_id: int,
    name: str,
    quantity: int,
    user_id: int,
) -> InventoryItemDTO:
    cleaned_name = _clean_name(name)
    async with session_factory() as session:
        try:
            async with session.begin():
                inventory = await _require_inventory(session, guild_id, channel_id, for_update=True)
                item = InventoryItem(
                    inventory_id=inventory.id,
                    item_id=item_id,
                    name=cleaned_name,
                    quantity=quantity,
                    created_by=_as_str(user_id),
                    updated_by=_as_str(user_id),
                )
                session.add(item)
                await session.flush()
                _touch(inventory)
                _record_history(
                    session,
                    inventory,
                    user_id=user_id,
                    operation="crear",
                    item_id=item_id,
                    item_name=cleaned_name,
                    amount=quantity,
                    before_quantity=None,
                    after_quantity=quantity,
                    after_name=cleaned_name,
                )
                dto = _item_dto(item)
        except IntegrityError as exc:
            raise ItemAlreadyExistsError(item_id) from exc
    return dto


async def add_quantity(
    session_factory: SessionFactory,
    *,
    guild_id: int,
    channel_id: int,
    item_id: int,
    amount: int,
    user_id: int,
) -> QuantityChangeDTO:
    async with session_factory() as session:
        async with session.begin():
            inventory = await _require_inventory(session, guild_id, channel_id, for_update=True)
            result = await session.execute(
                update(InventoryItem)
                .where(
                    InventoryItem.inventory_id == inventory.id,
                    InventoryItem.item_id == item_id,
                )
                .values(
                    quantity=InventoryItem.quantity + amount,
                    updated_by=_as_str(user_id),
                    updated_at=utc_now(),
                )
                .returning(
                    InventoryItem.name.label("item_name"),
                    (InventoryItem.quantity - amount).label("before_quantity"),
                    InventoryItem.quantity.label("after_quantity"),
                )
            )
            row = result.mappings().one_or_none()
            if row is None:
                raise ItemNotFoundError(item_id)

            _touch(inventory)
            _record_history(
                session,
                inventory,
                user_id=user_id,
                operation="sumar",
                item_id=item_id,
                item_name=row["item_name"],
                amount=amount,
                before_quantity=row["before_quantity"],
                after_quantity=row["after_quantity"],
            )

            return QuantityChangeDTO(
                item_id=item_id,
                name=row["item_name"],
                before_quantity=row["before_quantity"],
                after_quantity=row["after_quantity"],
            )


async def subtract_quantity(
    session_factory: SessionFactory,
    *,
    guild_id: int,
    channel_id: int,
    item_id: int,
    amount: int,
    user_id: int,
) -> QuantityChangeDTO:
    async with session_factory() as session:
        async with session.begin():
            inventory = await _require_inventory(session, guild_id, channel_id, for_update=True)
            result = await session.execute(
                update(InventoryItem)
                .where(
                    InventoryItem.inventory_id == inventory.id,
                    InventoryItem.item_id == item_id,
                    InventoryItem.quantity >= amount,
                )
                .values(
                    quantity=InventoryItem.quantity - amount,
                    updated_by=_as_str(user_id),
                    updated_at=utc_now(),
                )
                .returning(
                    InventoryItem.name.label("item_name"),
                    (InventoryItem.quantity + amount).label("before_quantity"),
                    InventoryItem.quantity.label("after_quantity"),
                )
            )
            row = result.mappings().one_or_none()
            if row is None:
                current = await session.execute(
                    select(InventoryItem.quantity).where(
                        InventoryItem.inventory_id == inventory.id,
                        InventoryItem.item_id == item_id,
                    )
                )
                available = current.scalar_one_or_none()
                if available is None:
                    raise ItemNotFoundError(item_id)
                raise InsufficientQuantityError(available)

            _touch(inventory)
            _record_history(
                session,
                inventory,
                user_id=user_id,
                operation="restar",
                item_id=item_id,
                item_name=row["item_name"],
                amount=amount,
                before_quantity=row["before_quantity"],
                after_quantity=row["after_quantity"],
            )

            return QuantityChangeDTO(
                item_id=item_id,
                name=row["item_name"],
                before_quantity=row["before_quantity"],
                after_quantity=row["after_quantity"],
            )


async def edit_item_name(
    session_factory: SessionFactory,
    *,
    guild_id: int,
    channel_id: int,
    item_id: int,
    name: str,
    user_id: int,
) -> InventoryItemDTO:
    cleaned_name = _clean_name(name)
    async with session_factory() as session:
        async with session.begin():
            inventory = await _require_inventory(session, guild_id, channel_id, for_update=True)
            result = await session.execute(
                select(InventoryItem)
                .where(
                    InventoryItem.inventory_id == inventory.id,
                    InventoryItem.item_id == item_id,
                )
                .with_for_update()
            )
            item = result.scalar_one_or_none()
            if item is None:
                raise ItemNotFoundError(item_id)

            before_name = item.name
            item.name = cleaned_name
            item.updated_by = _as_str(user_id)
            item.updated_at = utc_now()
            _touch(inventory)
            _record_history(
                session,
                inventory,
                user_id=user_id,
                operation="editar",
                item_id=item_id,
                item_name=cleaned_name,
                before_quantity=item.quantity,
                after_quantity=item.quantity,
                before_name=before_name,
                after_name=cleaned_name,
            )
            return _item_dto(item)


async def delete_item(
    session_factory: SessionFactory,
    *,
    guild_id: int,
    channel_id: int,
    item_id: int,
    user_id: int,
) -> InventoryItemDTO:
    async with session_factory() as session:
        async with session.begin():
            inventory = await _require_inventory(session, guild_id, channel_id, for_update=True)
            result = await session.execute(
                select(InventoryItem)
                .where(
                    InventoryItem.inventory_id == inventory.id,
                    InventoryItem.item_id == item_id,
                )
                .with_for_update()
            )
            item = result.scalar_one_or_none()
            if item is None:
                raise ItemNotFoundError(item_id)

            dto = _item_dto(item)
            await session.delete(item)
            _touch(inventory)
            _record_history(
                session,
                inventory,
                user_id=user_id,
                operation="borrar",
                item_id=item_id,
                item_name=dto.name,
                before_quantity=dto.quantity,
                after_quantity=None,
                before_name=dto.name,
            )
            return dto


async def list_history(
    session_factory: SessionFactory,
    *,
    guild_id: int,
    channel_id: int,
    limit: int = 10,
) -> list[HistoryEntryDTO]:
    async with session_factory() as session:
        inventory = await _require_inventory(session, guild_id, channel_id)
        result = await session.execute(
            select(InventoryHistory)
            .where(InventoryHistory.inventory_id == inventory.id)
            .order_by(desc(InventoryHistory.created_at), desc(InventoryHistory.id))
            .limit(limit)
        )
        return [
            HistoryEntryDTO(
                created_at=entry.created_at,
                user_id=entry.user_id,
                operation=entry.operation,
                item_id=entry.item_id,
                item_name=entry.item_name,
                amount=entry.amount,
                before_quantity=entry.before_quantity,
                after_quantity=entry.after_quantity,
                before_name=entry.before_name,
                after_name=entry.after_name,
            )
            for entry in result.scalars().all()
        ]

