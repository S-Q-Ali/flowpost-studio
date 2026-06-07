-- Add TikTok support
-- Table for storing one-time OAuth state values (CSRF protection)
CREATE TABLE IF NOT EXISTS tiktok_oauth_states (
  state TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tiktok_oauth_states_expires_at
  ON tiktok_oauth_states(expires_at);

ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS tiktok_account_ids TEXT[] NULL;

-- Loosen the platforms check to allow 'tiktok'
ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_platforms_check;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'workflows_platforms_check'
      AND table_name = 'workflows'
  ) THEN
    ALTER TABLE workflows DROP CONSTRAINT workflows_platforms_check;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'workflows_platforms_check'
      AND table_name = 'workflows'
  ) THEN
    ALTER TABLE workflows
      ADD CONSTRAINT workflows_platforms_check
      CHECK (platforms <@ ARRAY['facebook','instagram','youtube','tiktok']::text[]);
  END IF;
END $$;

-- Add video_size to videos table so TikTok upload doesn't need a HEAD request
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS video_size BIGINT NULL;
