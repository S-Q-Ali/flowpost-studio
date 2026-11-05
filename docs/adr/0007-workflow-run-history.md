# ADR 0007: Every workflow run leaves one row

**Status:** Accepted (2026-11-05)
**Module:** `workflows` (server) and the workflow cards
**Deciders:** project owner

## Context

`process-workflow` fires every five minutes from `pg_cron` (the two live jobs are
in `cron.job`). Until now the only trace it left was two counters on `workflows`
that move **only when at least one video was posted**, plus an error list that
lived in the HTTP response nobody kept.

So a tick that found nothing ready and a tick that gave up were the same
unreadable state. Read-only evidence from production on 2026-11-05: both active
workflows still said `last_triggered_at` = October 3, while the scheduler had
been queueing the POST every five minutes for a month. The real answer was in
the data — 236 and 46 items, every one already `posted`, none `ready` — and no
screen said so. "Did it run?" and "why did it post nothing?" both need a row.

## Decision

Write **one row per run that was entered** into `public.workflow_runs`, and read
it where the question is asked.

- **Opened on the lock, closed on the release.** A run row is created right after
  `takeWorkflowLock` wins and closed at the two places that already release that
  lock — the top of the workflow loop and the end-of-function `finally`. Those are
  the only two close points, which is what makes the body's many `continue`s safe:
  leaving through any of them still reaches a release.
- **A schedule skip writes nothing.** `skipReason` and "already running" leave no
  row. Logging every five-minute skip would put hundreds of rows a day per
  workflow into the table to say "not due", which is not the question anyone asks.
- **History records creation, not publication.** `rows_seen` counts ready source
  rows. `posts_created` counts successfully inserted target posts, including
  Instagram story rows, not source videos or carousel images. Counts update at
  each insert so later failures do not erase them. Uploads finish independently;
  cards say "posts created · publication not confirmed". Read the posts' status
  for publication outcomes.
- **Fatal errors are failed, including partial runs.** A run with errors and no
  created posts is also `failed`. A run that created posts but collected row-level
  warnings remains `completed` with a message. A run that found nothing ready is
  `completed` with zero counts. Every finalization clears local state even when
  opening its history row failed; the next workflow never inherits its counts.
- **`service_role` writes, the owner reads, no `user_id` copied.** `service_role`
  has `rolbypassrls`, so the function needs no policy. RLS on the table is one
  select policy — "you may read a run of a workflow you may read" — because
  `workflows` owns the run through the FK; a run follows its workflow.
- **Retention and tidying ride the tick that already tidies.** Next to the
  expired-lock sweep: delete runs older than 90 days, and close any row still
  `running` after 20 minutes as "the run stopped answering". This is a stale-run
  heuristic, not a proven runtime ceiling: the 140-second budget limits only the
  final upload wait. A surviving invocation can still write its actual outcome.
- **History failures do not fail publishing.** Open, close and both maintenance
  requests have one-second abort deadlines and catch thrown or returned database
  errors. The maintenance requests run together. Failed history writes may leave
  gaps; a timeout does not prove that the database rejected the write. Checked
  against the client the functions pin (2.49.0) as well as the one the dashboard
  installs: a stalled server reaches the deadline at ~1.0s and comes back as a
  returned error object, which the helper logs and drops.
- **The cards ask once.** The invoker-security `latest_workflow_runs()` RPC uses
  `DISTINCT ON` to return the newest row for each workflow allowed by RLS. It has
  a five-second browser deadline. A failed read shows "Run history unavailable",
  not "Never". Successful reads without history retain legacy trigger text.
  Long reasons wrap as visible text rather than depending on a hover tooltip.

## Consequences

- A workflow entered on every tick makes one row per tick; the 90-day delete is
  what bounds the table, and the `(started_at)` index is what makes that delete
  cheap.
- A card distinguishes nothing ready, no posts created, a failure, and created
  posts whose publication is not confirmed.
- A killed run stays `still running` until a successful sweep after twenty
  minutes; if the scheduler stops or maintenance fails, that delay is longer.
- History is 90 days deep. Anything older needs an export, which is not built.
- `src/integrations/supabase/types.ts` is generated, and this migration's table
  and function were added to it by hand; the next `supabase gen types` overwrites
  both with the same shape.
- `workflows.last_triggered_at` and `total_posted` stay exactly as they are — the
  web dashboard and the desktop both read them. The run row is the record; they
  remain the counters.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Record every tick, skips included | Hundreds of rows a day per workflow that all mean "not due", and the interesting rows drown in them. |
| Read `last_triggered_at` and infer | It only moves when something posted. That is the bug being fixed, not the signal. |
| Ship the run logs to an external drain (Papertrail, Loki, Datadog) | Needs a third party, a secret and a query language for a table the owner can already `select` in the dashboard. |
| `select` the newest N runs in the browser and group there | A quiet weekly workflow sits behind eight hours of the busy one's ticks and drops out of the result entirely. |
| Keep the runs as `jsonb` on the workflow row | Unbounded single value, no per-run index, no retention, and every write rewrites the workflow. |
| A desktop-only runs screen | The question gets asked on the web card first. The desktop screen (W4) mirrors this read-only, it does not replace it. |
