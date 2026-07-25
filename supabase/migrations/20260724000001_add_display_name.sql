ALTER TABLE public.connected_accounts
  ADD COLUMN IF NOT EXISTS display_name TEXT;
