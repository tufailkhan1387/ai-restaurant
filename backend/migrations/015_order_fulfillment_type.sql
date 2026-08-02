ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS fulfillment_type TEXT DEFAULT 'delivery' CHECK (fulfillment_type IN ('delivery', 'pickup'));
