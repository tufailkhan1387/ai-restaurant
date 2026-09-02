-- Optional add-ons (extra cheese, etc.) per restaurant, linkable to menu items
CREATE TABLE IF NOT EXISTS public.menu_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric(10,2) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_addons_restaurant_id ON public.menu_addons (restaurant_id);

CREATE TABLE IF NOT EXISTS public.menu_item_addons (
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  menu_addon_id uuid NOT NULL REFERENCES public.menu_addons(id) ON DELETE CASCADE,
  PRIMARY KEY (menu_item_id, menu_addon_id)
);

CREATE INDEX IF NOT EXISTS idx_menu_item_addons_addon_id ON public.menu_item_addons (menu_addon_id);

DO $$ BEGIN
  CREATE TRIGGER trg_menu_addons_updated_at
    BEFORE UPDATE ON public.menu_addons
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;
