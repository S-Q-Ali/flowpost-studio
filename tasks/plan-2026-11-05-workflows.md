# Implementation Plan: Workflows — run history and the drift that breaks a rebuild

**Created:** 2026-11-05
**Status:** Approved by the owner ("karo") for W1 and W2; W3 and W4 are scoped here but need their own go
**Plan pair:** `tasks/todo-2026-11-05-workflows.md`
**Supersedes nothing:** `tasks/plan.md` / `tasks/todo.md` (desktop MVP) still carry unchecked tasks for other work and are untouched.
**Assumed load:** one operator, 2 active workflows, a 5-minute cron tick already live in production (`cron.job` 28 `process-workflows`, 29 `process-scheduled-posts`).

## Overview

Two things are wrong today, and both were verified against the live project `ximorwzknbizpceaoflw`, not read out of the repo:

1. **Schema drift.** `workflows.post_as_story` and `workflows.youtube_altered_content` exist in production and are read by `process-workflow`, and `workflow_locks` has RLS on with a `workflow_locks_service_only` policy — none of that is in any migration file. A new project built from `supabase/migrations` with `db push` would produce a database `process-workflow` cannot run against.
2. **No run history.** There is no table recording that a workflow ran. A run's outcome lives only in the HTTP response (`{processed, workflows_triggered, errors}`) and in two `workflows` counters that are updated **only when at least one video was posted**. So a cron tick that found nothing ready leaves no trace, and there is no way to answer "why did Tuesday's batch not post?" after the fact.

W1 closes the drift. W2 makes every entered run leave a row behind and shows the last one in the web UI. W3 (named stages) and W4 (a desktop Workflows screen) are scoped at the bottom so the shape of W2 is known before it is built.

## Architecture Decisions

- **A run row is written for a run that was entered, not for a schedule skip.** The lock-taken path is the only place that opens a run. `skipReason` and "already running" continue-sites write nothing: logging every 5-minute skip for every workflow would put up to 288 rows a day per workflow in the table to say "nothing to do", which is not the question anyone asks. A run that was entered and found zero ready rows **is** recorded (`posts_created = 0`), and that is the answer to the real question.
- **Runs close where locks are released, reusing the existing pattern.** The handler deliberately releases the previous workflow's lock at the top of the loop instead of with a `finally` per workflow, because the body has many `continue`s. The run row closes in exactly those same two places (top-of-loop, end-of-function `finally`) so a `continue` cannot leak an open run.
- **Counters track source rows and inserted posts separately.** Initialize `rows_seen` from `readyRows.length`; increment `posts_created` from each successful target-post insert, including tracked Instagram stories. Preserve counts after later failures. Leave the old `workflowVideoCount` and publishing stats unchanged.
- **Best-effort history has deadlines.** Open, close, 90-day retention and 20-minute stale-run updates each abort after one second and catch returned or thrown errors. Both maintenance requests run together. Twenty minutes is a stale-run heuristic, not a proven total runtime limit.
- **The latest-run read is one invoker-security RPC.** `latest_workflow_runs()` uses `DISTINCT ON` with RLS, not a globally limited list or a query per card. The UI gives it five seconds and shows an unavailable state on failure. Created posts are not labeled published.
- **Owner reads, service writes.** `workflow_runs` does not copy `user_id`: `workflows` owns the run through the FK, and the one read policy says "you may read a run of a workflow you may read" (`EXISTS` on `workflows`), mirroring `20260719000000_add_workflow_items_rls.sql`. `service_role` has `rolbypassrls`, so `process-workflow` needs no write policy of its own.
- **No stage model in this plan.** W3 changes the shape of a workflow; building it before run history exists means changing the code that records runs twice.

## Dependency graph

```
W1 drift migration (no deps)
   └─> W2a workflow_runs migration ──> W2b _shared/workflow-runs.ts + tests
                                             └─> W2c process-workflow opens/closes runs
                                                      └─> W2d web: last run per workflow
                                                               └─> W2e gate + ADR 0007
```

## Task List

### W1 — Rebuild-safe schema

- [x] **W1** `supabase/migrations/20261105120000_workflow_drift.sql`
  Adds `post_as_story` / `youtube_altered_content` to `workflows` and `workflow_locks` RLS + service-only policy, each guarded so re-running is a no-op.
  **Acceptance:** a fresh database with only the migrations applied has those two columns and `relrowsecurity = true` on `workflow_locks`; applying it to the current production changes nothing (`0` rows affected, no error).
  **Verify:** the file was compared with live `information_schema` and `pg_policies` read-back; the diff is recorded in the todo. A fresh local database rebuild has not been run. Remote direct database access was unavailable; this is not evidence about local database startup.
  **Files:** `supabase/migrations/` (new). **Scope:** XS.

### W2 — Run history

- [x] **W2a** `supabase/migrations/20261105130000_workflow_runs.sql`
  **Acceptance:** table `workflow_runs` (id, workflow_id FK cascade, triggered_by, status, rows_seen, posts_created, message, started_at, finished_at); CHECK on `triggered_by in ('cron','manual')` and `status in ('running','completed','failed')`; an index on `(workflow_id, started_at desc)` for the card read and one on `(started_at)` for the 90-day purge; RLS on with one owner-select policy (`EXISTS` on `workflows`), no write policy — `service_role` bypasses RLS.
  **Files:** one migration. **Scope:** S.
- [x] **W2b** `supabase/functions/_shared/workflow-runs.ts` + `workflow-runs.test.ts`
  `openWorkflowRun`, `closeWorkflowRun`, `maintainWorkflowRuns`, and pure `describeRun(report, newErrors, failed)`.
  **Acceptance:** history failures and deadlines never throw into publishing; a null run ID makes close a no-op; close sets `finished_at`; fatal failure overrides partial-success counts.
  **Verify:** helper tests include successful writes, refused writes, thrown errors and a stalled fetch aborted by the deadline.
  **Files:** 2. **Scope:** S.
- [x] **W2c** `process-workflow` writes a run per entered workflow
  **Acceptance:** each lock-taken workflow attempts one best-effort history row, `running` → `completed`/`failed`, with `rows_seen`/`posts_created`; the two release points (loop top, end-of-function `finally`) are the only places that close a run; a body that left through a `continue` with a complaint is `failed` with that complaint as `message`; a run that found nothing ready is `completed` with zeros; 409-on-manual-conflict and every schedule skip write nothing; the per-request `HeldRun` is declared inside the handler, so two invocations sharing one isolate cannot close each other's run.
  **Verify:** Vitest executes the transpiled real handler with fake external boundaries: fatal source reads, failed history open followed by another workflow, target/carousel/story counts, partial failures and maintenance failure. Syntax parsing is not a Deno type-check; Deno is unavailable locally and deployment bundling does not replace that check. After approved deployment, read back naturally entered cron runs.
  **Files:** `process-workflow/index.ts`. **Scope:** M.
- [x] **W2d** web: last run on the workflow cards
  **Acceptance:** each card shows created posts with "publication not confirmed", "nothing was ready", or "failed: <message>"; no history keeps legacy trigger text. One RPC serves all cards; failed reads show "Run history unavailable". Long reasons wrap.
  **Verify:** `npx tsc -b --force`, `npm run build`, `npx vitest run` for any lib extract, and the owner's browser check.
  **Files:** `src/pages/WorkflowsPage.tsx`, possibly one small lib. **Scope:** M.
- [ ] **W2e** gates + docs
  `npx vitest run`, `npx eslint .`, `npx tsc -b --force`, `npm run build`, `graphify update .`; `docs/runbook.md` troubleshooting row ("a workflow ran but posted nothing — read `workflow_runs`"); `docs/adr/0007-workflow-run-history.md`.

### Checkpoint: W2 done
- [x] Local Vitest (441 tests), ESLint (0 errors / 184 warnings), TypeScript build check and Vite build pass
- [x] Browser synthetic state checks and responsive widths pass; graph updated
- [x] History deadlines re-run against the pinned `@supabase/supabase-js@2.49.0` in an isolated temp install — open/close/maintenance each gave up at ~1.01s, every signal aborted, and the pinned client surfaces the stall as an error object instead of a throw (recipe in `tasks/todo-2026-11-05-workflows.md`)
- [ ] Final corrections committed after explicit approval
- [ ] Deno type-check and real database/RLS validation
- [ ] Migration applied to production through the Management API and read back (`db push` is unusable here — see `tasks/deploy-server-68.md`)
- [ ] `process-workflow` redeployed; a cron tick leaves rows in `workflow_runs` for both live workflows
- [ ] Owner sees the last run in the browser before W3 starts

## W3 / W4 — scoped, not approved

- **W3 named stages.** `workflows.steps jsonb` holding an ordered array from a fixed vocabulary the repo already implements: `source` → `caption` → `publish` → `archive`. Each `workflow_item` gains `step`, `step_status`, `error`, `attempt`; the cron tick advances one item one stage, so each step is idempotent and retryable. This is a queue with named stages, not a DAG editor. It also moves caption generation server-side (`generate-ai-captions` is never called by `process-workflow` today — only the browser calls it), and must introduce an explicit per-run cap; the existing 140-second final upload-wait budget is not a total runtime limit.
- **W4 desktop Workflows screen.** Read-only first: list, last run from W2, per-item status. **Run now** is a separate write action requiring explicit scope. Nothing exists today (`workflow` has zero matches in the 112 Dart files); the transport, accounts and shell/router seams it needs are all built.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A killed invocation or failed close leaves `running` history | Med | Close at both release points; after 20 minutes, a later successful maintenance sweep marks the run failed |
| Run rows grow without bound | Low | 90-day delete next to the existing sweep, one statement |
| Migration applied twice (drift file re-run) | Low | Every statement guarded with `if not exists` / `DO $$` blocks, matching `20260719000000` |
| Editing the large workflow handler | Med | Limit changes to history lifecycle and inserted-post counters; test the actual handler with external boundaries faked |

## Open questions (owner's call, none block W1/W2)

1. **Dead columns**: `trigger_hour_start`, `trigger_hour_end`, `max_videos_per_trigger`, `day_time_windows`, `facebook_ai_generated` are in the DDL and in the generated types but used by no function or form. Drop them, or wire them into the schedule UI? Dropping is destructive and waits for an answer.
2. **`workflows` has two policy sets live**: `workflows_select/insert/update/delete` (which allow the magic `00000000-…` owner) and `workflows_*_own`. `20260703000000_restore_backdoor_rls.sql` looks deliberate — confirm, or narrow the legacy set.
3. **Deploy go**: apply all three migrations (drift, history table, latest-run RPC), then deploy `process-workflow` and the web dashboard. Commit, push and deployment require fresh explicit approval.
