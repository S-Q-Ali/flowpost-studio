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
- [ ] Owner's yes, then: apply all three migrations through the Management API (`POST /v1/projects/<ref>/database/query`, versions fixed in `supabase_migrations.schema_migrations` so `db push` sees no drift) and redeploy `process-workflow`, then the web dashboard
- [ ] Read back: after one cron tick, `select workflow_id, triggered_by, status, rows_seen, posts_created, message from workflow_runs order by started_at desc limit 6;` shows one closed row per live workflow
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

## Not started — needs its own go

- [ ] **W3** named stages (`workflows.steps jsonb`, per-item `step`/`step_status`/`error`/`attempt`, server-side captions)
- [ ] **W4** desktop Workflows screen (read-only: list, last run, item status; Run now is separate write scope)
- [ ] Dead-column decision and the `workflows` legacy-policy question — see the plan's Open questions
