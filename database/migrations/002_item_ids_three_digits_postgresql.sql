ALTER TABLE inventory_items
DROP CONSTRAINT IF EXISTS ck_item_id_one_digit;

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
