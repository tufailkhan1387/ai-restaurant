-- Migration: 028_stock_adjustments.sql
-- Table for manual stock adjustments (increase/decrease) with audit trail
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('increase', 'decrease')),
  quantity NUMERIC(12,2) NOT NULL,
  reason TEXT,
  performed_by UUID, -- reference to users table if exists
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_item ON stock_adjustments(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_type ON stock_adjustments(adjustment_type);
