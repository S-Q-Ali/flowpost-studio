ALTER TABLE workflow_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own workflow items"
  ON workflow_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workflows
      WHERE workflows.id = workflow_items.workflow_id
      AND workflows.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert own workflow items"
  ON workflow_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workflows
      WHERE workflows.id = workflow_items.workflow_id
      AND workflows.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can update own workflow items"
  ON workflow_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workflows
      WHERE workflows.id = workflow_items.workflow_id
      AND workflows.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own workflow items"
  ON workflow_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workflows
      WHERE workflows.id = workflow_items.workflow_id
      AND workflows.user_id = auth.uid()::text
    )
  );
