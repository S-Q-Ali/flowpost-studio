ALTER TABLE posts ADD COLUMN IF NOT EXISTS workflow_item_id UUID REFERENCES workflow_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_posts_workflow_item_id ON posts(workflow_item_id);
