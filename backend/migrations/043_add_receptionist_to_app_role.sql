-- Migration 043: Add receptionist to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'receptionist';
