-- Restore legacy backdoor RLS policies (reverting Phase 1 DB change)
-- These allow access for rows belonging to the admin backdoor UUID.
-- PostgreSQL ORs policies, so they coexist with the _own policies.

DO $$
BEGIN
  -- connected_accounts
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'connected_accounts_select' AND schemaname = 'public' AND tablename = 'connected_accounts') THEN
    CREATE POLICY "connected_accounts_select" ON public.connected_accounts FOR SELECT USING (user_id = auth.uid()::text OR user_id = '00000000-0000-0000-0000-000000000000');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'connected_accounts_insert' AND schemaname = 'public' AND tablename = 'connected_accounts') THEN
    CREATE POLICY "connected_accounts_insert" ON public.connected_accounts FOR INSERT WITH CHECK (user_id = auth.uid()::text OR user_id = '00000000-0000-0000-0000-000000000000');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'connected_accounts_update' AND schemaname = 'public' AND tablename = 'connected_accounts') THEN
    CREATE POLICY "connected_accounts_update" ON public.connected_accounts FOR UPDATE USING (user_id = auth.uid()::text OR user_id = '00000000-0000-0000-0000-000000000000');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'connected_accounts_delete' AND schemaname = 'public' AND tablename = 'connected_accounts') THEN
    CREATE POLICY "connected_accounts_delete" ON public.connected_accounts FOR DELETE USING (user_id = auth.uid()::text OR user_id = '00000000-0000-0000-0000-000000000000');
  END IF;

  -- workflows
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'workflows_select' AND schemaname = 'public' AND tablename = 'workflows') THEN
    CREATE POLICY "workflows_select" ON public.workflows FOR SELECT USING (user_id = auth.uid()::text OR user_id = '00000000-0000-0000-0000-000000000000');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'workflows_insert' AND schemaname = 'public' AND tablename = 'workflows') THEN
    CREATE POLICY "workflows_insert" ON public.workflows FOR INSERT WITH CHECK (user_id = auth.uid()::text OR user_id = '00000000-0000-0000-0000-000000000000');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'workflows_update' AND schemaname = 'public' AND tablename = 'workflows') THEN
    CREATE POLICY "workflows_update" ON public.workflows FOR UPDATE USING (user_id = auth.uid()::text OR user_id = '00000000-0000-0000-0000-000000000000');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'workflows_delete' AND schemaname = 'public' AND tablename = 'workflows') THEN
    CREATE POLICY "workflows_delete" ON public.workflows FOR DELETE USING (user_id = auth.uid()::text OR user_id = '00000000-0000-0000-0000-000000000000');
  END IF;

  -- videos
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'videos_select' AND schemaname = 'public' AND tablename = 'videos') THEN
    CREATE POLICY "videos_select" ON public.videos FOR SELECT USING (user_id = auth.uid()::text OR user_id = '00000000-0000-0000-0000-000000000000');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'videos_insert' AND schemaname = 'public' AND tablename = 'videos') THEN
    CREATE POLICY "videos_insert" ON public.videos FOR INSERT WITH CHECK (user_id = auth.uid()::text OR user_id = '00000000-0000-0000-0000-000000000000');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'videos_update' AND schemaname = 'public' AND tablename = 'videos') THEN
    CREATE POLICY "videos_update" ON public.videos FOR UPDATE USING (user_id = auth.uid()::text OR user_id = '00000000-0000-0000-0000-000000000000');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'videos_delete' AND schemaname = 'public' AND tablename = 'videos') THEN
    CREATE POLICY "videos_delete" ON public.videos FOR DELETE USING (user_id = auth.uid()::text OR user_id = '00000000-0000-0000-0000-000000000000');
  END IF;

  -- posts
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'posts_select' AND schemaname = 'public' AND tablename = 'posts') THEN
    CREATE POLICY "posts_select" ON public.posts FOR SELECT USING (user_id = auth.uid()::text OR user_id = '00000000-0000-0000-0000-000000000000');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'posts_insert' AND schemaname = 'public' AND tablename = 'posts') THEN
    CREATE POLICY "posts_insert" ON public.posts FOR INSERT WITH CHECK (user_id = auth.uid()::text OR user_id = '00000000-0000-0000-0000-000000000000');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'posts_update' AND schemaname = 'public' AND tablename = 'posts') THEN
    CREATE POLICY "posts_update" ON public.posts FOR UPDATE USING (user_id = auth.uid()::text OR user_id = '00000000-0000-0000-0000-000000000000');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'posts_delete' AND schemaname = 'public' AND tablename = 'posts') THEN
    CREATE POLICY "posts_delete" ON public.posts FOR DELETE USING (user_id = auth.uid()::text OR user_id = '00000000-0000-0000-0000-000000000000');
  END IF;
END $$;
