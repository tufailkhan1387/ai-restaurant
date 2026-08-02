-- Migration to add image_url to vehicles and drivers
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS image_url TEXT;
