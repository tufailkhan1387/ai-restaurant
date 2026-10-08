-- DoorDash Marketplace store mapping on restaurants

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS doordash_store_id text;

CREATE UNIQUE INDEX IF NOT EXISTS restaurants_doordash_store_id_key
  ON public.restaurants (doordash_store_id)
  WHERE doordash_store_id IS NOT NULL;
