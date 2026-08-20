ALTER TABLE inventories
ADD COLUMN IF NOT EXISTS orders_message_id VARCHAR(32);

CREATE TABLE IF NOT EXISTS inventory_orders (
    id BIGSERIAL PRIMARY KEY,
    inventory_id BIGINT NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
    order_no INTEGER NOT NULL,
    requester_user_id VARCHAR(32) NOT NULL,
    item_id INTEGER NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    requested_quantity BIGINT NOT NULL,
    delivered_quantity BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    created_by VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT uq_inventory_order_no UNIQUE (inventory_id, order_no),
    CONSTRAINT ck_order_quantity_positive CHECK (requested_quantity > 0),
    CONSTRAINT ck_order_delivered_non_negative CHECK (delivered_quantity >= 0),
    CONSTRAINT ck_order_status CHECK (status IN ('active', 'completed'))
);

CREATE INDEX IF NOT EXISTS ix_inventory_orders_inventory_id ON inventory_orders (inventory_id);
CREATE INDEX IF NOT EXISTS ix_inventory_orders_status ON inventory_orders (status);
CREATE INDEX IF NOT EXISTS ix_inventory_orders_completed_at ON inventory_orders (completed_at);
