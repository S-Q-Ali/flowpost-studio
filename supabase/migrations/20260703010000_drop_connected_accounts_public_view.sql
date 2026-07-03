-- Drop the security definer view connected_accounts_public.
-- Created via Supabase Table Editor UI, never used in any code.
-- It exposed all rows from connected_accounts to the anon role, bypassing RLS.
DROP VIEW IF EXISTS public.connected_accounts_public;
