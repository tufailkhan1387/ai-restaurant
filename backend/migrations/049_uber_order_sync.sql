-- Link Uber store ↔ restaurant and Uber order ↔ kitchen order

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS uber_store_id text;

CREATE UNIQUE INDEX IF NOT EXISTS restaurants_uber_store_id_key
  ON public.restaurants (uber_store_id)
  WHERE uber_store_id IS NOT NULL;

ALTER TABLE public.uber_orders
  ADD COLUMN IF NOT EXISTS local_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS uber_orders_local_order_id_idx
  ON public.uber_orders (local_order_id);
