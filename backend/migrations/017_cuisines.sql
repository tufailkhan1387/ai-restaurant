-- Global cuisine catalog
CREATE TABLE IF NOT EXISTS public.cuisines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Many-to-many link: restaurants <-> cuisines
CREATE TABLE IF NOT EXISTS public.restaurant_cuisines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  cuisine_id uuid NOT NULL REFERENCES public.cuisines(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, cuisine_id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_cuisines_restaurant_id ON public.restaurant_cuisines (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_cuisines_cuisine_id ON public.restaurant_cuisines (cuisine_id);
