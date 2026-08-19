CREATE TABLE IF NOT EXISTS inventories (
    id BIGSERIAL PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    channel_id VARCHAR(32) NOT NULL,
    name VARCHAR(100) NOT NULL,
    message_id VARCHAR(32),
    version INTEGER NOT NULL DEFAULT 0,
    created_by VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_inventory_guild_channel UNIQUE (guild_id, channel_id)
);

CREATE INDEX IF NOT EXISTS ix_inventories_guild_id ON inventories (guild_id);
CREATE INDEX IF NOT EXISTS ix_inventories_channel_id ON inventories (channel_id);

CREATE TABLE IF NOT EXISTS inventory_items (
    id BIGSERIAL PRIMARY KEY,
    inventory_id BIGINT NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    quantity BIGINT NOT NULL DEFAULT 0,
    created_by VARCHAR(32) NOT NULL,
    updated_by VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_inventory_item_id UNIQUE (inventory_id, item_id),
    CONSTRAINT ck_item_id_one_digit CHECK (item_id >= 1 AND item_id <= 9),
    CONSTRAINT ck_item_quantity_non_negative CHECK (quantity >= 0)
);

CREATE INDEX IF NOT EXISTS ix_inventory_items_inventory_id ON inventory_items (inventory_id);

CREATE TABLE IF NOT EXISTS inventory_history (
    id BIGSERIAL PRIMARY KEY,
    inventory_id BIGINT NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
    guild_id VARCHAR(32) NOT NULL,
    channel_id VARCHAR(32) NOT NULL,
    item_id INTEGER,
    item_name VARCHAR(100),
    operation VARCHAR(32) NOT NULL,
    amount BIGINT,
    before_quantity BIGINT,
    after_quantity BIGINT,
    before_name VARCHAR(100),
    after_name VARCHAR(100),
    user_id VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_inventory_history_inventory_id ON inventory_history (inventory_id);
CREATE INDEX IF NOT EXISTS ix_inventory_history_guild_id ON inventory_history (guild_id);
CREATE INDEX IF NOT EXISTS ix_inventory_history_channel_id ON inventory_history (channel_id);
CREATE INDEX IF NOT EXISTS ix_inventory_history_created_at ON inventory_history (created_at);

