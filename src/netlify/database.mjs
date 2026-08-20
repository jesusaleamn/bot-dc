import { neon } from "@neondatabase/serverless";

import {
  InsufficientQuantityError,
  InventoryAlreadyExistsError,
  InventoryError,
  InventoryNotFoundError,
  ItemAlreadyExistsError,
  ItemNotFoundError,
  OrderNotFoundError,
} from "./errors.mjs";

let sqlClient = null;
let schemaReady = null;

function getSql() {
  if (sqlClient) return sqlClient;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new InventoryError("❌ Falta DATABASE_URL en Netlify.");
  }

  sqlClient = neon(databaseUrl);
  return sqlClient;
}

function cleanName(value) {
  const cleaned = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) {
    throw new InventoryError("❌ El nombre no puede estar vacío.");
  }
  if (cleaned.length > 100) {
    throw new InventoryError("❌ El nombre no puede superar 100 caracteres.");
  }
  return cleaned;
}

function isUniqueViolation(error) {
  return error?.code === "23505" || String(error?.message ?? "").includes("duplicate key");
}

export async function ensureSchema() {
  if (schemaReady) return schemaReady;

  const sql = getSql();
  schemaReady = (async () => {
    await sql`
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
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS ix_inventories_guild_id ON inventories (guild_id)`;
    await sql`CREATE INDEX IF NOT EXISTS ix_inventories_channel_id ON inventories (channel_id)`;
    await sql`ALTER TABLE inventories ADD COLUMN IF NOT EXISTS orders_message_id VARCHAR(32)`;
    await sql`
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
        CONSTRAINT ck_item_id_three_digits CHECK (item_id >= 1 AND item_id <= 999),
        CONSTRAINT ck_item_quantity_non_negative CHECK (quantity >= 0)
      )
    `;
    await sql`ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS ck_item_id_one_digit`;
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'inventory_items'::regclass
            AND conname = 'ck_item_id_three_digits'
        ) THEN
          ALTER TABLE inventory_items
          ADD CONSTRAINT ck_item_id_three_digits CHECK (item_id >= 1 AND item_id <= 999);
        END IF;
      END $$;
    `;
    await sql`CREATE INDEX IF NOT EXISTS ix_inventory_items_inventory_id ON inventory_items (inventory_id)`;
    await sql`
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
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS ix_inventory_history_inventory_id ON inventory_history (inventory_id)`;
    await sql`CREATE INDEX IF NOT EXISTS ix_inventory_history_guild_id ON inventory_history (guild_id)`;
    await sql`CREATE INDEX IF NOT EXISTS ix_inventory_history_channel_id ON inventory_history (channel_id)`;
    await sql`CREATE INDEX IF NOT EXISTS ix_inventory_history_created_at ON inventory_history (created_at)`;
    await sql`
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
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS ix_inventory_orders_inventory_id ON inventory_orders (inventory_id)`;
    await sql`CREATE INDEX IF NOT EXISTS ix_inventory_orders_status ON inventory_orders (status)`;
    await sql`CREATE INDEX IF NOT EXISTS ix_inventory_orders_completed_at ON inventory_orders (completed_at)`;
  })();

  return schemaReady;
}

export async function createInventory({ guildId, channelId, name, userId }) {
  await ensureSchema();
  const sql = getSql();
  const cleanedName = cleanName(name);

  const [row] = await sql`
    WITH inserted AS (
      INSERT INTO inventories (guild_id, channel_id, name, created_by)
      VALUES (${guildId}, ${channelId}, ${cleanedName}, ${userId})
      ON CONFLICT (guild_id, channel_id) DO NOTHING
      RETURNING id, guild_id, channel_id, name, message_id, version
    ),
    history AS (
      INSERT INTO inventory_history (inventory_id, guild_id, channel_id, operation, user_id)
      SELECT id, guild_id, channel_id, 'inventario', ${userId}
      FROM inserted
      RETURNING id
    )
    SELECT id, guild_id, channel_id, name, message_id, orders_message_id, version
    FROM inserted
  `;

  if (!row) {
    throw new InventoryAlreadyExistsError();
  }

  return row;
}

export async function setInventoryMessageId({ guildId, channelId, messageId, userId = null, recordRecreate = false }) {
  await ensureSchema();
  const sql = getSql();

  const [row] = await sql`
    WITH updated AS (
      UPDATE inventories
      SET
        message_id = ${messageId},
        version = version + ${recordRecreate ? 1 : 0},
        updated_at = NOW()
      WHERE guild_id = ${guildId}
        AND channel_id = ${channelId}
      RETURNING id, guild_id, channel_id, name, message_id, version
    ),
    history AS (
      INSERT INTO inventory_history (inventory_id, guild_id, channel_id, operation, user_id)
      SELECT id, guild_id, channel_id, 'recrear_inventario', ${userId ?? "0"}
      FROM updated
      WHERE ${recordRecreate}
      RETURNING id
    )
    SELECT id, guild_id, channel_id, name, message_id, orders_message_id, version
    FROM updated
  `;

  if (!row) {
    throw new InventoryNotFoundError();
  }

  return row;
}

export async function getInventoryView({ guildId, channelId }) {
  await ensureSchema();
  const sql = getSql();
  const [inventory] = await sql`
    SELECT id, guild_id, channel_id, name, message_id, version
    FROM inventories
    WHERE guild_id = ${guildId}
      AND channel_id = ${channelId}
  `;

  if (!inventory) {
    throw new InventoryNotFoundError();
  }

  const items = await sql`
    SELECT item_id, name, quantity
    FROM inventory_items
    WHERE inventory_id = ${inventory.id}
    ORDER BY item_id ASC
  `;

  return {
    inventory,
    items: items.map((item) => ({
      item_id: Number(item.item_id),
      name: item.name,
      quantity: Number(item.quantity),
    })),
  };
}

export async function getInventoryVersion({ guildId, channelId }) {
  await ensureSchema();
  const sql = getSql();
  const [row] = await sql`
    SELECT version
    FROM inventories
    WHERE guild_id = ${guildId}
      AND channel_id = ${channelId}
  `;
  if (!row) {
    throw new InventoryNotFoundError();
  }
  return Number(row.version);
}

export async function createItem({ guildId, channelId, itemId, name, quantity, userId }) {
  await ensureSchema();
  const sql = getSql();
  const cleanedName = cleanName(name);

  try {
    const [row] = await sql`
      WITH inv AS (
        SELECT id, guild_id, channel_id
        FROM inventories
        WHERE guild_id = ${guildId}
          AND channel_id = ${channelId}
      ),
      inserted AS (
        INSERT INTO inventory_items (inventory_id, item_id, name, quantity, created_by, updated_by)
        SELECT id, ${itemId}, ${cleanedName}, ${quantity}, ${userId}, ${userId}
        FROM inv
        RETURNING inventory_id, item_id, name, quantity
      ),
      touched AS (
        UPDATE inventories
        SET version = version + 1, updated_at = NOW()
        WHERE id = (SELECT inventory_id FROM inserted)
        RETURNING id, guild_id, channel_id
      ),
      history AS (
        INSERT INTO inventory_history (
          inventory_id, guild_id, channel_id, item_id, item_name, operation,
          amount, after_quantity, after_name, user_id
        )
        SELECT touched.id, touched.guild_id, touched.channel_id, inserted.item_id, inserted.name,
          'crear', inserted.quantity, inserted.quantity, inserted.name, ${userId}
        FROM touched, inserted
        RETURNING id
      )
      SELECT item_id, name, quantity
      FROM inserted
    `;

    if (!row) {
      throw new InventoryNotFoundError();
    }

    return {
      item_id: Number(row.item_id),
      name: row.name,
      quantity: Number(row.quantity),
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ItemAlreadyExistsError(itemId);
    }
    throw error;
  }
}

export async function addQuantity({ guildId, channelId, itemId, amount, userId }) {
  await ensureSchema();
  const sql = getSql();

  const [row] = await sql`
    WITH updated AS (
      UPDATE inventory_items item
      SET
        quantity = item.quantity + ${amount},
        updated_by = ${userId},
        updated_at = NOW()
      FROM inventories inv
      WHERE item.inventory_id = inv.id
        AND inv.guild_id = ${guildId}
        AND inv.channel_id = ${channelId}
        AND item.item_id = ${itemId}
      RETURNING
        inv.id AS inventory_id,
        inv.guild_id AS guild_id,
        inv.channel_id AS channel_id,
        item.item_id AS item_id,
        item.name AS name,
        item.quantity - ${amount} AS before_quantity,
        item.quantity AS after_quantity
    ),
    touched AS (
      UPDATE inventories
      SET version = version + 1, updated_at = NOW()
      WHERE id = (SELECT inventory_id FROM updated)
      RETURNING version
    ),
    history AS (
      INSERT INTO inventory_history (
        inventory_id, guild_id, channel_id, item_id, item_name, operation,
        amount, before_quantity, after_quantity, user_id
      )
      SELECT inventory_id, guild_id, channel_id, item_id, name, 'sumar',
        ${amount}, before_quantity, after_quantity, ${userId}
      FROM updated
      RETURNING id
    )
    SELECT updated.item_id, updated.name, updated.before_quantity, updated.after_quantity, touched.version
    FROM updated, touched
  `;

  if (!row) {
    await requireInventory({ guildId, channelId });
    throw new ItemNotFoundError(itemId);
  }

  return normalizeChange(row);
}

export async function subtractQuantity({ guildId, channelId, itemId, amount, userId }) {
  await ensureSchema();
  const sql = getSql();

  const [row] = await sql`
    WITH updated AS (
      UPDATE inventory_items item
      SET
        quantity = item.quantity - ${amount},
        updated_by = ${userId},
        updated_at = NOW()
      FROM inventories inv
      WHERE item.inventory_id = inv.id
        AND inv.guild_id = ${guildId}
        AND inv.channel_id = ${channelId}
        AND item.item_id = ${itemId}
        AND item.quantity >= ${amount}
      RETURNING
        inv.id AS inventory_id,
        inv.guild_id AS guild_id,
        inv.channel_id AS channel_id,
        item.item_id AS item_id,
        item.name AS name,
        item.quantity + ${amount} AS before_quantity,
        item.quantity AS after_quantity
    ),
    touched AS (
      UPDATE inventories
      SET version = version + 1, updated_at = NOW()
      WHERE id = (SELECT inventory_id FROM updated)
      RETURNING version
    ),
    history AS (
      INSERT INTO inventory_history (
        inventory_id, guild_id, channel_id, item_id, item_name, operation,
        amount, before_quantity, after_quantity, user_id
      )
      SELECT inventory_id, guild_id, channel_id, item_id, name, 'restar',
        ${amount}, before_quantity, after_quantity, ${userId}
      FROM updated
      RETURNING id
    )
    SELECT updated.item_id, updated.name, updated.before_quantity, updated.after_quantity, touched.version
    FROM updated, touched
  `;

  if (!row) {
    const item = await getItemQuantity({ guildId, channelId, itemId });
    if (!item) {
      await requireInventory({ guildId, channelId });
      throw new ItemNotFoundError(itemId);
    }
    throw new InsufficientQuantityError(Number(item.quantity));
  }

  return normalizeChange(row);
}

export async function editItemName({ guildId, channelId, itemId, name, userId }) {
  await ensureSchema();
  const sql = getSql();
  const cleanedName = cleanName(name);

  const [row] = await sql`
    WITH target AS (
      SELECT
        item.id AS row_id,
        item.item_id AS item_id,
        item.name AS before_name,
        item.quantity AS quantity,
        inv.id AS inventory_id,
        inv.guild_id AS guild_id,
        inv.channel_id AS channel_id
      FROM inventory_items item
      JOIN inventories inv ON inv.id = item.inventory_id
      WHERE inv.guild_id = ${guildId}
        AND inv.channel_id = ${channelId}
        AND item.item_id = ${itemId}
    ),
    updated AS (
      UPDATE inventory_items item
      SET name = ${cleanedName}, updated_by = ${userId}, updated_at = NOW()
      FROM target
      WHERE item.id = target.row_id
      RETURNING
        target.inventory_id,
        target.guild_id,
        target.channel_id,
        target.item_id,
        target.before_name,
        item.name,
        item.quantity
    ),
    touched AS (
      UPDATE inventories
      SET version = version + 1, updated_at = NOW()
      WHERE id = (SELECT inventory_id FROM updated)
      RETURNING version
    ),
    history AS (
      INSERT INTO inventory_history (
        inventory_id, guild_id, channel_id, item_id, item_name, operation,
        before_quantity, after_quantity, before_name, after_name, user_id
      )
      SELECT inventory_id, guild_id, channel_id, item_id, name, 'editar',
        quantity, quantity, before_name, name, ${userId}
      FROM updated
      RETURNING id
    )
    SELECT item_id, name, quantity, touched.version
    FROM updated, touched
  `;

  if (!row) {
    await requireInventory({ guildId, channelId });
    throw new ItemNotFoundError(itemId);
  }

  return {
    item_id: Number(row.item_id),
    name: row.name,
    quantity: Number(row.quantity),
  };
}

export async function deleteItem({ guildId, channelId, itemId, userId }) {
  await ensureSchema();
  const sql = getSql();

  const [row] = await sql`
    WITH target AS (
      SELECT
        item.id AS row_id,
        item.item_id AS item_id,
        item.name AS name,
        item.quantity AS quantity,
        inv.id AS inventory_id,
        inv.guild_id AS guild_id,
        inv.channel_id AS channel_id
      FROM inventory_items item
      JOIN inventories inv ON inv.id = item.inventory_id
      WHERE inv.guild_id = ${guildId}
        AND inv.channel_id = ${channelId}
        AND item.item_id = ${itemId}
    ),
    deleted AS (
      DELETE FROM inventory_items item
      USING target
      WHERE item.id = target.row_id
      RETURNING
        target.inventory_id,
        target.guild_id,
        target.channel_id,
        target.item_id,
        target.name,
        target.quantity
    ),
    touched AS (
      UPDATE inventories
      SET version = version + 1, updated_at = NOW()
      WHERE id = (SELECT inventory_id FROM deleted)
      RETURNING version
    ),
    history AS (
      INSERT INTO inventory_history (
        inventory_id, guild_id, channel_id, item_id, item_name, operation,
        before_quantity, before_name, user_id
      )
      SELECT inventory_id, guild_id, channel_id, item_id, name, 'borrar',
        quantity, name, ${userId}
      FROM deleted
      RETURNING id
    )
    SELECT item_id, name, quantity, touched.version
    FROM deleted, touched
  `;

  if (!row) {
    await requireInventory({ guildId, channelId });
    throw new ItemNotFoundError(itemId);
  }

  return {
    item_id: Number(row.item_id),
    name: row.name,
    quantity: Number(row.quantity),
  };
}

export async function setOrdersMessageId({ guildId, channelId, messageId }) {
  await ensureSchema();
  const sql = getSql();

  const [row] = await sql`
    UPDATE inventories
    SET orders_message_id = ${messageId}, updated_at = NOW()
    WHERE guild_id = ${guildId}
      AND channel_id = ${channelId}
    RETURNING id, guild_id, channel_id, name, orders_message_id
  `;

  if (!row) {
    throw new InventoryNotFoundError();
  }

  return row;
}

export async function getOrdersView({ guildId, channelId }) {
  await ensureSchema();
  const sql = getSql();
  const inventory = await requireInventory({ guildId, channelId });

  const activeOrders = await sql`
    SELECT
      order_no,
      requester_user_id,
      item_id,
      item_name,
      requested_quantity,
      delivered_quantity,
      created_at
    FROM inventory_orders
    WHERE inventory_id = ${inventory.id}
      AND status = 'active'
    ORDER BY order_no ASC
  `;

  const [stats] = await sql`
    SELECT
      COUNT(*) FILTER (
        WHERE status = 'completed'
          AND completed_at >= date_trunc('week', NOW())
      ) AS completed_this_week,
      COUNT(*) FILTER (WHERE status = 'completed') AS completed_total
    FROM inventory_orders
    WHERE inventory_id = ${inventory.id}
  `;

  return {
    inventory,
    orders: activeOrders.map(normalizeOrder),
    completedThisWeek: Number(stats?.completed_this_week ?? 0),
    completedTotal: Number(stats?.completed_total ?? 0),
  };
}

export async function createOrder({ guildId, channelId, itemId, quantity, requesterUserId, userId }) {
  await ensureSchema();
  const sql = getSql();

  const [row] = await sql`
    WITH inv AS (
      SELECT id, guild_id, channel_id
      FROM inventories
      WHERE guild_id = ${guildId}
        AND channel_id = ${channelId}
    ),
    item AS (
      SELECT item_id, name
      FROM inventory_items
      WHERE inventory_id = (SELECT id FROM inv)
        AND item_id = ${itemId}
    ),
    next_order AS (
      SELECT COALESCE(MAX(order_no), 0) + 1 AS order_no
      FROM inventory_orders
      WHERE inventory_id = (SELECT id FROM inv)
    ),
    inserted AS (
      INSERT INTO inventory_orders (
        inventory_id,
        order_no,
        requester_user_id,
        item_id,
        item_name,
        requested_quantity,
        created_by
      )
      SELECT
        inv.id,
        next_order.order_no,
        ${requesterUserId},
        item.item_id,
        item.name,
        ${quantity},
        ${userId}
      FROM inv, item, next_order
      RETURNING
        order_no,
        requester_user_id,
        item_id,
        item_name,
        requested_quantity,
        delivered_quantity,
        created_at
    )
    SELECT *
    FROM inserted
  `;

  if (!row) {
    await requireInventory({ guildId, channelId });
    throw new ItemNotFoundError(itemId);
  }

  return normalizeOrder(row);
}

export async function deliverOrder({ guildId, channelId, orderNo, amount }) {
  await ensureSchema();
  const sql = getSql();

  const [row] = await sql`
    WITH target AS (
      SELECT
        order_row.id AS row_id,
        order_row.requested_quantity,
        order_row.delivered_quantity
      FROM inventory_orders order_row
      JOIN inventories inv ON inv.id = order_row.inventory_id
      WHERE inv.guild_id = ${guildId}
        AND inv.channel_id = ${channelId}
        AND order_row.order_no = ${orderNo}
        AND order_row.status = 'active'
    ),
    updated AS (
      UPDATE inventory_orders order_row
      SET
        delivered_quantity = LEAST(target.requested_quantity, target.delivered_quantity + ${amount}),
        status = CASE
          WHEN target.delivered_quantity + ${amount} >= target.requested_quantity THEN 'completed'
          ELSE 'active'
        END,
        completed_at = CASE
          WHEN target.delivered_quantity + ${amount} >= target.requested_quantity THEN NOW()
          ELSE order_row.completed_at
        END,
        updated_at = NOW()
      FROM target
      WHERE order_row.id = target.row_id
      RETURNING
        order_row.order_no,
        order_row.requester_user_id,
        order_row.item_id,
        order_row.item_name,
        order_row.requested_quantity,
        order_row.delivered_quantity,
        order_row.status,
        order_row.created_at,
        order_row.completed_at
    )
    SELECT *
    FROM updated
  `;

  if (!row) {
    await requireInventory({ guildId, channelId });
    throw new OrderNotFoundError(orderNo);
  }

  return normalizeOrder(row);
}

export async function completeOrder({ guildId, channelId, orderNo }) {
  await ensureSchema();
  const sql = getSql();

  const [row] = await sql`
    WITH target AS (
      SELECT order_row.id AS row_id
      FROM inventory_orders order_row
      JOIN inventories inv ON inv.id = order_row.inventory_id
      WHERE inv.guild_id = ${guildId}
        AND inv.channel_id = ${channelId}
        AND order_row.order_no = ${orderNo}
        AND order_row.status = 'active'
    ),
    updated AS (
      UPDATE inventory_orders order_row
      SET
        delivered_quantity = requested_quantity,
        status = 'completed',
        completed_at = NOW(),
        updated_at = NOW()
      FROM target
      WHERE order_row.id = target.row_id
      RETURNING
        order_row.order_no,
        order_row.requester_user_id,
        order_row.item_id,
        order_row.item_name,
        order_row.requested_quantity,
        order_row.delivered_quantity,
        order_row.status,
        order_row.created_at,
        order_row.completed_at
    )
    SELECT *
    FROM updated
  `;

  if (!row) {
    await requireInventory({ guildId, channelId });
    throw new OrderNotFoundError(orderNo);
  }

  return normalizeOrder(row);
}

export async function listCompletedOrders({ guildId, channelId, limit = 10 }) {
  await ensureSchema();
  const sql = getSql();
  const inventory = await requireInventory({ guildId, channelId });

  const rows = await sql`
    SELECT
      order_no,
      requester_user_id,
      item_id,
      item_name,
      requested_quantity,
      delivered_quantity,
      status,
      created_at,
      completed_at
    FROM inventory_orders
    WHERE inventory_id = ${inventory.id}
      AND status = 'completed'
    ORDER BY completed_at DESC, order_no DESC
    LIMIT ${limit}
  `;

  return rows.map(normalizeOrder);
}

export async function listActivitySummary({ guildId, channelId, userId = null, itemId = null, limit = 12 }) {
  await ensureSchema();
  const sql = getSql();
  const inventory = await requireInventory({ guildId, channelId });

  const rows = await sql`
    SELECT
      user_id,
      item_id,
      COALESCE(
        (array_agg(item_name ORDER BY created_at DESC) FILTER (WHERE item_name IS NOT NULL))[1],
        'Material'
      ) AS item_name,
      COALESCE(SUM(amount) FILTER (WHERE operation = 'sumar'), 0) AS total_added,
      COALESCE(SUM(amount) FILTER (WHERE operation = 'restar'), 0) AS total_removed,
      COUNT(*) FILTER (WHERE operation = 'sumar') AS add_count,
      COUNT(*) FILTER (WHERE operation = 'restar') AS subtract_count
    FROM inventory_history
    WHERE inventory_id = ${inventory.id}
      AND operation IN ('sumar', 'restar')
      AND (${userId}::text IS NULL OR user_id = ${userId})
      AND (${itemId}::integer IS NULL OR item_id = ${itemId})
    GROUP BY user_id, item_id
    ORDER BY ABS(
      COALESCE(SUM(amount) FILTER (WHERE operation = 'sumar'), 0)
      - COALESCE(SUM(amount) FILTER (WHERE operation = 'restar'), 0)
    ) DESC,
    item_id ASC,
    user_id ASC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    user_id: row.user_id,
    item_id: Number(row.item_id),
    item_name: row.item_name,
    total_added: Number(row.total_added),
    total_removed: Number(row.total_removed),
    add_count: Number(row.add_count),
    subtract_count: Number(row.subtract_count),
  }));
}

export async function listHistory({ guildId, channelId, limit = 10 }) {
  await ensureSchema();
  const sql = getSql();
  const inventory = await requireInventory({ guildId, channelId });

  const rows = await sql`
    SELECT
      created_at,
      user_id,
      operation,
      item_id,
      item_name,
      amount,
      before_quantity,
      after_quantity,
      before_name,
      after_name
    FROM inventory_history
    WHERE inventory_id = ${inventory.id}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    ...row,
    item_id: row.item_id === null ? null : Number(row.item_id),
    amount: row.amount === null ? null : Number(row.amount),
    before_quantity: row.before_quantity === null ? null : Number(row.before_quantity),
    after_quantity: row.after_quantity === null ? null : Number(row.after_quantity),
  }));
}

async function requireInventory({ guildId, channelId }) {
  const sql = getSql();
  const [inventory] = await sql`
    SELECT id, guild_id, channel_id, name, message_id, version
    FROM inventories
    WHERE guild_id = ${guildId}
      AND channel_id = ${channelId}
  `;

  if (!inventory) {
    throw new InventoryNotFoundError();
  }

  return inventory;
}

async function getItemQuantity({ guildId, channelId, itemId }) {
  const sql = getSql();
  const [row] = await sql`
    SELECT item.quantity
    FROM inventory_items item
    JOIN inventories inv ON inv.id = item.inventory_id
    WHERE inv.guild_id = ${guildId}
      AND inv.channel_id = ${channelId}
      AND item.item_id = ${itemId}
  `;
  return row ?? null;
}

function normalizeChange(row) {
  return {
    item_id: Number(row.item_id),
    name: row.name,
    before_quantity: Number(row.before_quantity),
    after_quantity: Number(row.after_quantity),
    version: Number(row.version),
  };
}

function normalizeOrder(row) {
  return {
    order_no: Number(row.order_no),
    requester_user_id: row.requester_user_id,
    item_id: Number(row.item_id),
    item_name: row.item_name,
    requested_quantity: Number(row.requested_quantity),
    delivered_quantity: Number(row.delivered_quantity),
    status: row.status ?? "active",
    created_at: row.created_at,
    completed_at: row.completed_at ?? null,
  };
}
