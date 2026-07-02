-- Add multi-user RLS policies alongside existing backdoor policies
-- PostgreSQL ORs policies: a row is accessible if ANY policy matches
-- Existing policies with '00000000-...' backdoor still work for old data
-- New _own policies match real auth.uid() for new multi-user data

-- connected_accounts
CREATE POLICY "connected_accounts_select_own" ON public.connected_accounts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "connected_accounts_insert_own" ON public.connected_accounts
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "connected_accounts_update_own" ON public.connected_accounts
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "connected_accounts_delete_own" ON public.connected_accounts
  FOR DELETE USING (user_id = auth.uid());

-- workflows
CREATE POLICY "workflows_select_own" ON public.workflows
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "workflows_insert_own" ON public.workflows
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "workflows_update_own" ON public.workflows
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "workflows_delete_own" ON public.workflows
  FOR DELETE USING (user_id = auth.uid());

-- videos
CREATE POLICY "videos_select_own" ON public.videos
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "videos_insert_own" ON public.videos
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "videos_update_own" ON public.videos
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "videos_delete_own" ON public.videos
  FOR DELETE USING (user_id = auth.uid());

-- posts
CREATE POLICY "posts_select_own" ON public.posts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "posts_insert_own" ON public.posts
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "posts_update_own" ON public.posts
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "posts_delete_own" ON public.posts
  FOR DELETE USING (user_id = auth.uid());
