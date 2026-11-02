-- A license can belong to one user, so the session it mints carries that
-- user's id instead of the admin fallback. Keys without an owner keep the
-- old behaviour.
ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
