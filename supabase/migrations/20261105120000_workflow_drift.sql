-- What production has had since before this folder existed, in migration history.
--
-- process-workflow reads workflows.post_as_story and workflows.youtube_altered_content,
-- and the live workflow_locks table answers nothing but the service role. None of that
-- is in any migration file, so a database built from supabase/migrations alone gets
-- columns the function never finds and a lock table the browser can read.
--
-- Every statement is guarded: applying this to the current production changes nothing.
alter table workflows add column if not exists post_as_story boolean default false;
alter table workflows add column if not exists youtube_altered_content boolean default true;

alter table workflow_locks enable row level security;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'workflow_locks' AND policyname = 'workflow_locks_service_only'
  ) THEN
    -- Only process-workflow takes and releases a lock, and it holds the service key.
    CREATE POLICY "workflow_locks_service_only"
      ON workflow_locks FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;
