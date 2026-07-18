ALTER TABLE posts ADD COLUMN workflow_item_id UUID REFERENCES workflow_items(id) ON DELETE SET NULL;
CREATE INDEX idx_posts_workflow_item_id ON posts(workflow_item_id);
