-- Drop legacy backdoor RLS policies that allowed access via hardcoded user_id.
-- The _own policies (matching auth.uid()) remain active.

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
