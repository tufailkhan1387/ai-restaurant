-- Add max_order_quantity to menu_item_variants for per-flavor/per-variant limits
ALTER TABLE public.menu_item_variants
  ADD COLUMN IF NOT EXISTS max_order_quantity int;

COMMENT ON COLUMN public.menu_item_variants.max_order_quantity IS 'Max units per order for this variant/flavor; NULL means no limit.';
