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
    await sql`ALTER TABLE inventories ADD COLUMN IF NOT EXISTS table_id INTEGER`;
    await sql`
      WITH guild_offsets AS (
        SELECT guild_id, COALESCE(MAX(table_id), 100) AS max_table_id
        FROM inventories
        GROUP BY guild_id
      ),
      numbered AS (
        SELECT
          inv.id,
          guild_offsets.max_table_id
            + ROW_NUMBER() OVER (PARTITION BY inv.guild_id ORDER BY inv.created_at ASC, inv.id ASC) AS next_table_id
        FROM inventories inv
        JOIN guild_offsets ON guild_offsets.guild_id = inv.guild_id
        WHERE inv.table_id IS NULL
      )
      UPDATE inventories inv
      SET table_id = numbered.next_table_id
      FROM numbered
      WHERE inv.id = numbered.id
    `;
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'inventories'::regclass
            AND conname = 'ck_inventory_table_id'
        ) THEN
          ALTER TABLE inventories
          ADD CONSTRAINT ck_inventory_table_id CHECK (table_id IS NULL OR table_id >= 101);
        END IF;
      END $$;
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_inventories_guild_table_id
      ON inventories (guild_id, table_id)
      WHERE table_id IS NOT NULL
    `;
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
    await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS priority VARCHAR(16) NOT NULL DEFAULT 'none'`;
    await sql`UPDATE inventory_items SET priority = 'none' WHERE priority IS NULL`;
    await sql`ALTER TABLE inventory_items ALTER COLUMN priority SET DEFAULT 'none'`;
    await sql`ALTER TABLE inventory_items ALTER COLUMN priority SET NOT NULL`;
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'inventory_items'::regclass
            AND conname = 'ck_inventory_item_priority'
        ) THEN
          ALTER TABLE inventory_items
          ADD CONSTRAINT ck_inventory_item_priority CHECK (priority IN ('none', 'high', 'medium', 'low'));
        END IF;
      END $$;
    `;
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
    await sql`
      CREATE TABLE IF NOT EXISTS inventory_order_boards (
        id BIGSERIAL PRIMARY KEY,
        guild_id VARCHAR(32) NOT NULL,
        board_channel_id VARCHAR(32) NOT NULL,
        inventory_id BIGINT NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
        message_id VARCHAR(32),
        created_by VARCHAR(32) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_inventory_order_board_channel UNIQUE (guild_id, board_channel_id)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS ix_inventory_order_boards_inventory_id ON inventory_order_boards (inventory_id)`;
    await sql`CREATE INDEX IF NOT EXISTS ix_inventory_order_boards_guild_id ON inventory_order_boards (guild_id)`;
    await sql`
      INSERT INTO inventory_order_boards (guild_id, board_channel_id, inventory_id, message_id, created_by)
      SELECT guild_id, channel_id, id, orders_message_id, created_by
      FROM inventories
      WHERE orders_message_id IS NOT NULL
      ON CONFLICT (guild_id, board_channel_id) DO UPDATE
      SET
        inventory_id = EXCLUDED.inventory_id,
        message_id = COALESCE(inventory_order_boards.message_id, EXCLUDED.message_id),
        updated_at = NOW()
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS inventory_general_boards (
        id BIGSERIAL PRIMARY KEY,
        guild_id VARCHAR(32) NOT NULL,
        channel_id VARCHAR(32) NOT NULL,
        message_id VARCHAR(32),
        created_by VARCHAR(32) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_inventory_general_board_channel UNIQUE (guild_id, channel_id)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS ix_inventory_general_boards_guild_id ON inventory_general_boards (guild_id)`;
    await sql`
      CREATE TABLE IF NOT EXISTS inventory_general_board_messages (
        id BIGSERIAL PRIMARY KEY,
        guild_id VARCHAR(32) NOT NULL,
        channel_id VARCHAR(32) NOT NULL,
        position INTEGER NOT NULL,
        message_id VARCHAR(32) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_inventory_general_board_message_position UNIQUE (guild_id, channel_id, position),
        CONSTRAINT ck_inventory_general_board_message_position CHECK (position >= 0)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS ix_inventory_general_board_messages_guild_id ON inventory_general_board_messages (guild_id)`;
    await sql`
      INSERT INTO inventory_general_board_messages (guild_id, channel_id, position, message_id)
      SELECT guild_id, channel_id, 0, message_id
      FROM inventory_general_boards
      WHERE message_id IS NOT NULL
      ON CONFLICT (guild_id, channel_id, position) DO UPDATE
      SET message_id = EXCLUDED.message_id, updated_at = NOW()
    `;
  })();

  return schemaReady;
}

export async function createInventory({ guildId, channelId, name, userId }) {
  await ensureSchema();
  const sql = getSql();
  const cleanedName = cleanName(name);

  const [row] = await sql`
    WITH next_table AS (
      SELECT COALESCE(MAX(table_id), 100) + 1 AS table_id
      FROM inventories
      WHERE guild_id = ${guildId}
    ),
    inserted AS (
      INSERT INTO inventories (guild_id, channel_id, table_id, name, created_by)
      SELECT ${guildId}, ${channelId}, next_table.table_id, ${cleanedName}, ${userId}
      FROM next_table
      ON CONFLICT (guild_id, channel_id) DO NOTHING
      RETURNING id, guild_id, channel_id, table_id, name, message_id, orders_message_id, version
    ),
    history AS (
      INSERT INTO inventory_history (inventory_id, guild_id, channel_id, operation, user_id)
      SELECT id, guild_id, channel_id, 'inventario', ${userId}
      FROM inserted
      RETURNING id
    )
    SELECT id, guild_id, channel_id, table_id, name, message_id, orders_message_id, version
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
      RETURNING id, guild_id, channel_id, table_id, name, message_id, orders_message_id, version
    ),
    history AS (
      INSERT INTO inventory_history (inventory_id, guild_id, channel_id, operation, user_id)
      SELECT id, guild_id, channel_id, 'recrear_inventario', ${userId ?? "0"}
      FROM updated
      WHERE ${recordRecreate}
      RETURNING id
    )
    SELECT id, guild_id, channel_id, table_id, name, message_id, orders_message_id, version
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
    SELECT id, guild_id, channel_id, table_id, name, message_id, version
    FROM inventories
    WHERE guild_id = ${guildId}
      AND channel_id = ${channelId}
  `;

  if (!inventory) {
    throw new InventoryNotFoundError();
  }

  const items = await sql`
    SELECT item_id, name, quantity, priority
    FROM inventory_items
    WHERE inventory_id = ${inventory.id}
    ORDER BY item_id ASC
  `;

  return {
    inventory,
    items: items.map(normalizeItem),
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

export async function getInventoryByTableId({ guildId, tableId }) {
  await ensureSchema();
  const inventory = await requireInventoryByTableId({ guildId, tableId });
  return inventory;
}

export async function getGeneralInventoryView({ guildId }) {
  await ensureSchema();
  const sql = getSql();

  const inventories = await sql`
    SELECT id, guild_id, channel_id, table_id, name, message_id, version
    FROM inventories
    WHERE guild_id = ${guildId}
    ORDER BY table_id ASC, created_at ASC, id ASC
  `;

  if (!inventories.length) {
    return { inventories: [] };
  }

  const items = await sql`
    SELECT
      inv.id AS inventory_id,
      item.item_id,
      item.name,
      item.quantity,
      item.priority
    FROM inventory_items item
    JOIN inventories inv ON inv.id = item.inventory_id
    WHERE inv.guild_id = ${guildId}
    ORDER BY inv.table_id ASC, item.item_id ASC
  `;

  const itemsByInventory = new Map();
  for (const item of items) {
    const inventoryItems = itemsByInventory.get(String(item.inventory_id)) ?? [];
    inventoryItems.push(normalizeItem(item));
    itemsByInventory.set(String(item.inventory_id), inventoryItems);
  }

  return {
    inventories: inventories.map((inventory) => ({
      ...inventory,
      items: itemsByInventory.get(String(inventory.id)) ?? [],
    })),
  };
}

export async function getGeneralBoard({ guildId, channelId }) {
  await ensureSchema();
  const sql = getSql();

  const [board] = await sql`
    SELECT channel_id, message_id
    FROM inventory_general_boards
    WHERE guild_id = ${guildId}
      AND channel_id = ${channelId}
  `;

  return board
    ? {
        channelId: board.channel_id,
        messageId: board.message_id,
      }
    : null;
}

export async function getGeneralBoards({ guildId }) {
  await ensureSchema();
  const sql = getSql();

  const rows = await sql`
    SELECT DISTINCT channel_id
    FROM inventory_general_boards
    WHERE guild_id = ${guildId}
    UNION
    SELECT DISTINCT channel_id
    FROM inventory_general_board_messages
    WHERE guild_id = ${guildId}
    ORDER BY channel_id ASC
  `;

  return rows.map((row) => ({
    channelId: row.channel_id,
  }));
}

export async function getGeneralBoardMessages({ guildId, channelId }) {
  await ensureSchema();
  const sql = getSql();

  const rows = await sql`
    SELECT position, message_id
    FROM inventory_general_board_messages
    WHERE guild_id = ${guildId}
      AND channel_id = ${channelId}
    ORDER BY position ASC
  `;

  return rows.map((row) => ({
    position: Number(row.position),
    messageId: row.message_id,
  }));
}

export async function setGeneralBoardMessageId({ guildId, channelId, messageId, userId, position = 0 }) {
  await ensureSchema();
  const sql = getSql();

  await sql`
    INSERT INTO inventory_general_boards (guild_id, channel_id, message_id, created_by)
    VALUES (${guildId}, ${channelId}, ${messageId}, ${userId})
    ON CONFLICT (guild_id, channel_id) DO UPDATE
    SET
      message_id = CASE WHEN ${position} = 0 THEN EXCLUDED.message_id ELSE inventory_general_boards.message_id END,
      updated_at = NOW()
  `;

  const [message] = await sql`
    INSERT INTO inventory_general_board_messages (guild_id, channel_id, position, message_id)
    VALUES (${guildId}, ${channelId}, ${position}, ${messageId})
    ON CONFLICT (guild_id, channel_id, position) DO UPDATE
    SET message_id = EXCLUDED.message_id, updated_at = NOW()
    RETURNING position, message_id
  `;

  return {
    channelId,
    position: Number(message.position),
    messageId: message.message_id,
  };
}

export async function deleteGeneralBoardMessage({ guildId, channelId, position }) {
  await ensureSchema();
  const sql = getSql();

  await sql`
    DELETE FROM inventory_general_board_messages
    WHERE guild_id = ${guildId}
      AND channel_id = ${channelId}
      AND position = ${position}
  `;
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
        RETURNING inventory_id, item_id, name, quantity, priority
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
      SELECT item_id, name, quantity, priority
      FROM inserted
    `;

    if (!row) {
      throw new InventoryNotFoundError();
    }

    return normalizeItem(row);
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
        item.quantity,
        item.priority
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
    SELECT item_id, name, quantity, priority, touched.version
    FROM updated, touched
  `;

  if (!row) {
    await requireInventory({ guildId, channelId });
    throw new ItemNotFoundError(itemId);
  }

  return normalizeItem(row);
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
        item.priority AS priority,
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
        target.quantity,
        target.priority
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
    SELECT item_id, name, quantity, priority, touched.version
    FROM deleted, touched
  `;

  if (!row) {
    await requireInventory({ guildId, channelId });
    throw new ItemNotFoundError(itemId);
  }

  return normalizeItem(row);
}

export async function setItemPriority({ guildId, channelId, itemId, priority, userId }) {
  await ensureSchema();
  const sql = getSql();
  const normalizedPriority = normalizePriority(priority);

  const [row] = await sql`
    WITH target AS (
      SELECT
        item.id AS row_id,
        item.item_id AS item_id,
        item.name AS name,
        item.quantity AS quantity,
        item.priority AS before_priority,
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
      SET priority = ${normalizedPriority}, updated_by = ${userId}, updated_at = NOW()
      FROM target
      WHERE item.id = target.row_id
      RETURNING
        target.inventory_id,
        target.guild_id,
        target.channel_id,
        target.item_id,
        item.name,
        item.quantity,
        target.before_priority,
        item.priority
    ),
    touched AS (
      UPDATE inventories
      SET version = version + 1, updated_at = NOW()
      WHERE id = (SELECT inventory_id FROM updated)
      RETURNING version
    ),
    history AS (
      INSERT INTO inventory_history (
        inventory_id, guild_id, channel_id, item_id, item_name, operation, before_name, after_name, user_id
      )
      SELECT inventory_id, guild_id, channel_id, item_id, name, 'prioridad',
        before_priority, priority, ${userId}
      FROM updated
      RETURNING id
    )
    SELECT item_id, name, quantity, priority, touched.version
    FROM updated, touched
  `;

  if (!row) {
    await requireInventory({ guildId, channelId });
    throw new ItemNotFoundError(itemId);
  }

  return normalizeItem(row);
}

export async function linkOrdersBoard({ guildId, boardChannelId, inventoryChannelId, userId }) {
  await ensureSchema();
  const inventory = await requireInventory({ guildId, channelId: inventoryChannelId });

  await upsertOrderBoard({
    guildId,
    boardChannelId,
    inventoryId: inventory.id,
    userId,
  });

  return getOrdersView({ guildId, channelId: boardChannelId });
}

export async function getOrdersView({ guildId, channelId }) {
  await ensureSchema();
  const sql = getSql();
  const inventory = await resolveOrderInventory({ guildId, channelId });

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
    board: {
      channelId: inventory.orders_channel_id,
      messageId: inventory.orders_message_id,
    },
    orders: activeOrders.map(normalizeOrder),
    completedThisWeek: Number(stats?.completed_this_week ?? 0),
    completedTotal: Number(stats?.completed_total ?? 0),
  };
}

export async function getOrderBoardsForInventory({ inventoryId }) {
  await ensureSchema();
  const sql = getSql();

  const rows = await sql`
    SELECT board_channel_id, message_id
    FROM inventory_order_boards
    WHERE inventory_id = ${inventoryId}
      AND message_id IS NOT NULL
    ORDER BY board_channel_id ASC
  `;

  return rows.map((row) => ({
    channelId: row.board_channel_id,
    messageId: row.message_id,
  }));
}

export async function setOrdersMessageId({ guildId, channelId, inventoryId = null, messageId, userId = null }) {
  await ensureSchema();
  const inventory = inventoryId
    ? await requireInventoryById({ guildId, inventoryId })
    : await resolveOrderInventory({ guildId, channelId });

  const board = await upsertOrderBoard({
    guildId,
    boardChannelId: channelId,
    inventoryId: inventory.id,
    messageId,
    userId,
  });

  if (channelId === inventory.channel_id) {
    const sql = getSql();
    await sql`
      UPDATE inventories
      SET orders_message_id = ${messageId}, updated_at = NOW()
      WHERE id = ${inventory.id}
    `;
  }

  return {
    ...inventory,
    orders_channel_id: board.board_channel_id,
    orders_message_id: board.message_id,
  };
}

export async function createOrder({ guildId, channelId, itemId, quantity, requesterUserId, userId }) {
  await ensureSchema();
  const sql = getSql();
  const inventory = await resolveOrderInventory({ guildId, channelId });

  const [row] = await sql`
    WITH item AS (
      SELECT item_id, name
      FROM inventory_items
      WHERE inventory_id = ${inventory.id}
        AND item_id = ${itemId}
    ),
    next_order AS (
      SELECT COALESCE(MAX(order_no), 0) + 1 AS order_no
      FROM inventory_orders
      WHERE inventory_id = ${inventory.id}
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
        ${inventory.id},
        next_order.order_no,
        ${requesterUserId},
        item.item_id,
        item.name,
        ${quantity},
        ${userId}
      FROM item, next_order
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
    throw new ItemNotFoundError(itemId);
  }

  return normalizeOrder(row);
}

export async function deliverOrder({ guildId, channelId, orderNo, amount }) {
  await ensureSchema();
  const sql = getSql();
  const inventory = await resolveOrderInventory({ guildId, channelId });

  const [row] = await sql`
    WITH target AS (
      SELECT
        order_row.id AS row_id,
        order_row.requested_quantity,
        order_row.delivered_quantity
      FROM inventory_orders order_row
      WHERE order_row.inventory_id = ${inventory.id}
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
    throw new OrderNotFoundError(orderNo);
  }

  return normalizeOrder(row);
}

export async function completeOrder({ guildId, channelId, orderNo }) {
  await ensureSchema();
  const sql = getSql();
  const inventory = await resolveOrderInventory({ guildId, channelId });

  const [row] = await sql`
    WITH target AS (
      SELECT order_row.id AS row_id
      FROM inventory_orders order_row
      WHERE order_row.inventory_id = ${inventory.id}
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
    throw new OrderNotFoundError(orderNo);
  }

  return normalizeOrder(row);
}

export async function listCompletedOrders({ guildId, channelId, limit = 10 }) {
  await ensureSchema();
  const sql = getSql();
  const inventory = await resolveOrderInventory({ guildId, channelId });

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
  const inventory = await resolveOrderInventory({ guildId, channelId });

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

async function resolveOrderInventory({ guildId, channelId }) {
  const sql = getSql();
  const [linked] = await sql`
    SELECT
      inv.id,
      inv.guild_id,
      inv.channel_id,
      inv.table_id,
      inv.name,
      inv.message_id,
      inv.orders_message_id,
      inv.version,
      board.board_channel_id AS orders_channel_id,
      board.message_id AS board_message_id
    FROM inventory_order_boards board
    JOIN inventories inv ON inv.id = board.inventory_id
    WHERE board.guild_id = ${guildId}
      AND board.board_channel_id = ${channelId}
  `;

  if (linked) {
    return {
      ...linked,
      orders_channel_id: linked.orders_channel_id,
      orders_message_id: linked.board_message_id,
    };
  }

  const inventory = await requireInventory({ guildId, channelId });
  const [board] = await sql`
    SELECT board_channel_id, message_id
    FROM inventory_order_boards
    WHERE guild_id = ${guildId}
      AND board_channel_id = ${channelId}
      AND inventory_id = ${inventory.id}
  `;

  return {
    ...inventory,
    orders_channel_id: board?.board_channel_id ?? channelId,
    orders_message_id: board?.message_id ?? inventory.orders_message_id ?? null,
  };
}

async function requireInventoryById({ guildId, inventoryId }) {
  const sql = getSql();
  const [inventory] = await sql`
    SELECT id, guild_id, channel_id, table_id, name, message_id, orders_message_id, version
    FROM inventories
    WHERE guild_id = ${guildId}
      AND id = ${inventoryId}
  `;

  if (!inventory) {
    throw new InventoryNotFoundError();
  }

  return inventory;
}

async function requireInventoryByTableId({ guildId, tableId }) {
  const sql = getSql();
  const [inventory] = await sql`
    SELECT id, guild_id, channel_id, table_id, name, message_id, orders_message_id, version
    FROM inventories
    WHERE guild_id = ${guildId}
      AND table_id = ${tableId}
  `;

  if (!inventory) {
    throw new InventoryError(`⚠️ No existe ninguna tabla de inventario con ID ${tableId}.`);
  }

  return inventory;
}

async function upsertOrderBoard({ guildId, boardChannelId, inventoryId, messageId = null, userId = null }) {
  const sql = getSql();
  const [board] = await sql`
    INSERT INTO inventory_order_boards (guild_id, board_channel_id, inventory_id, message_id, created_by)
    VALUES (${guildId}, ${boardChannelId}, ${inventoryId}, ${messageId}, ${userId ?? "0"})
    ON CONFLICT (guild_id, board_channel_id) DO UPDATE
    SET
      inventory_id = EXCLUDED.inventory_id,
      message_id = COALESCE(EXCLUDED.message_id, inventory_order_boards.message_id),
      updated_at = NOW()
    RETURNING board_channel_id, message_id
  `;

  return board;
}

async function requireInventory({ guildId, channelId }) {
  const sql = getSql();
  const [inventory] = await sql`
    SELECT id, guild_id, channel_id, table_id, name, message_id, orders_message_id, version
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

function normalizeItem(row) {
  return {
    item_id: Number(row.item_id),
    name: row.name,
    quantity: Number(row.quantity),
    priority: normalizePriority(row.priority ?? "none"),
  };
}

function normalizePriority(priority) {
  const normalized = String(priority ?? "none").trim().toLowerCase();
  if (["none", "high", "medium", "low"].includes(normalized)) {
    return normalized;
  }
  throw new InventoryError("⚠️ Prioridad no válida. Usa alta, media, baja o ninguna.");
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
