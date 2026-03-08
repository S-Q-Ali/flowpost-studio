-- Redesign workflows table for Google Sheets–based workflows

DROP TABLE IF EXISTS public.workflows;

CREATE TABLE public.workflows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,

  -- Google Sheet config
  sheet_url TEXT,
  sheet_id TEXT,

  -- Platform selection
  platforms TEXT[] DEFAULT '{}',

  -- Account selection per platform
  youtube_channel_ids TEXT[] DEFAULT '{}',
  facebook_page_ids TEXT[] DEFAULT '{}',
  instagram_account_ids TEXT[] DEFAULT '{}',

  -- Trigger settings
  trigger_hour_start INTEGER NOT NULL DEFAULT 14,
  trigger_hour_end INTEGER NOT NULL DEFAULT 15,

  -- Limits
  max_videos_per_trigger INTEGER DEFAULT 3,

  -- Stats
  last_triggered_at TIMESTAMPTZ,
  total_posted INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable row level security and policies (same pattern as original workflows table)
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own workflows"
  ON public.workflows
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own workflows"
  ON public.workflows
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own workflows"
  ON public.workflows
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own workflows"
  ON public.workflows
  FOR DELETE
  USING (auth.uid() = user_id);

-- Keep updated_at in sync
CREATE TRIGGER update_workflows_updated_at
BEFORE UPDATE ON public.workflows
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

