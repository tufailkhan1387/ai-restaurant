-- Migration 042: Add kitchen, chef, cashier to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'kitchen';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'chef';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cashier';
