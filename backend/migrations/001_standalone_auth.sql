-- Run once against your Postgres after moving off Supabase Auth.
-- Backs profiles with local passwords and removes dependency on auth.users.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_hash text;

COMMENT ON COLUMN public.profiles.password_hash IS 'bcrypt hash for standalone API login';

-- Point user_roles at profiles instead of auth.users
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Set a password for an existing user (example — replace email and generate hash via backend or bcrypt CLI):
-- UPDATE public.profiles SET password_hash = '$2a$10$...' WHERE email = 'admin@example.com';
