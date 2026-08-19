from __future__ import annotations

from pathlib import Path

from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from inventory_bot.models import Base


def normalize_database_url(database_url: str) -> str:
    normalized = database_url
    if database_url.startswith("postgres://"):
        normalized = database_url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif database_url.startswith("postgresql://"):
        normalized = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif database_url.startswith("sqlite:///"):
        normalized = database_url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)

    if normalized.startswith("postgresql+asyncpg://"):
        url = make_url(normalized)
        if "sslmode" in url.query and "ssl" not in url.query:
            query = dict(url.query)
            query["ssl"] = query.pop("sslmode")
            normalized = url.set(query=query).render_as_string(hide_password=False)

    return normalized


def _ensure_sqlite_parent(database_url: str) -> None:
    if not database_url.startswith("sqlite+aiosqlite:///"):
        return

    db_path = database_url.removeprefix("sqlite+aiosqlite:///")
    if db_path in {":memory:", ""}:
        return

    Path(db_path).expanduser().parent.mkdir(parents=True, exist_ok=True)


def create_engine(database_url: str) -> AsyncEngine:
    normalized_url = normalize_database_url(database_url)
    _ensure_sqlite_parent(normalized_url)

    connect_args = {}
    if normalized_url.startswith("sqlite+aiosqlite:"):
        connect_args["timeout"] = 30

    return create_async_engine(
        normalized_url,
        pool_pre_ping=True,
        connect_args=connect_args,
    )


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker:
    return async_sessionmaker(engine, expire_on_commit=False)


async def initialize_database(engine: AsyncEngine) -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
