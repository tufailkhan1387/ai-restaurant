-- Hero / banner image for restaurant branding (logo_url already exists on restaurants)
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS cover_image_url text;
