-- Per-item inventory tracking and max order quantity limits
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS track_inventory boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_quantity int,
  ADD COLUMN IF NOT EXISTS max_order_quantity int;

COMMENT ON COLUMN public.menu_items.track_inventory IS 'When true, stock_quantity is enforced and item auto-unavailable at 0.';
COMMENT ON COLUMN public.menu_items.stock_quantity IS 'Units in stock; only used when track_inventory is true.';
COMMENT ON COLUMN public.menu_items.max_order_quantity IS 'Max units per order for this item; NULL means no limit.';
