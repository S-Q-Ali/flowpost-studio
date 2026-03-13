-- Global execution lock for process-workflow to prevent duplicate runs
CREATE TABLE IF NOT EXISTS public.workflow_locks (
  lock_key TEXT PRIMARY KEY,
  locked_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
