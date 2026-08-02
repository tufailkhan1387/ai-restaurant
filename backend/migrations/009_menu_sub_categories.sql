-- Menu Sub-categories and update Menu Items
CREATE TABLE IF NOT EXISTS public.menu_sub_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.menu_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add sub_category_id to menu_items
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS sub_category_id UUID REFERENCES public.menu_sub_categories(id) ON DELETE SET NULL;

-- Trigger for updated_at
DO $$ BEGIN
    CREATE TRIGGER trg_menu_sub_categories_updated_at BEFORE UPDATE ON public.menu_sub_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;
