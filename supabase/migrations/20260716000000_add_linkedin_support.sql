ALTER TABLE connected_accounts DROP CONSTRAINT IF EXISTS connected_accounts_platform_check;
ALTER TABLE connected_accounts ADD CONSTRAINT connected_accounts_platform_check
  CHECK (platform IN ('facebook', 'instagram', 'youtube', 'tiktok', 'linkedin'));

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_platform_check;
ALTER TABLE posts ADD CONSTRAINT posts_platform_check
  CHECK (platform IN ('facebook', 'instagram', 'youtube', 'tiktok', 'linkedin'));

ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_platforms_check;
ALTER TABLE workflows ADD CONSTRAINT workflows_platforms_check
  CHECK (platforms <@ ARRAY['facebook','instagram','youtube','tiktok','linkedin']::text[]);

ALTER TABLE workflows ADD COLUMN IF NOT EXISTS linkedin_account_ids TEXT[];

ALTER TABLE workflow_items ADD COLUMN IF NOT EXISTS linkedin_caption TEXT;
