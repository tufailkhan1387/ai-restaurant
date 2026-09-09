-- Add variant_type to distinguish sizes vs flavors/variations
ALTER TABLE public.menu_item_variants
ADD COLUMN IF NOT EXISTS variant_type VARCHAR(50) DEFAULT 'flavor';

-- Update any existing records without variant_type to 'flavor'
UPDATE public.menu_item_variants
SET variant_type = 'flavor'
WHERE variant_type IS NULL;

-- Create index for filtering variants by type
CREATE INDEX IF NOT EXISTS idx_menu_item_variants_type ON public.menu_item_variants(menu_item_id, variant_type);
