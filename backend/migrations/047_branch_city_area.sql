-- City and area for each branch, so the phone agent can ask the right question.
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS area TEXT;

UPDATE public.restaurants
SET area = 'Iqbal Town'
WHERE area IS NULL AND name ILIKE '%iqbal town%';

UPDATE public.restaurants
SET area = 'Johar Town'
WHERE area IS NULL AND name ILIKE '%johar town%';

UPDATE public.restaurants
SET area = COALESCE(area, 'DHA Phase 5'),
    city = COALESCE(city, 'Lahore')
WHERE name ILIKE '%dha phase 5%';

UPDATE public.restaurants
SET city = 'Lahore'
WHERE city IS NULL AND address ILIKE '%lahore%';
