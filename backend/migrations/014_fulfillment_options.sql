ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS allows_delivery BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS allows_pickup BOOLEAN DEFAULT true;
