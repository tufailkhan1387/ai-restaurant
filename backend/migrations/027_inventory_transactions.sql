-- Migration: 027_inventory_transactions.sql
-- Table to log all stock movements (additions, consumption, adjustments)
DO $$
BEGIN
    CREATE TYPE inventory_transaction_type AS ENUM ('purchase', 'sale', 'adjustment');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  transaction_type inventory_transaction_type NOT NULL,
  quantity NUMERIC(12,2) NOT NULL,
  unit TEXT NOT NULL,
  related_order_id UUID,            -- optional reference to an order when type = 'sale'
  related_purchase_id UUID,         -- optional reference to a purchase when type = 'purchase'
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item ON inventory_transactions(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_type ON inventory_transactions(transaction_type);
