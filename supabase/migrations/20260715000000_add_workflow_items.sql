CREATE TABLE workflow_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  drive_file_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'posted', 'failed')),
  yt_video_title TEXT,
  yt_video_description TEXT,
  fb_ig_caption TEXT,
  tiktok_caption TEXT,
  platforms_override TEXT[],
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at TIMESTAMPTZ
);

CREATE INDEX idx_workflow_items_workflow_id ON workflow_items(workflow_id);

ALTER TABLE workflows ADD COLUMN drive_folder_id TEXT;
ALTER TABLE workflows ADD COLUMN data_source TEXT NOT NULL DEFAULT 'g_sheet' CHECK (data_source IN ('g_sheet', 'flowpost'));
