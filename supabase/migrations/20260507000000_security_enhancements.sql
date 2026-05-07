-- Add new columns for enhanced security and tracking
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS fav_teacher VARCHAR(255);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS best_night_date DATE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS lockout_until TIMESTAMPTZ;

-- Add column for manual trigger tracking
ALTER TABLE public.workflows ADD COLUMN IF NOT EXISTS last_manual_triggered_at TIMESTAMPTZ;

-- Add rate limiting table
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(255) NOT NULL UNIQUE,
  attempts INTEGER DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create RLS policies
-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Users: users can read their own profile, admins can read all
CREATE POLICY "Users can read own profile" ON public.users
  FOR SELECT USING (auth.uid() = id OR (SELECT is_admin FROM public.users WHERE id = auth.uid()) = true);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Service role full access" ON public.users
  FOR ALL USING (auth.role() = 'service_role');

-- Connected accounts: users can read their own accounts
CREATE POLICY "Users can read own connected accounts" ON public.connected_accounts
  FOR SELECT USING (user_id = (SELECT id FROM public.users WHERE auth.uid() = id) OR (SELECT is_admin FROM public.users WHERE id = (SELECT id FROM public.users WHERE auth.uid() = id)) = true);

CREATE POLICY "Users can insert own connected accounts" ON public.connected_accounts
  FOR INSERT WITH CHECK (user_id = (SELECT id FROM public.users WHERE auth.uid() = id));

CREATE POLICY "Users can update own connected accounts" ON public.connected_accounts
  FOR UPDATE USING (user_id = (SELECT id FROM public.users WHERE auth.uid() = id));

CREATE POLICY "Users can delete own connected accounts" ON public.connected_accounts
  FOR DELETE USING (user_id = (SELECT id FROM public.users WHERE auth.uid() = id));

-- Workflows: users can read their own workflows
CREATE POLICY "Users can read own workflows" ON public.workflows
  FOR SELECT USING (user_id = (SELECT id FROM public.users WHERE auth.uid() = id) OR (SELECT is_admin FROM public.users WHERE id = (SELECT id FROM public.users WHERE auth.uid() = id)) = true);

CREATE POLICY "Users can insert own workflows" ON public.workflows
  FOR INSERT WITH CHECK (user_id = (SELECT id FROM public.users WHERE auth.uid() = id));

CREATE POLICY "Users can update own workflows" ON public.workflows
  FOR UPDATE USING (user_id = (SELECT id FROM public.users WHERE auth.uid() = id));

CREATE POLICY "Users can delete own workflows" ON public.workflows
  FOR DELETE USING (user_id = (SELECT id FROM public.users WHERE auth.uid() = id));

-- Videos: users can read their own videos
CREATE POLICY "Users can read own videos" ON public.videos
  FOR SELECT USING (user_id = (SELECT id FROM public.users WHERE auth.uid() = id) OR (SELECT is_admin FROM public.users WHERE id = (SELECT id FROM public.users WHERE auth.uid() = id)) = true);

CREATE POLICY "Users can insert own videos" ON public.videos
  FOR INSERT WITH CHECK (user_id = (SELECT id FROM public.users WHERE auth.uid() = id));

CREATE POLICY "Users can update own videos" ON public.videos
  FOR UPDATE USING (user_id = (SELECT id FROM public.users WHERE auth.uid() = id));

CREATE POLICY "Users can delete own videos" ON public.videos
  FOR DELETE USING (user_id = (SELECT id FROM public.users WHERE auth.uid() = id));

-- Posts: users can read their own posts
CREATE POLICY "Users can read own posts" ON public.posts
  FOR SELECT USING (user_id = (SELECT id FROM public.users WHERE auth.uid() = id) OR (SELECT is_admin FROM public.users WHERE id = (SELECT id FROM public.users WHERE auth.uid() = id)) = true);

CREATE POLICY "Users can insert own posts" ON public.posts
  FOR INSERT WITH CHECK (user_id = (SELECT id FROM public.users WHERE auth.uid() = id));

CREATE POLICY "Users can update own posts" ON public.posts
  FOR UPDATE USING (user_id = (SELECT id FROM public.users WHERE auth.uid() = id));

CREATE POLICY "Users can delete own posts" ON public.posts
  FOR DELETE USING (user_id = (SELECT id FROM public.users WHERE auth.uid() = id));

-- Sessions: users can manage their own sessions
CREATE POLICY "Users can manage own sessions" ON public.sessions
  FOR ALL USING (user_id = (SELECT id FROM public.users WHERE auth.uid() = id) OR auth.role() = 'service_role');

-- Workflow locks: internal use
CREATE POLICY "Workflow locks internal" ON public.workflow_locks
  FOR ALL USING (auth.role() = 'service_role');

-- Rate limits: internal use
CREATE POLICY "Rate limits internal" ON public.rate_limits
  FOR ALL USING (auth.role() = 'service_role');

-- Update existing admin user
UPDATE public.users SET is_admin = true WHERE id = '00000000-0000-0000-0000-000000000000';