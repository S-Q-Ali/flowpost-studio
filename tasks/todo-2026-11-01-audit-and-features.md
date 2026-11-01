# Todo — Audit Fixes + Dark Mode, Guided Setup, Browser Connect

Plan: `tasks/plan-2026-11-01-audit-and-features.md` · Created 2026-11-01 · Status: awaiting approval

## Phase A — Edge and web security
- [x] A1. Hard-deny sessions with a null user id
- [x] A2. Revoke sessions per user, not globally
- [x] A3. Accept a Supabase access token from the web client
- [x] A4. Atomic post claim before publishing
- [x] A5. Allowlist `driveDownloadUrl` in LinkedIn and TikTok
- [x] A6. Unique index + non-terminal guard for publish-now
- [x] A7. Sign-out revokes the admin token
- [x] A8. Per-workflow lock
      - `workflow_locks` key is now `workflow:<id>` (30-min TTL), taken just before the run and released at the end of every path, including `continue`. Different workflows run side by side; a manual run of a busy workflow gets 409.
- [x] A9. Batch scheduler + reaper heartbeat
      - One conditional `update … in(ids) eq(status, scheduled)` claims the batch; `Promise.allSettled` publishes the claimed rows in parallel.
      - The reaper fails `processing`/`publishing` rows whose `claimed_at` is older than 30 min, falling back to `scheduled_at` (or `created_at` for rows inserted without one), and clears `claimed_at`.
- [x] A10. Rate-limit the real caller, fail closed
      - New `consume_rate_limit(key, max, window)` RPC (SECURITY DEFINER, service_role only) does the count in one statement.
      - `_shared/rate-limit.ts` is one `consumeRateLimit` + `consumeQuota`; an RPC error refuses (503 at the call sites), never opens.
      - `verify-license` counts per IP and per key hash; `verify-security-questions` per IP; captions keep their hourly quota.
- [x] A11. Server-side upload size and type ceiling
      - `checkUpload` in `_shared/upload.ts`: empty → 400, over 200 MB → 413, content type outside the video/image allowlist → 415. `upload-local-file` refuses before it talks to R2.
- [x] A12. Run Deno tests in CI — not a finding: `vitest.config.ts` already includes `supabase/functions/_shared/**` and CI runs `npm test` (155 tests pass)
- [x] A13. Delete `verify-password`, `verify-session`, frontend-api-key branch
      - `verify-password` is a 410 tombstone (file deletion is blocked in this sandbox).
      - `verify-session` is kept on purpose: `desktop-flutter/lib/features/identity` calls it, and it now also serves logout revoke.
      - The `frontend-api-key` branch and `FRONTEND_API_KEY` reads are gone (no client ever sent that key).
- [x] A14. Bind a license to a user
- [x] A15. Phase A gate
      - `npm test`: 196 passed (was 192 before Phase A). `npx tsc -b`: clean. `npm run build`: built.
      - No Deno runtime in this sandbox, so the shared `_shared` tests run through vitest, as CI does. Lint remains advisory (pre-existing `any` baseline documented in `ci.yml`).
      - Deploy stays owner-assisted (task I12).

## Phase B — Desktop correctness
- [x] B1. Close the duplicate-publish window
      - `PublishDone` carries the run signature (media, mode, schedule, title, sorted `target=caption` rows). `publish()` returns early on a match; the button is off and says the post is already sent.
      - Deliberate limit: only a run where every target went out records the signature. A run with a failed or unconfirmed target leaves `signature` null, so the same inputs stay retryable — the retry button is not always available (the row must read back as failed).
      - Test: 5 controller tests (repeat, reordered targets, edited caption, another file, failed run) + 3 widget tests (button off, caption edit re-opens it, failure keeps it live).
- [x] B2. Delete stale media only in the primary instance
- [x] B3. Fence a replaced media job
      - Fixed: `MediaController` keeps the current `MediaJob`; a run whose id is no longer current writes no state, deletes no folder and never takes `_processor`. A new pick cancels the old encode.
      - The old code also deleted the *new* file's folder when the replaced encode answered with a cancellation — that is the data-loss case now covered by a test.
- [x] B4. Release workflow for the desktop installer
      - `.github/workflows/release-desktop.yml` builds on a `desktop-v*` tag, passes the version to Inno Setup, writes a `.sha256` sidecar and publishes both with `gh release`.
      - The first real tag is the owner's to push; no dry run has been done.
- [x] B5. Fix the landing download CTA
      - `src/lib/desktop-download.ts` gives the CTA the releases page today and the direct asset once `INSTALLER_ASSET` names it; `index.html` and the README no longer point at `releases/latest`.
- [x] B6. Re-check session expiry (timer + 401)
      - `LicenseController` waits on the grant's expiry (the service's clock), drops the token, then tries the stored key; `posts-api`'s 401/403 now arrives as `PostsErrorKind.rejected` and drives the same re-check with `refused: true`, which ignores the local clock.
      - Captions, upload and the publish function still show only their own error text — the re-check hangs off `posts-api`.
- [x] B7. Clear the vault when one key fails
      - `SecureLicenseStore.clear()` tries all three records and reports one `storageUnavailable` failure; the session and cache still end in the app.
- [x] B8. Report network failures properly
      - `connection_failure.dart` holds the sentence and the test for a socket or TLS failure; both media transports rethrow it as their own typed error instead of letting the raw exception reach the generic panel.
- [x] B9. Drain FFmpeg streams before closing
      - The runner reads both pipes to the end after the exit code lands (two-second backstop for a held handle) instead of cancelling mid-tail; `FfmpegRunner` gained a start seam so a fake process can prove the line after the exit survives.
- [x] B10. Stop FFmpeg on quit
      - `quit()` calls `killRunningFfmpeg()` before anything that could end in `exit(0)`; the runner keeps its child in a process-global slot, the way the pipeline runs one encoder at a time.
- [x] B11. Delete the dead identity module
      - 12 lib files and 8 test files (3,920 lines) gone, plus the three route constants no router served; `supabase_flutter` left `pubspec.yaml` with them because nothing else imported it. `flutter_secure_storage` stays — the license vault still uses it.
- [x] B12. Draft restore must not overwrite edits
      - `_restore` compares the number of form changes it saw when the read started with the number now; any edit in between means the draft is the older form and is dropped.
- [x] B13. "Try again" retries the same file
      - `MediaFailed` holds the job that failed and `retry()` re-runs it; the picker opens only from "Choose another file" or when no file was kept.
- [x] B14. Sniff image types from bytes
      - The upload reads the first 12 bytes of an image: JPEG/PNG/WEBP come from the signatures, and only an unrecognized header falls back to the extension. Videos keep the type the pipeline settled, and their path never awaits, so a cancel still stops the request.
- [x] B15. Phase B gate
      - Format 0 changed, analyze clean, 818 tests passed, release build produced `flowpost.exe`. The first build attempt failed on `atlstr.h` because the VS Build Tools had no ATL component; the owner installed it and the build passed.

## Phase C — Real publish targets
- [x] C1. `account-list` in posts-api
      - `ACCOUNT_COLUMNS` carries the display fields plus `token_expiry` and no token; `listAccounts` scopes the read to the session user, and the fake table proves another user's row stays out of the answer.
- [ ] C2. Desktop accounts repository from the server
- [ ] C3. Publish targets derived from connected accounts
- [ ] C4. Checkpoint: connect + publish on a real server

## Phase D — Dark mode
- [ ] D1. Dark palette + contrast tests
- [ ] D2. Replace hardcoded colours
- [ ] D3. Persist and apply the mode
- [ ] D4. Settings appearance section
- [ ] D5. Checkpoint: both modes on every screen

## Phase E — Guided setup wizard
- [ ] E1. Step model and copy
- [ ] E2. Vault-backed `operator-config` + `config-status`
- [ ] E3. Vault read path with env fallback
- [ ] E4. Desktop client + controller
- [ ] E5. Wizard UI (two tracks, stepper, tests)
- [ ] E6. First run and Settings entry
- [ ] E7. Checkpoint: clean folder → wizard → usable

## Phase F — Browser account connections
- [ ] F1. Deep-link contract + pending nonce store
- [ ] F2. `return_to` allowlist in the six auth functions
- [ ] F3. `connect-url` and `disconnect` in posts-api
- [ ] F4. Desktop connect / disconnect / reconnect
- [ ] F5. Account cards + publish wiring
- [ ] F6. Prove browser sign-out independence
- [ ] F7. Checkpoint: connect, close browser, publish

## Phase G — Release and docs
- [ ] G1. README, `.env.example`, ADR, runbook
- [ ] G2. Final gate + audit + graphify

## Audit coverage

| Web/edge finding | Task |
|---|---|
| 1 null user session | A1 |
| 2 global session wipe | A2 |
| 3 non-admin 401 | A3 |
| 4 publish accepted while processing | A4 |
| 5 SSRF via driveDownloadUrl | A5 |
| 6 duplicate publish-now row | A6 |
| 7 token not revoked on logout | A7 |
| 8 global workflow lock | A8 |
| 9 scheduler cap / serial wait | A9 |
| 10 spoofable rate limit | A10 |
| 11 unbounded upload | A11 |
| 12 Deno tests not in CI | A12 — verified false: vitest already runs them in CI |
| 13 dead auth paths / shared license identity | A13, A14 |

| Desktop finding | Task |
|---|---|
| 1 publish targets always empty | C1, C2, C3 |
| 2 duplicate publish window | B1 |
| 3 second launch deletes workspaces | B2 |
| 4 media job race | B3 |
| 5 dead download link | B4, B5 |
| 6 no session expiry recheck | B6 |
| 7 partial vault clear | B7 |
| 8 upload network error misread | B8 |
| 9 FFmpeg tail truncated | B9 |
| 10 orphan FFmpeg on quit | B10 |
| 11 dead identity module | B11 |
| 12 draft restore overwrite | B12 |
| 13 "Try again" reopens picker | B13 |
| 14 image MIME from extension | B14 |
