-- Menu Item Variants
CREATE TABLE IF NOT EXISTS public.menu_item_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_menu_item_variants_item_id ON public.menu_item_variants(menu_item_id);

-- Trigger for updated_at
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_menu_item_variants_updated_at') THEN
        CREATE TRIGGER trg_menu_item_variants_updated_at
        BEFORE UPDATE ON public.menu_item_variants
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
