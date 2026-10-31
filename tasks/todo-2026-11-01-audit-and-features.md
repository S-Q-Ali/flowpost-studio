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
- [ ] B2. Delete stale media only in the primary instance
- [ ] B3. Fence a replaced media job
- [ ] B4. Release workflow for the desktop installer
- [ ] B5. Fix the landing download CTA
- [ ] B6. Re-check session expiry (timer + 401)
- [ ] B7. Clear the vault when one key fails
- [ ] B8. Report network failures properly
- [ ] B9. Drain FFmpeg streams before closing
- [ ] B10. Stop FFmpeg on quit
- [ ] B11. Delete the dead identity module
- [ ] B12. Draft restore must not overwrite edits
- [ ] B13. "Try again" retries the same file
- [ ] B14. Sniff image types from bytes
- [ ] B15. Phase B gate

## Phase C — Real publish targets
- [ ] C1. `account-list` in posts-api
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
