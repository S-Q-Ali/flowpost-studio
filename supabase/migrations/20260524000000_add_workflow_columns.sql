-- Add missing workflow columns used by frontend and edge functions
ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS run_interval_hours INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS videos_per_run INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS run_days JSONB DEFAULT '[0,1,2,3,4,5,6]',
  ADD COLUMN IF NOT EXISTS day_time_windows JSONB,
  ADD COLUMN IF NOT EXISTS last_manual_triggered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS facebook_ai_generated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS instagram_ai_generated BOOLEAN DEFAULT false;
