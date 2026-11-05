# Todo: Workflows — run history and rebuild-safe schema

**Plan:** `tasks/plan-2026-11-05-workflows.md`
**Rule:** gates before completion; keep commits scoped. New commits, push and deployment need fresh explicit approval.
**Evidence base:** every claim about production was read from `ximorwzknbizpceaoflw` on 2026-11-05 (live `information_schema`, `pg_policies`, `cron.job`), not inferred from the repo.

## W1 — Rebuild-safe schema

- [x] **W1** `20261105120000_workflow_drift.sql` (`09419ab`)
  - [x] `workflows.post_as_story boolean`, `workflows.youtube_altered_content boolean`, each `add column if not exists`
  - [x] `workflow_locks` RLS enabled + `workflow_locks_service_only` policy (`auth.role() = 'service_role'`), matching what is live
  - [x] Diff recorded here: the live read on 2026-11-05 showed both columns present on `workflows` and the policy present on `workflow_locks`; the migration only puts them on record, so applying it to production changes nothing and a rebuild from migrations reproduces what is live. Nothing else in `supabase/migrations/` is missing from production for these two tables.
  - [x] Commit

## W2 — Run history

- [x] **W2a** `20261105130000_workflow_runs.sql` (`cf7fc74`)
  - [x] Table with id, workflow_id (FK `on delete cascade`), triggered_by, status, rows_seen, posts_created, message, started_at, finished_at
  - [x] CHECKs: triggered_by `('cron','manual')`, status `('running','completed','failed')`
  - [x] Indexes `(workflow_id, started_at desc)` and `(started_at)`; RLS on; one owner-select policy (`EXISTS` on `workflows`), no write policy because `service_role` bypasses RLS
  - [x] Commit
- [x] **W2b** `supabase/functions/_shared/workflow-runs.ts` (+ test) (`34db313`)
  - [x] RED first: a failed insert returns null and does not throw; closing a null run id is a no-op; the close sets `finished_at` and the counters
  - [x] `openWorkflowRun` / `closeWorkflowRun` take `supabase` as a parameter (the `reportConnectResult` shape)
  - [x] `describeRun(report, newErrors, failed)` keeps fatal failures failed, including partial work; errors with no created posts also fail
  - [x] Open, close and both maintenance operations use one-second abort deadlines and swallow/log database errors
  - [x] Helper suite green (15 tests), including real client requests with a stalled fake fetch
  - [x] Same deadline cases replayed against the version the functions pin (`@supabase/supabase-js@2.49.0`) in an isolated install outside `node_modules`; open, close and maintenance each gave up at ~1.01s with every signal aborted, and 2.49.0 reports the stall as an error object (`message: "TimeoutError: The operation was aborted due to timeout"`) rather than a throw, so publishing is never blocked. The suite itself runs the frontend client (2.118.0) because the pinned one is not a workspace dependency.
  - [x] Commit
- [x] **W2c** `process-workflow` opens and closes one run per entered workflow
  - [x] Open after `takeWorkflowLock` succeeds; close only at the two existing release points (top of the loop, and the end-of-function `finally`)
  - [x] `continue` sites reach a close attempt; failed closes and killed invocations rely on a later successful stale sweep. `heldRun` is per-request, not shared by invocations
  - [x] Fatal errors close `failed`; a missing history ID never prevents resetting per-workflow state
  - [x] Counts use actual inserted target and Instagram story posts, not media rows/images; counters survive subsequent row/fatal errors
  - [x] Nine real-handler integration tests pass using fake external boundaries; the reviewed defects failed before fixes
  - [x] Manual 409 (already running) writes nothing; schedule skips write nothing
  - [x] 90-day purge of `workflow_runs` next to the expired-lock sweep
  - [x] Parse check clean (`node --check` on the stripped file — no Deno here, no Deno job in CI); commit
- [x] **W2d** web cards show the last run (initial implementation `23ca358`, corrections uncommitted)
  - [x] `20261105140000_latest_workflow_runs.sql`: invoker-security `DISTINCT ON` RPC, one call for all cards
  - [x] Copy says `N posts created · publication not confirmed` / `nothing was ready` / `failed: <message>`; no row retains legacy trigger text
  - [x] Failed/timed-out reads show `Run history unavailable`; long errors wrap visibly
  - [x] Four component tests and eight label tests pass, including unavailable/no-history states and valid schedule markup
  - [x] Local synthetic browser: completed/empty/failed/running/no-history/long error, 320/768/1024/1440 widths without horizontal overflow
  - [x] `npx tsc -b --force` and `npm run build` pass
- [ ] **W2e** gates, docs, graph
  - [x] `npx vitest run`: 441 tests / 33 files pass; `npx eslint .`: 0 errors / 184 warnings; `npx tsc -b --force` and `npm run build` pass
  - [x] `docs/runbook.md`: history meaning, troubleshooting, three-migration deploy order and read-back
  - [x] `docs/adr/0007-workflow-run-history.md`: bounded best-effort writes and created-not-published semantics
  - [x] `graphify update .` completed
  - [x] Local synthetic browser: history read-error and empty-page states; Create Workflow opens, Tab moves focus, Escape closes and restores focus; no console errors/warnings or external API requests
  - [x] Commit and push (owner's go 2026-11-05): six commits — `95c89c6` deadlines, `974d921` counts and failed runs, `29e1fe6` web labels and unavailable state, `293fba2` ADR 0007 and runbook, `ffdec12` this plan, `53bc795` graph — pushed `b82b5b8..53bc795` to `origin/main`

## Checkpoint: W2

- [x] Every gate above run and green — 441 tests, 0 lint errors, type-check, Vite build, synthetic browser at four widths, graph update
- [x] Deadlines proven against the pinned 2.49.0 server client, outside the suite: `npm install --prefix <temp dir> --no-save --ignore-scripts @supabase/supabase-js@2.49.0`, then run the helper's three deadline cases with a fake `fetch` that never answers (transpiled from `supabase/functions/_shared/workflow-runs.ts` with the workspace TypeScript). Hold the Node event loop with a ref'd timer — `AbortSignal.timeout()` is unref'd. Script kept at `E:\tmp\pinned-deadline-verify.cjs`, not in the repo, so no dependency is added to verify it.
- [x] Deno type-check — see **DG** below: run for the first time on 2026-11-05, 77 errors found and fixed, `deno check` now exits 0 over all 53 deployed files, and CI has a blocking `functions` job so it can never be skipped again
- [x] Pushed CI gate green on `53bc795` (2026-11-05): CI [Lint, Web (type check, test, build, dependency audit), Desktop] and CodeQL all success — https://github.com/S-Q-Ali/flowpost-studio/actions/runs/42050207829. That run did **not** type-check the Edge Functions; the `functions` job added under **DG** closes the gap.
- [x] Owner's yes received and spent (2026-11-05): all three migrations applied through the Management API and recorded by filename version, and `process-workflow` redeployed v157 → v158. Evidence in **DP** below. The web dashboard is still owner-side — no Vercel origin or token lives in this repo.
- [ ] Read back after a **due** tick: the first tick post-deploy was 18:15 UTC and `custom_ranges` are UTC hours, so no workflow was entered and `workflow_runs` legitimately stayed empty. Next entries ~20:50 and ~21:10 UTC on 2026-11-05.
- [ ] Owner sees the last run in the browser

## DG — the release gate CI never had

- [x] **DG1** Install Deno outside the repo (no PATH or registry change): official
  `deno-x86_64-pc-windows-msvc.zip` at `E:\tmp\deno\deno.exe`, 2.9.8, digest compared
  by hand against `Get-FileHash` because GitHub's `.zip.sha256sum` is PowerShell
  output, not `sha256sum -c` format.
- [x] **DG2** `supabase/functions/deno.json`: `nodeModulesDir: "auto"` — without it
  Deno 2.9.8 refuses to resolve the `npm:` specifiers at all. No `imports` map: the
  check is green without one (proved by deleting it and re-running), and every
  function already pins its own `npm:@supabase/supabase-js@2.49.0`. `"lock": false`
  because the command runs with `--no-lock`.
  First `deno check` of the deployed code: **77 errors**. All fixed, category by
  category:
  - 43 + 6 in `_shared/auth.ts` and its callers — `Deno.env.get()` answers
    "unset" with `undefined`, request headers with `null`; the interfaces now say
    so (`EnvSecret`), and the three narrowing sites test `auth.allowed` instead of
    assuming it.
  - 3 **real crashes**: `process-workflow` called `.catch()` on a Postgrest builder.
    The pinned 2.49.0 builder is a thenable with no `.catch`, so a failed upload
    fetch threw a `TypeError` that `Promise.allSettled` swallowed and the post
    stayed in `processing` forever. RED first — the new fixture test failed with
    "expected [] to have a length of 2", GREEN after the fix, 10/10 in the file.
  - 2 **real bugs**: `drive-to-mega` assigned to an undeclared `onProgress`
    (ReferenceError in strict ESM, so the progress stream could never run);
    `get-file` called `downloadBuffer()` with the argument its own types require.
  - 3 **real bugs**: `instagram-upload` read the to-one `videos(*)` embed as an
    array (untyped client inference) and used a hoisted `function` that lost the
    `post`-non-null narrowing; `youtube-upload` used `megaFile.size` that TS says
    can be undefined — now throws instead of sending `Content-Length: 0`.
  - 6 `duplex: "half"`: probed against Deno 2.9.8 — the property is inert in
    Deno's `RequestInit`. Kept and annotated with the repo's own
    `@ts-expect-error` precedent rather than deleted, because these are live
    publish paths.
  - Type-boundary singles: the hand-rolled `HmacSubtle` seam in `_shared/license.ts`
    deleted in favour of the platform `SubtleCrypto`; `Buffer` → `Uint8Array<ArrayBuffer>`
    for the fetch body in `get-file` (the plain cast and the zero-copy view both
    fail TS2345 — settled by a compile probe, not belief); `Record<string, unknown>`
    → `string | undefined` at the linkedin-auth boundary.
  - Every change is behaviour-preserving except where the behaviour *was* the bug.
- [x] **DG3** CI: blocking `functions` job in `.github/workflows/ci.yml`
  (`denoland/setup-deno@v2`, pinned 2.9.8) running `deno check --no-lock` over
  `*/index.ts` and the non-test `_shared/*.ts` — the same 53 files.
- [x] Gates after the fixes: `deno check` exit 0, and a cold run prints 53 `Check`
  lines with 0 errors — every deployed entry point, not a cache hit; `npm test` 442
  tests in 33 files, `npm run lint` 0 errors / 184 warnings, `npx tsc -b` clean,
  `npm run build` clean.
- [x] Commit and push (owner's go 2026-11-05, "sab karo"): four atomic commits —
  `03e830b` the 77-error fix plus the failing test, `79b7a29` `deno.json` + the CI
  job, `3152984` runbook and plan/todo records, `a8e83f8` graph — pushed
  `48cfe53..a8e83f8` to `origin/main`
- [x] New job proven green on the pushed commit: CI run 42058443145 — Edge
  Functions, Web, Lint and Desktop all success, CodeQL success
  (https://github.com/S-Q-Ali/flowpost-studio/actions/runs/42058443145). The
  `Edge Functions` log shows 114 dependency downloads and 53 `Check` lines with
  zero errors, so it really type-checked every entry point from cold, in 12s.
- [x] `Edge Functions` added to the required status checks for `main`. The contexts
  are now `Web`, `Desktop`, `Edge Functions` (`strict: true`). `enforce_admins` is
  off, so a direct push to `main` still lands; these gate pull requests.
- [x] `Lint` added to the required status checks (owner's go 2026-11-05). The
  drift is closed: `e4b5048` said "make Lint blocking" but the protection only
  carried `Web` and `Desktop`. Required contexts are now `Web`, `Desktop`,
  `Edge Functions`, `Lint` with `strict: true`; `enforce_admins` stays off, so a
  direct push to `main` still lands and the owner reads the run.

## DP — pre-deploy readiness (read-only, 2026-11-05)

Everything below was read from `ximorwzknbizpceaoflw` on 2026-11-05 with the
`.env` `ACCESS_TOKEN`; nothing was written. `GET /v1/projects` answers `200`,
one project, `ACTIVE_HEALTHY` — so the token that blocked CD6 is valid again.

- [x] **State of the database.** `supabase_migrations.schema_migrations` holds
  40 versions; `supabase/migrations/` holds 43 files. Diffed on the 14-digit
  prefix: the only unapplied ones are `20261105120000`, `20261105130000`,
  `20261105140000`, and there is **no** live-only drift in the other direction.
- [x] **What each migration actually changes live.** `workflow_runs` absent
  (`has_runs_table = false`) and `latest_workflow_runs()` absent (`has_rpc = 0`),
  so W2a and W2d create real objects. The two drift columns are already there
  (`drift_cols = 2`) and `workflow_locks` exists, so W1 records state and applies
  nothing. Every statement is `if not exists` / `DO $$`, so a re-run is a no-op.
- [x] **No new secrets.** `git diff` of the W2 + Deno work over
  `supabase/functions` adds no `Deno.env.get` — the run-history writes use the
  service client the function already has. Nothing to set under
  Edge Functions → Secrets before this deploy.
- [x] **Scheduler still armed.** `cron.job` 28 `process-workflows` and 29
  `process-scheduled-posts`, both `*/5 * * * *` and `active = true`.
  Caveat for the next reader: `cron.job.command` stores the CRON_API_KEY in
  plaintext, so this query prints a live secret. Never paste its output into a
  doc, an issue or a commit.
- [x] **What is deployed.** `functions list`: `process-workflow` v157,
  `updated_at 2026-11-04T13:37:55Z`. That predates both `cbe8de3` (the run rows)
  and `03e830b`, so production is missing the feature **and** still carries the
  three builder-`.catch` crashes: a failed upload fetch today throws a
  `TypeError`, `Promise.allSettled` swallows it and the post stays `processing`.
  This deploy is the fix for a live defect, not only for the new history.
- [x] **CI gates for the code being shipped** — all green on `bd4b0fb`, which is
  `origin/main`: Web (type check, 442 tests, build, audit), Lint, Desktop,
  Edge Functions (53 entry points, cold). CodeQL success. Four required contexts,
  `strict: true`.
- [x] **Owner's go (2026-11-05) — applied in this order**, each step read back
  before the next. The SQL goes through `POST …/database/query` and the version
  row is written to match the filename, because the recorded versions must equal
  the file timestamps or a later `db push` sees drift; `20261105000000` is
  recorded that same way already (`name = oauth_state_result`,
  `statements = null`). The helper is `E:\tmp\apply-run-history-migrations.cjs` —
  outside the repo, like the 2.49.0 deadline script — and it reads the token from
  `.env` without printing it. `--dry-run` first, then apply:

  ```bash
  node "E:/tmp/apply-run-history-migrations.cjs" --dry-run   # prints what it would send
  node "E:/tmp/apply-run-history-migrations.cjs"             # applies, then reads back
  ```

  Before: `tracked=40, new_rows=0, has_runs_table=false, run_columns=0,
  run_policies=0, has_rpc=0`. After: `tracked=43, new_rows=3,
  has_runs_table=true, run_columns=9, run_policies=1, has_rpc=1`. Re-running the
  prefix diff gives **empty in both directions** — 43 local against 43 live, so
  `db push` now sees no drift either way.
- [x] **Schema read-back, object by object.** `workflow_runs`: RLS on, 3 indexes
  (`workflow_runs_pkey`, `workflow_runs_started`,
  `workflow_runs_workflow_started`), exactly one policy
  `"Users can read own workflow runs"` with `cmd = SELECT`, 6 not-null columns,
  2 CHECK constraints (`triggered_by`, `status`). `latest_workflow_runs()` exists
  with `prosecdef = false` — invoker security, so it inherits the policy instead
  of bypassing it. The two drift columns are on `workflows` as W1 said they
  would be.
- [x] **Function redeployed** — `npx supabase functions deploy process-workflow
  --remote=ximorwzknbizpceaoflw --yes` uploaded `index.ts` plus six `_shared`
  modules including the new `workflow-runs.ts`, and
  `GET /v1/projects/<ref>/functions` reads **v158**, `status ACTIVE`,
  `updated_at 2026-11-05T18:12:36.702Z` (was v157 at 2026-11-04T13:37:55Z). Boot
  probe — `POST /functions/v1/process-workflow` with `{}` and no key — answers
  **401 `{"error":"Unauthorized"}`** from the function's own caller check, with
  no `sb-error-code: BOOT_ERROR` header, so the module instantiated. No
  `workflowId` was ever sent.
- [x] **The scheduler ran the new code.** First tick after the deploy:
  `cron.job_run_details` jobid 28 `succeeded` at `18:15:00.120Z`, and `pg_net`
  recorded the real call — `net._http_response` **status 200**, content
  `{"processed":0,"workflows_triggered":0,"errors":[]}`. That is the answer the
  redeployed isolate gives, not a platform rejection.
- [x] **Why history is still empty, and it is not a fault.** `custom_ranges` are
  **UTC hours** (`workflow-schedule.ts` reads `getUTCDay()` and `getUTCHours()`),
  and both active workflows have day-4 ranges `08–10` and `20–22`. The tick above
  landed at 18:15 UTC, so no workflow was entered and — by W2c's design — an
  un-entered workflow writes no row. Predicted next entries from the same
  `customRangeTarget` hash: **VSC FB+IG 20:50–20:55 UTC, SVC FB+IG 21:10–21:15
  UTC** on 2026-11-05.
- [ ] **Rollback for this release** (general form in `docs/runbook.md` →
  Rollback; this is the release-specific one):
  - `process-workflow` alone:
    `git checkout a3df4b5 -- supabase/functions/process-workflow && npx supabase functions deploy process-workflow --remote=ximorwzknbizpceaoflw --yes && git checkout HEAD -- supabase/functions/process-workflow`.
    `a3df4b5` is the last commit that touched the file before `cbe8de3` added the
    run rows, so the rollback bundle keeps the pre-history scheduler and loses
    only the new feature. Takes under five minutes.
  - History misbehaving without a rollback: the writes are best-effort with a
    one-second deadline each and swallow their own errors, so disabling the
    feature is a redeploy, not a schema change.
  - Database: `drop function if exists public.latest_workflow_runs(); drop table
    if exists public.workflow_runs;` then delete the two version rows from
    `supabase_migrations.schema_migrations`. Nothing else depends on either
    object and the table holds only run history, so dropping it loses no user
    data. The drift migration has nothing to undo — it records columns that were
    already live.
  - Order matters and is fixed above: **migrations first, then the function.** A
    new function against an absent `workflow_runs` still publishes (the open
    fails, the run is simply not recorded), but the dashboard would show
    "Run history unavailable" until `latest_workflow_runs()` exists, and the web
    goes last for that reason.
  - Web: Vercel keeps every deployment; promote the previous one.
- [x] **First-hour checks done from the server side** (2026-11-05):
  - Ticks after the deploy: job 28 and job 29 both `succeeded` in
    `cron.job_run_details`, and `net._http_response` carries their real 200
    bodies — `process-workflow` `{"processed":0,"workflows_triggered":0,"errors":[]}`,
    `process-scheduled-posts` `{"processed":0,"total":0}`. No 4xx/5xx, no
    `timed_out`.
  - `select count(*) from public.workflow_runs` → **0**, which the due-window
    reading above explains. The table, its policy and its RPC exist and are
    reachable; that is all a no-work tick can prove.
- [ ] **Still open, and each one needs the next due window or the owner:**
  - A **closed** row per entered workflow: after ~20:50 and ~21:10 UTC (or the
    same windows tomorrow), read
    `select workflow_id, triggered_by, status, rows_seen, posts_created, message, started_at, finished_at from public.workflow_runs order by started_at desc limit 20;`.
    A `running` row older than 20 minutes should be swept to `failed` by the next
    successful maintenance pass — that is the other half of W2c and it is still
    unproven in production.
  - Cross-account RLS: with zero rows every probe answers `[]` and proves
    nothing, so read it once rows exist — the owner's own account sees its last
    run, a second account sees none. The `E:\tmp\verify-rpc-rls.cjs` attempt on
    2026-11-05 stopped at the key: `api-keys?reveal=true` now returns every key
    with `is_public = false`, so there is no public key to call REST with, and a
    call against an empty table would not have distinguished the policy from the
    row count anyway.
  - The browser check on the workflow cards — needs the dashboard deployed (next
    item) and the owner's eyes.
  - The upload-failure crash fix has no production witness yet: it only runs when
    a real upload fetch fails, which cannot be provoked without publishing.
- [ ] **Web dashboard: not deployed by this run.** W2d is on `origin/main`
  (`29e1fe6`, `23ca358`) and CI is green there, but no Vercel project origin or
  token is recorded in this repo (`vercel.json` exists; the live URL is nowhere
  in `README.md`, `docs/` or `.env`), and the deploy is owner-side. Until it
  ships, the cards keep calling the old bundle — the new RPC is live, so nothing
  breaks either way.

## Not started — needs its own go

- [ ] **W3** named stages (`workflows.steps jsonb`, per-item `step`/`step_status`/`error`/`attempt`, server-side captions)
- [ ] **W4** desktop Workflows screen (read-only: list, last run, item status; Run now is separate write scope)
- [ ] Dead-column decision and the `workflows` legacy-policy question — see the plan's Open questions
