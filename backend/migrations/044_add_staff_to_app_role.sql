-- Migration 044: Add staff (floor / waiter) to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff';
