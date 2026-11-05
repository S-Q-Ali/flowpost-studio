-- One row per workflow run, so "did it run, and what did it do?" has an answer.
--
-- process-workflow fires every five minutes from cron and today leaves no trace
-- unless it posts something: the counters on workflows move only when a video was
-- posted, and a run's errors live in an HTTP response nobody keeps. So a schedule
-- that found nothing ready is indistinguishable from a run that failed.
--
-- A row opens when a workflow is entered (its lock taken) and closes with what it
-- saw and what it made, including the run that made nothing.
create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  triggered_by text not null default 'cron' check (triggered_by in ('cron', 'manual')),
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  rows_seen integer not null default 0,
  posts_created integer not null default 0,
  message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists workflow_runs_workflow_started
  on public.workflow_runs (workflow_id, started_at desc);

alter table public.workflow_runs enable row level security;

-- process-workflow writes with the service key, which bypasses row level security,
-- so it needs no policy of its own. The browser reads a run at exactly the moment it
-- may read the workflow it belongs to — the same shape as workflow_items. The owner
-- is not copied here: workflows owns it, and a run follows it.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'workflow_runs' AND policyname = 'Users can read own workflow runs'
  ) THEN
    CREATE POLICY "Users can read own workflow runs"
      ON workflow_runs FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM workflows
          WHERE workflows.id = workflow_runs.workflow_id
          AND workflows.user_id = auth.uid()::text
        )
      );
  END IF;
END $$;
