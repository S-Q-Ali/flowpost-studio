-- Drop legacy backdoor RLS policies that exposed fallback admin UUID '00000000-0000-0000-0000-000000000000'
-- Resolves Issue #75.
-- The strictly scoped `*_own` policies (using `user_id = auth.uid()::text`) remain active for all user access.

DO $$
BEGIN
  -- connected_accounts
  DROP POLICY IF EXISTS "connected_accounts_select" ON public.connected_accounts;
  DROP POLICY IF EXISTS "connected_accounts_insert" ON public.connected_accounts;
  DROP POLICY IF EXISTS "connected_accounts_update" ON public.connected_accounts;
  DROP POLICY IF EXISTS "connected_accounts_delete" ON public.connected_accounts;

  -- workflows
  DROP POLICY IF EXISTS "workflows_select" ON public.workflows;
  DROP POLICY IF EXISTS "workflows_insert" ON public.workflows;
  DROP POLICY IF EXISTS "workflows_update" ON public.workflows;
  DROP POLICY IF EXISTS "workflows_delete" ON public.workflows;

  -- videos
  DROP POLICY IF EXISTS "videos_select" ON public.videos;
  DROP POLICY IF EXISTS "videos_insert" ON public.videos;
  DROP POLICY IF EXISTS "videos_update" ON public.videos;
  DROP POLICY IF EXISTS "videos_delete" ON public.videos;

  -- posts
  DROP POLICY IF EXISTS "posts_select" ON public.posts;
  DROP POLICY IF EXISTS "posts_insert" ON public.posts;
  DROP POLICY IF EXISTS "posts_update" ON public.posts;
  DROP POLICY IF EXISTS "posts_delete" ON public.posts;
END $$;
