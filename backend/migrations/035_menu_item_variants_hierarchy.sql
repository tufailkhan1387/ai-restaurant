-- Add parent_id and measurement columns to menu_item_variants for hierarchical sizes and flavors
ALTER TABLE public.menu_item_variants
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.menu_item_variants(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS measurement VARCHAR(50);

-- Create index for parent_id lookups
CREATE INDEX IF NOT EXISTS idx_menu_item_variants_parent_id ON public.menu_item_variants(parent_id);
