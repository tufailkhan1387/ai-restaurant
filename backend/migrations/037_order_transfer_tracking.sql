-- 037_order_transfer_tracking.sql
-- Add order transfer tracking columns

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS is_transferred BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS transferred_from_restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS transfer_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_is_transferred ON public.orders(is_transferred);
CREATE INDEX IF NOT EXISTS idx_orders_transferred_from ON public.orders(transferred_from_restaurant_id);
