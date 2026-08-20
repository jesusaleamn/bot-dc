from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Inventory(Base):
    __tablename__ = "inventories"
    __table_args__ = (
        UniqueConstraint("guild_id", "channel_id", name="uq_inventory_guild_channel"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    guild_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    channel_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    message_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )


class InventoryItem(Base):
    __tablename__ = "inventory_items"
    __table_args__ = (
        UniqueConstraint("inventory_id", "item_id", name="uq_inventory_item_id"),
        CheckConstraint("item_id >= 1 AND item_id <= 999", name="ck_item_id_three_digits"),
        CheckConstraint("quantity >= 0", name="ck_item_quantity_non_negative"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    inventory_id: Mapped[int] = mapped_column(ForeignKey("inventories.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    quantity: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    created_by: Mapped[str] = mapped_column(String(32), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )


class InventoryHistory(Base):
    __tablename__ = "inventory_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    inventory_id: Mapped[int] = mapped_column(ForeignKey("inventories.id", ondelete="CASCADE"), nullable=False, index=True)
    guild_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    channel_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    item_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    item_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    operation: Mapped[str] = mapped_column(String(32), nullable=False)
    amount: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    before_quantity: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    after_quantity: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    before_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    after_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    user_id: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)
