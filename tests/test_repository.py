import asyncio

import pytest

from inventory_bot.database import create_engine, create_session_factory, initialize_database, normalize_database_url
from inventory_bot.errors import InsufficientQuantityError
from inventory_bot import repository


@pytest.fixture
async def session_factory(tmp_path):
    database_path = tmp_path / "inventory.sqlite3"
    engine = create_engine(f"sqlite+aiosqlite:///{database_path}")
    await initialize_database(engine)
    factory = create_session_factory(engine)
    try:
        yield factory
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_inventory_is_scoped_by_guild_and_channel(session_factory) -> None:
    await repository.create_inventory(
        session_factory,
        guild_id=123,
        channel_id=456,
        name="Alquimia",
        user_id=1,
    )
    await repository.create_item(
        session_factory,
        guild_id=123,
        channel_id=456,
        item_id=1,
        name="Flor de montaña",
        quantity=60,
        user_id=1,
    )

    await repository.create_inventory(
        session_factory,
        guild_id=123,
        channel_id=789,
        name="Leñadores",
        user_id=1,
    )
    await repository.create_item(
        session_factory,
        guild_id=123,
        channel_id=789,
        item_id=1,
        name="Leña",
        quantity=100,
        user_id=1,
    )

    await repository.add_quantity(
        session_factory,
        guild_id=123,
        channel_id=789,
        item_id=1,
        amount=20,
        user_id=2,
    )

    alquimia = await repository.get_inventory_view(session_factory, guild_id=123, channel_id=456)
    lenadores = await repository.get_inventory_view(session_factory, guild_id=123, channel_id=789)

    assert alquimia.items[0].name == "Flor de montaña"
    assert alquimia.items[0].quantity == 60
    assert lenadores.items[0].name == "Leña"
    assert lenadores.items[0].quantity == 120


@pytest.mark.asyncio
async def test_subtract_never_allows_negative_quantity(session_factory) -> None:
    await repository.create_inventory(
        session_factory,
        guild_id=123,
        channel_id=456,
        name="Alquimia",
        user_id=1,
    )
    await repository.create_item(
        session_factory,
        guild_id=123,
        channel_id=456,
        item_id=1,
        name="Flor de montaña",
        quantity=5,
        user_id=1,
    )

    with pytest.raises(InsufficientQuantityError):
        await repository.subtract_quantity(
            session_factory,
            guild_id=123,
            channel_id=456,
            item_id=1,
            amount=10,
            user_id=2,
        )

    view = await repository.get_inventory_view(session_factory, guild_id=123, channel_id=456)
    assert view.items[0].quantity == 5


@pytest.mark.asyncio
async def test_concurrent_additions_do_not_overwrite_each_other(session_factory) -> None:
    await repository.create_inventory(
        session_factory,
        guild_id=123,
        channel_id=456,
        name="Alquimia",
        user_id=1,
    )
    await repository.create_item(
        session_factory,
        guild_id=123,
        channel_id=456,
        item_id=1,
        name="Flor de montaña",
        quantity=50,
        user_id=1,
    )

    await asyncio.gather(
        *[
            repository.add_quantity(
                session_factory,
                guild_id=123,
                channel_id=456,
                item_id=1,
                amount=1,
                user_id=100 + index,
            )
            for index in range(30)
        ]
    )

    view = await repository.get_inventory_view(session_factory, guild_id=123, channel_id=456)
    assert view.items[0].quantity == 80


def test_normalize_external_postgres_sslmode_for_asyncpg() -> None:
    normalized = normalize_database_url("postgresql://user:pass@example.com/db?sslmode=require")

    assert normalized == "postgresql+asyncpg://user:pass@example.com/db?ssl=require"
