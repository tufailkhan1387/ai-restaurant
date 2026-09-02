-- Many-to-many: drivers can serve multiple restaurants
CREATE TABLE IF NOT EXISTS public.driver_restaurants (
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (driver_id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_driver_restaurants_restaurant_id
  ON public.driver_restaurants (restaurant_id);

-- Backfill from legacy drivers.restaurant_id
INSERT INTO public.driver_restaurants (driver_id, restaurant_id)
SELECT d.id, d.restaurant_id
FROM public.drivers d
WHERE d.restaurant_id IS NOT NULL
ON CONFLICT (driver_id, restaurant_id) DO NOTHING;
