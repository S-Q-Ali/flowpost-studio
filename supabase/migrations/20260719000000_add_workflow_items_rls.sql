ALTER TABLE workflow_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workflow_items' AND policyname = 'Users can read own workflow items') THEN
    CREATE POLICY "Users can read own workflow items"
      ON workflow_items FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM workflows
          WHERE workflows.id = workflow_items.workflow_id
          AND workflows.user_id = auth.uid()::text
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workflow_items' AND policyname = 'Users can insert own workflow items') THEN
    CREATE POLICY "Users can insert own workflow items"
      ON workflow_items FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM workflows
          WHERE workflows.id = workflow_items.workflow_id
          AND workflows.user_id = auth.uid()::text
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workflow_items' AND policyname = 'Users can update own workflow items') THEN
    CREATE POLICY "Users can update own workflow items"
      ON workflow_items FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM workflows
          WHERE workflows.id = workflow_items.workflow_id
          AND workflows.user_id = auth.uid()::text
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workflow_items' AND policyname = 'Users can delete own workflow items') THEN
    CREATE POLICY "Users can delete own workflow items"
      ON workflow_items FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM workflows
          WHERE workflows.id = workflow_items.workflow_id
          AND workflows.user_id = auth.uid()::text
        )
      );
  END IF;
END $$;
