-- Migration to add commission_rate to restaurants
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS commission_rate numeric(5,2) DEFAULT 10.00;
