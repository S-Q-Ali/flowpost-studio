-- The newest run of every workflow the signed-in user owns, in one call.
--
-- The workflow cards need "when did this one last run and what did it do".
-- PostgREST cannot ask for the newest row per group, and reading the newest N
-- rows overall and picking per workflow in the browser loses a quiet workflow
-- entirely: a weekly workflow sits behind eight hours of the busy one's
-- five-minute ticks. So the grouping happens where it can.
--
-- No ownership filter here: the function runs as the caller, so the owner-select
-- policy on workflow_runs already limits it to runs of workflows they may read.
create or replace function public.latest_workflow_runs()
returns setof public.workflow_runs
language sql
stable
as $$
  select distinct on (workflow_id) *
  from public.workflow_runs
  order by workflow_id, started_at desc;
$$;
