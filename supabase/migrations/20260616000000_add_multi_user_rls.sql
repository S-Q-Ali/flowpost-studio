-- Add multi-user RLS policies alongside existing backdoor policies
-- Uses IF NOT EXISTS to safely re-run, and ::text cast since user_id columns are text
-- PostgreSQL ORs policies: a row is accessible if ANY policy matches

DO $$
BEGIN
  -- connected_accounts
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'connected_accounts_select_own' AND schemaname = 'public' AND tablename = 'connected_accounts') THEN
    CREATE POLICY "connected_accounts_select_own" ON public.connected_accounts FOR SELECT USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'connected_accounts_insert_own' AND schemaname = 'public' AND tablename = 'connected_accounts') THEN
    CREATE POLICY "connected_accounts_insert_own" ON public.connected_accounts FOR INSERT WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'connected_accounts_update_own' AND schemaname = 'public' AND tablename = 'connected_accounts') THEN
    CREATE POLICY "connected_accounts_update_own" ON public.connected_accounts FOR UPDATE USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'connected_accounts_delete_own' AND schemaname = 'public' AND tablename = 'connected_accounts') THEN
    CREATE POLICY "connected_accounts_delete_own" ON public.connected_accounts FOR DELETE USING (user_id = auth.uid()::text);
  END IF;

  -- workflows
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'workflows_select_own' AND schemaname = 'public' AND tablename = 'workflows') THEN
    CREATE POLICY "workflows_select_own" ON public.workflows FOR SELECT USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'workflows_insert_own' AND schemaname = 'public' AND tablename = 'workflows') THEN
    CREATE POLICY "workflows_insert_own" ON public.workflows FOR INSERT WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'workflows_update_own' AND schemaname = 'public' AND tablename = 'workflows') THEN
    CREATE POLICY "workflows_update_own" ON public.workflows FOR UPDATE USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'workflows_delete_own' AND schemaname = 'public' AND tablename = 'workflows') THEN
    CREATE POLICY "workflows_delete_own" ON public.workflows FOR DELETE USING (user_id = auth.uid()::text);
  END IF;

  -- videos
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'videos_select_own' AND schemaname = 'public' AND tablename = 'videos') THEN
    CREATE POLICY "videos_select_own" ON public.videos FOR SELECT USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'videos_insert_own' AND schemaname = 'public' AND tablename = 'videos') THEN
    CREATE POLICY "videos_insert_own" ON public.videos FOR INSERT WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'videos_update_own' AND schemaname = 'public' AND tablename = 'videos') THEN
    CREATE POLICY "videos_update_own" ON public.videos FOR UPDATE USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'videos_delete_own' AND schemaname = 'public' AND tablename = 'videos') THEN
    CREATE POLICY "videos_delete_own" ON public.videos FOR DELETE USING (user_id = auth.uid()::text);
  END IF;

  -- posts
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'posts_select_own' AND schemaname = 'public' AND tablename = 'posts') THEN
    CREATE POLICY "posts_select_own" ON public.posts FOR SELECT USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'posts_insert_own' AND schemaname = 'public' AND tablename = 'posts') THEN
    CREATE POLICY "posts_insert_own" ON public.posts FOR INSERT WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'posts_update_own' AND schemaname = 'public' AND tablename = 'posts') THEN
    CREATE POLICY "posts_update_own" ON public.posts FOR UPDATE USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'posts_delete_own' AND schemaname = 'public' AND tablename = 'posts') THEN
    CREATE POLICY "posts_delete_own" ON public.posts FOR DELETE USING (user_id = auth.uid()::text);
  END IF;
END $$;
