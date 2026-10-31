# Implementation Plan: Audit Fixes + Dark Mode, Guided Setup, Browser Account Connections

**Status:** Approved and building. Phase A (web and edge security) is complete; Phase B onward is open.
**Created:** 2026-11-01
**Owner override carried forward:** the desktop app is the product; the web app is the landing page + backend.
**Companion task list:** `tasks/todo-2026-11-01-audit-and-features.md`
**Why a new file:** `tasks/plan.md`, `tasks/plan-license.md` and `tasks/todo.md` still carry open work from the MVP and license tracks. They are not overwritten or archived here.

---

## What this plan covers

1. **Fix every confirmed audit finding** — 13 web/edge (security, publish correctness, scheduler, CI) and 14 desktop (publish, media races, vault, FFmpeg, dead code).
2. **Dark mode** in the desktop app (system / light / dark).
3. **Guided setup** — a step-by-step, free-of-cost wizard for the credentials a deployment needs (Supabase, Cloudflare R2, Google, Meta Graph, TikTok, LinkedIn).
4. **Browser-based account connections** — connect YouTube, Instagram, Facebook, TikTok and LinkedIn in the user's own browser; tokens stay server-side, so later browser sign-out does not break the desktop.

Assumed load: one operator, a handful of users, desktop clients calling Supabase edge functions. The heavy work (OAuth exchange, token refresh, publishing) stays server-side.

---

## Decisions taken

| # | Decision | Why |
|---|---|---|
| D1 | Provider tokens never land on the desktop. The desktop keeps only its license session. | Tokens already live encrypted in `connected_accounts` with refresh tokens (`youtube-auth:209-225`). Server-side custody is what makes "browser sign-out does not break the desktop" true, and it shrinks the desktop attack surface. |
| D2 | Browser connect uses the system browser + `flowpost://` deep link and a desktop-generated nonce, stored on the edge side. | Matches Google/Meta policy (no embedded webviews) and the existing HKCU `flowpost://` registration. New code, not the dead identity module. |
| D3 | Callback redirects become an **allowlist**: `flowpost://connect-callback` and the existing Vercel URL. No free-form `return_to`. | Prevents open redirect on a public callback (`youtube-auth` callback is unauthenticated by design). |
| D4 | Guide secrets are written to **Supabase Vault** by an admin-only function, never stored on the desktop; read path falls back to function env vars. | The operator can finish setup without dashboard copy-paste; existing deployments keep working. No paid plan needed. |
| D5 | The wizard has two tracks: **end user** (server URL + anon key + license) and **operator** (full credential setup). | An end user must never be asked for an R2 secret; the operator sets it once for the whole server. |
| D6 | Dark mode is built from the same HSL tokens, with contrast tested; hardcoded colours are replaced by `ColorScheme` lookups. | 22 hardcoded colour reads across 6 files would otherwise stay light on a dark surface. |
| D7 | The dead `features/identity` module is deleted (1,704 lib + 2,216 test lines), not revived. | Nothing in `lib/` imports it; license sessions replaced it. The connect flow needs ~100 lines, not 3,900. |
| D8 | Audit fixes ship first, in severity order, each as its own commit with a test. | Security and data-loss fixes unblock the features (publish targets need real accounts; connect needs the auth fixes). |

---

## Feature specs (short form)

### Dark mode

- Palette: light and dark variants of the existing tokens in `lib/core/theme/app_theme.dart`; `ThemeMode` from a `themeControllerProvider`.
- Persistence: `preferences.json` in the app-support directory (same pattern as `accounts.json`), values `system | light | dark`.
- Loaded before the first frame so the window never flashes light.
- Success: switching from Settings re-themes live, survives restart, follows the OS in `system` mode, and body text keeps ≥ 4.5:1 contrast.

### Guided setup wizard

- Step model: `id`, title, why, cost ("free"), dashboard URL, fields, test action, optional flag.
- End-user track: 3 steps — server URL + anon key (test connection), license key (activate), done.
- Operator track: Supabase → deploy functions → Groq (captions) → Cloudflare R2 (media) → Google OAuth → Meta (Instagram + Facebook) → TikTok → LinkedIn → optional license.
- Each step: exact dashboard links, what to copy, masked fields, a real "Test" that hits the server, "Skip for now", resumable progress.
- Secrets travel desktop → `operator-config` (license-session guarded) → Supabase Vault. The desktop keeps only "configured" booleans from `config-status`; values are never returned, logged or put in diagnostics.

### Browser account connections

- Connect: desktop calls `posts-api {action:"connect-url", platform}` → gets a browser URL plus the server-created OAuth state; the desktop also holds its own 32-byte `nonce`, sent along and stored on the state row.
- Browser: the platform consent screen, then the existing callback exchanges the code, encrypts and stores the tokens, then redirects to `flowpost://connect-callback?platform=…&status=ok&nonce=…`.
- Desktop: validates scheme/host exactly, nonce match, 10-minute expiry, then refreshes accounts. A replay or a stale link is rejected silently.
- Disconnect: `posts-api {action:"disconnect"}` deletes the row (and best-effort revoke).
- Expired refresh token: account shows "Reconnect"; publishing to it is blocked with a clear message.
- Success: connect and publish work with the browser closed and after the user signs out of the platform site.

---

## Phase A — Edge and web security (fixes web findings 1–13)

- [x] **A1. Hard-deny sessions without a user id** — Must (web 1)
  - Accept: `isRequestAuthorized` rejects a `sessions` row with `user_id = NULL`; `resolveSessionOwner` denies any session without a user id; no `if (sessionUserId)` guard remains as the only check.
  - Verify: new `_shared/auth.test.ts` cases for null-user session and mismatched id; `deno test supabase/functions/_shared`.
  - Files: `supabase/functions/_shared/auth.ts`, `_shared/auth.test.ts`, `_shared/post-access.ts`.
  - Dep: none · Size: S.

- [x] **A2. Revoke sessions per user, not globally** — Must (web 2)
  - Accept: `createSession` deletes only rows for that user; a second sign-in no longer kills other sessions.
  - Verify: test that a session for user B survives `createSession(user A)`; `verify-license` / `verify-security-questions` pass the right user.
  - Files: `_shared/session.ts`, `_shared/session.test.ts`, `verify-license/index.ts`, `verify-security-questions/index.ts`.
  - Dep: A1 · Size: S.

- [x] **A3. Accept a Supabase access token from the web client** — Must (web 3)
  - Accept: `src/lib/invoke.ts` sends the current Supabase access token as bearer; `_shared/auth.ts` resolves it via `auth.getUser` and maps it to the app user; `flowpost_token` still works for the admin gate.
  - Verify: `_shared/auth.test.ts` JWT branch; one contract test per representative function (uploads, captions, posts-api); manual non-admin publish on the web.
  - Files: `src/lib/invoke.ts`, `src/contexts/AuthContext.tsx`, `_shared/auth.ts`, tests.
  - Dep: A1 · Size: M.

- [x] **A4. Claim a post atomically before publishing** — Must (web 4)
  - Accept: a shared `claimPost` updates `status: processing` only from `scheduled` (and the publish-now entry state) and returns no row for `processing`/`published`; all six upload functions use it.
  - Verify: `post-access.test.ts` — second claim on `processing` is rejected, first on `scheduled` wins; two parallel claims produce one winner.
  - Files: `_shared/post-access.ts`, `_shared/post-access.test.ts`, six `*-upload/index.ts`, `post-story/index.ts`.
  - Dep: A1 · Size: M.

- [x] **A5. Allowlist `driveDownloadUrl` in every fetch** — Must (web 5)
  - Accept: LinkedIn and TikTok run the existing `url-guard` check on `driveDownloadUrl` before any fetch; an internal or non-allowed host is rejected with 400.
  - Verify: `url-guard.test.ts` cases for `169.254.169.254`, `localhost`, and a valid Drive host; function-level test where practical.
  - Files: `supabase/functions/linkedin-upload/index.ts`, `tiktok-upload/index.ts`, `_shared/url-guard.test.ts`.
  - Dep: none · Size: S.

- [x] **A6. Stop a second publish-now row** — Must (web 6)
  - Accept: the upload-page guard matches any non-terminal status; a partial unique index covers `(user_id, video_id, platform, account_id)` for `scheduled`/`processing`.
  - Verify: migration applied on a scratch DB; test that a duplicate insert conflicts; UI shows the existing row instead of inserting.
  - Files: `src/pages/UploadPage.tsx`, `supabase/migrations/<new>_post_claim_index.sql`, related test.
  - Dep: A4 · Size: S.

- [x] **A7. Sign-out revokes the admin token** — Should (web 7)
  - Accept: `logout()` deletes the session row, removes `flowpost_token` from storage, and a later call with the old token gets 401.
  - Verify: unit test for logout side effects; manual replay of the old token.
  - Files: `src/contexts/AuthContext.tsx`, `src/lib/invoke.ts`, `verify-session` or a new revoke action.
  - Dep: A2 · Size: S.

- [x] **A8. Per-workflow lock** — Should (web 8)
  - Accept: the lock key is `workflow:<id>` inside the loop; one user's long run no longer blocks every other workflow.
  - Verify: test two concurrent workflow ids both proceed; same id still serialises.
  - Files: `supabase/functions/process-workflow/index.ts`, test.
  - Dep: none · Size: S.

- [x] **A9. Batch the scheduler and heartbeat the reaper** — Should (web 9)
  - Accept: the tick claims up to N rows, dispatches with `Promise.allSettled` inside the edge budget, and the reaper fails only rows with no heartbeat.
  - Verify: test 10 due rows all leave `processing`; a slow Instagram call no longer strands the rest.
  - Files: `process-scheduled-posts/index.ts`, reaper function, tests.
  - Dep: A4 · Size: M.

- [x] **A10. Rate-limit the real caller** — Should (web 10)
  - Accept: the bucket uses a non-spoofable key (account or platform IP), lookup errors fail closed, and the counter increments atomically.
  - Verify: rotating `X-Forwarded-For` cannot bypass; 5 parallel wrong answers lock out.
  - Files: `_shared/rate-limit.ts`, `_shared/rate-limit.test.ts`, `verify-password` (deleted in A13) / `verify-license` call sites.
  - Dep: none · Size: S.

- [x] **A11. Cap uploads server-side** — Should (web 11)
  - Accept: `upload-local-file` rejects files over 200 MB and content types outside the allowlist, before touching R2.
  - Verify: unit test for both rejections; a valid image still uploads.
  - Files: `supabase/functions/upload-local-file/index.ts`, test.
  - Dep: none · Size: S.

- [x] **A12. Run the Deno tests in CI** — Should (web 12)
  - Accept: the web job runs `deno test supabase/functions` (or `_shared` plus the covered functions) and fails on a regression.
  - Verify: a deliberate break turns CI red; green run after revert.
  - Files: `.github/workflows/ci.yml`.
  - Dep: A1–A5 · Size: XS.

- [x] **A13. Delete the dead auth paths** — Nice (web 13)
  - Accept: `verify-password` and `verify-session` are gone (no `src/` caller); the `frontend-api-key` branch is removed once the desktop sends a license session.
  - Verify: `grep` shows no references; functions list and `config.toml` updated.
  - Files: `supabase/functions/verify-password/`, `verify-session/`, `_shared/auth.ts`, `supabase/config.toml`.
  - Dep: A1, A3 · Size: S.

- [x] **A14. Bind a license to a user** — Nice (web 13, second half)
  - Accept: `licenses.user_id` exists; `verify-license` mints the session for that user and binds on first activation; two license keys no longer share one identity.
  - Verify: migration test; two keys resolve to their own user; desktop activation still works.
  - Files: new migration, `verify-license/index.ts`, `_shared/license.ts`, tests.
  - Dep: A2 · Size: S.

- [x] **A15. Phase A gate** — `deno test`, `npm run test`, `tsc`, format; deploy is owner-assisted (task I12 remains open).

---

## Phase B — Desktop correctness (fixes desktop findings 2–14)

- [x] **B1. Close the duplicate-publish window** — Must (desktop 2)
  - Accept: after `PublishDone`, the button stays disabled for the same media + selection + schedule; a new row id is minted only when an input changes.
  - Verify: test — publish, wait for Done, click again → still one row; change caption → a new run is allowed.
  - Files: `lib/features/publishing/publishing_providers.dart`, `publishing_controller.dart`, `test/features/publishing/publish_controller_test.dart`.
  - Dep: none · Size: S.
  - Done: the signature is remembered only when every target went out, so a failed run stays retryable from the same button. Guarded in `publish_controller_test.dart` and `publish_page_test.dart`.

- [ ] **B2. Delete stale media only as the primary instance** — Must (desktop 3)
  - Accept: `_removeStaleMediaJobs` runs after the single-instance lock is acquired; a second launch deletes nothing.
  - Verify: test with a fake guard — blocked launch never calls the workspace cleanup; primary launch does.
  - Files: `lib/main.dart`, `lib/core/shell/single_instance.dart` (or the existing guard seam), test.
  - Dep: none · Size: S.

- [ ] **B3. Fence a replaced media job** — Must (desktop 4)
  - Accept: each run carries its job id; progress and completion are ignored when the id no longer matches; picking a second file cancels the first processor.
  - Verify: test — start job A, pick B, let A complete → state stays on B; no "ready" flash from A.
  - Files: `lib/features/media/media_providers.dart`, `test/features/media/media_controller_test.dart`.
  - Dep: none · Size: S.

- [ ] **B4. Ship a real release for the download CTA** — Must (desktop 5)
  - Accept: a tag `desktop-v*` builds the Windows installer, records a SHA-256, and uploads installer + checksum to a GitHub release.
  - Verify: dry run on a test tag; asset URLs resolve.
  - Files: `.github/workflows/release-desktop.yml`, `desktop-flutter/installer/flowpost.iss`.
  - Dep: none · Size: M (owner-assisted first release).

- [ ] **B5. Fix the landing CTA** — Must (desktop 5)
  - Accept: the CTA points at a URL that exists today (`/releases`) and switches to the direct asset once a release exists; no dead `releases/latest`.
  - Verify: click on the built site; both states covered by a unit test of the URL helper.
  - Files: `src/pages/PipelineLandingPage.tsx` (+ helper + test).
  - Dep: B4 · Size: S.

- [ ] **B6. Re-check the session expiry** — Should (desktop 6)
  - Accept: a timer plus a 401 handler end the session and route to `/license` with a clear message; no silent dead state.
  - Verify: fake clock test — expiry triggers once; 401 from posts-api triggers once; a valid session is untouched.
  - Files: `lib/features/license/license_controller.dart`, `lib/features/offline/`, test.
  - Dep: none · Size: S.

- [ ] **B7. Clear the vault even when one key fails** — Should (desktop 7)
  - Accept: `clear()` attempts all three deletes, then reports one failure; a leftover token cannot keep the app signed in.
  - Verify: fake storage that fails one delete → other keys are deleted and the result is an error, not a partial success.
  - Files: `lib/features/license/data/license_store.dart`, test.
  - Dep: none · Size: XS.

- [ ] **B8. Report network failures properly** — Should (desktop 8)
  - Accept: `SocketException`, TLS and DNS failures map to "No connection — check your network and try again", not "invalid response"; both upload and captions.
  - Verify: transport tests for each exception type.
  - Files: `lib/features/media/upload/data/upload_client.dart`, `lib/features/media/captions/data/captions_client.dart`, tests.
  - Dep: none · Size: S.

- [ ] **B9. Drain FFmpeg streams before closing** — Should (desktop 9)
  - Accept: the runner waits for the buffered output to end after exit, so the last progress/error lines are not dropped.
  - Verify: fake process emitting a tail line after exit → the line is observed.
  - Files: `lib/features/media/data/ffmpeg_runner.dart`, test.
  - Dep: none · Size: S.

- [ ] **B10. Stop FFmpeg on quit** — Should (desktop 10)
  - Accept: tray Quit cancels and kills the active media process before `exit(0)`.
  - Verify: test with a fake processor — quit calls cancel once; no process id remains.
  - Files: `lib/core/shell/flowpost_shell.dart`, `lib/features/media/media_providers.dart`, test.
  - Dep: B3 · Size: S.

- [ ] **B11. Delete the dead identity module** — Should (desktop 11, lean)
  - Accept: `lib/features/identity/` and its 8 test files are removed; `flutter analyze` and the suite stay green; nothing is re-exported.
  - Verify: tree-wide grep, `flutter analyze`, `flutter test`.
  - Files: `desktop-flutter/lib/features/identity/`, `desktop-flutter/test/features/identity/`.
  - Dep: none · Size: S (-3,920 lines).

- [ ] **B12. Stop the draft restore from overwriting edits** — Should (desktop 12)
  - Accept: the draft is applied once, before the user's first edit; a late restore never replaces typed text.
  - Verify: test — type, then let the restore resolve → the typed caption stays; reopen a saved draft → it loads.
  - Files: `lib/features/publishing/publishing_providers.dart`, test.
  - Dep: none · Size: S.

- [ ] **B13. "Try again" retries the same file** — Nice (desktop 13)
  - Accept: the failed state retries the kept file path; the picker opens only from "Choose another file".
  - Verify: widget test for both buttons.
  - Files: `lib/features/media/presentation/media_page.dart`, `media_providers.dart`, test.
  - Dep: none · Size: XS.

- [ ] **B14. Sniff image types from bytes** — Nice (desktop 14)
  - Accept: JPEG/PNG/WEBP are detected from magic bytes; a mislabelled extension cannot set the wrong content type.
  - Verify: unit test per signature plus an unknown file fallback.
  - Files: `lib/features/media/upload/upload_providers.dart`, test.
  - Dep: none · Size: S.

- [ ] **B15. Phase B gate** — analyze, format, `flutter test`, release build.

---

## Phase C — Real publish targets (web + desktop, unblocks feature 3)

- [ ] **C1. Add `account-list` to posts-api** — Must (desktop 1)
  - Accept: `{action:"account-list"}` returns the caller's connected accounts (platform, account_id, display name, connection state, token expiry) with no token fields.
  - Verify: function test — one user cannot see another's rows; response has no `access_token`/`refresh_token`.
  - Files: `supabase/functions/posts-api/index.ts`, `supabase/functions/_shared/posts-api.test.ts`.
  - Dep: A1 · Size: S.

- [ ] **C2. Build the desktop accounts repository** — Must (desktop 1)
  - Accept: accounts come from `account-list`, not `accounts.json`; loading/offline/empty states exist; the local preview becomes a cache.
  - Verify: tests with a fake client for list, offline and empty.
  - Files: `lib/features/accounts/accounts_providers.dart`, `lib/features/accounts/data/accounts_repository.dart`, tests.
  - Dep: C1 · Size: M.

- [ ] **C3. Derive publish targets from real accounts** — Must (desktop 1)
  - Accept: `publishTargetsProvider` lists one target per connected account (plus feed/story for Instagram), refreshes after connect/disconnect, and is empty only when nothing is connected.
  - Verify: test — one YouTube account yields one target; a disconnected account disappears; publish is blocked with a "connect an account" hint when empty.
  - Files: `lib/features/publishing/publishing_providers.dart`, `lib/features/accounts/`, tests.
  - Dep: C2 · Size: M.

- [ ] **C4. Checkpoint** — connect an account on a real server and publish to it.

---

## Phase D — Dark mode

- [ ] **D1. Add the dark palette and theme** — Accept: `flowPostDarkTheme()` covers the same tokens; contrast test for body text, primary text, destructive, and disabled states.
  - Verify: pure test computing relative luminance/contrast ratios.
  - Files: `lib/core/theme/app_theme.dart`, new theme test.
  - Dep: none · Size: S.

- [ ] **D2. Replace hardcoded colours** — Accept: the 22 `FlowPostColors.*` / `Colors.white|black` reads outside the theme file resolve from the active `ColorScheme`; no light-only literal remains in UI.
  - Verify: grep gate in review; widget tests render in both modes.
  - Files: `lib/core/shell/app_shell.dart`, `lib/features/media/presentation/media_page.dart`, `lib/features/publishing/presentation/publish_page.dart`, `lib/features/scheduling/presentation/post_actions.dart`, `post_status_color.dart`.
  - Dep: D1 · Size: S.

- [ ] **D3. Persist and apply the mode** — Accept: a `themeControllerProvider` reads/writes `preferences.json`; `MaterialApp` gets light/dark themes and the mode; `system` follows the OS; loaded before the first frame.
  - Verify: store test, controller test, widget test for live switch + restart.
  - Files: `lib/core/theme/theme_controller.dart`, `lib/core/preferences/preferences_store.dart`, `lib/main.dart`, `lib/app.dart`, tests.
  - Dep: D2 · Size: S.

- [ ] **D4. Add the Settings section** — Accept: Appearance card with System / Light / Dark, current value shown, no restart needed.
  - Verify: widget test for the three options.
  - Files: `lib/features/settings/presentation/settings_page.dart`, test.
  - Dep: D3 · Size: XS.

- [ ] **D5. Checkpoint** — run the app in both modes on Windows, check each screen, 200% scaling.

---

## Phase E — Guided setup wizard

- [ ] **E1. Wizard domain model and copy** — Accept: steps are plain Dart data (id, title, why, free-tier note, dashboard URL, fields with validation, test action, optional); content covers Supabase, deploy, Groq, R2, Google, Meta, TikTok, LinkedIn, license.
  - Verify: unit tests for validation and step order; no UI required.
  - Files: `lib/features/setup/domain/setup_steps.dart`, tests.
  - Dep: none · Size: S.

- [ ] **E2. Vault-backed operator config** — Accept: migration adds a Vault-backed store; `operator-config` (license-session guarded) writes and lists names only; `config-status` reports booleans; values never returned.
  - Verify: Deno tests — unauthorised write rejected, values absent from responses, unknown keys rejected, allowlist enforced.
  - Files: new migration, `supabase/functions/operator-config/index.ts`, `supabase/functions/config-status/index.ts`, tests.
  - Dep: A14, A1 · Size: M.

- [ ] **E3. Read secrets from Vault with env fallback** — Accept: a `_shared/secrets.ts` helper resolves a key from Vault, then `Deno.env`; R2 upload and the caption function use it; existing deployments unchanged.
  - Verify: helper test (vault hit, env fallback, missing → clear error).
  - Files: `supabase/functions/_shared/secrets.ts`, `_shared/secrets.test.ts`, `upload-local-file/index.ts`, `generate-ai-captions/index.ts`.
  - Dep: E2 · Size: S.

- [ ] **E4. Desktop client + controller** — Accept: a typed client for `config-status` / `operator-config` with the license session; controller exposes per-step state (unknown/testing/ready/failed), re-tests, and masks secrets.
  - Verify: fake-client tests for success, 401, network failure, and secret redaction in logs.
  - Files: `lib/features/setup/data/setup_client.dart`, `setup_controller.dart`, tests.
  - Dep: E2 · Size: S.

- [ ] **E5. Wizard UI** — Accept: two-track chooser, stepper with per-step "why", free-tier note, "Open dashboard" button, masked fields, "Test" with a real result, "Skip for now", Back/Next, progress saved.
  - Verify: widget tests per track, per step state, skip, and resume; keyboard-only walkthrough.
  - Files: `lib/features/setup/presentation/`, `lib/core/router/app_router.dart`, tests.
  - Dep: E4, D1 · Size: L (split step widgets if needed).

- [ ] **E6. First run and Settings entry** — Accept: first run with no config opens the wizard; the wizard is reachable from Settings later; the old setup screen is absorbed; no dead route.
  - Verify: widget tests for redirect and re-entry; manual first run on an empty data folder.
  - Files: `lib/core/router/app_router.dart`, `lib/main.dart`, `lib/features/settings/settings_providers.dart`, tests.
  - Dep: E5 · Size: S.

- [ ] **E7. Checkpoint** — clean data folder → wizard → server ready → license active → app usable.

---

## Phase F — Browser account connections

- [ ] **F1. Deep-link contract and desktop nonce store** — Accept: `flowpost://connect-callback` is parsed strictly (scheme, host, no path), pending connect entries hold a 32-byte nonce and a 10-minute expiry, and a wrong/expired/replayed nonce is rejected.
  - Verify: unit tests for valid, wrong-scheme, wrong-host, expired, replayed, and platform-mismatch links.
  - Files: `lib/features/accounts/domain/connect_link.dart`, `lib/features/accounts/data/pending_connect_store.dart`, tests.
  - Dep: B11 · Size: S.

- [ ] **F2. `return_to` allowlist in the auth functions** — Accept: each `*-auth` accepts `return_to` only for `flowpost://connect-callback` and the existing Vercel URL, stores it with the state, and redirects there; anything else falls back to Vercel.
  - Verify: `oauth-state.test.ts` and a redirect test per function family; an attacker-supplied host cannot change the `Location`.
  - Files: `_shared/oauth-state.ts`, `_shared/oauth-state.test.ts`, six `*-auth/index.ts`.
  - Dep: none · Size: M.

- [ ] **F3. `connect-url` and `disconnect` in posts-api** — Accept: `connect-url` returns the provider URL + state for a platform with the license session, binding the desktop nonce; `disconnect` deletes only the caller's row and best-effort revokes at the provider.
  - Verify: function tests — wrong user cannot disconnect; unknown platform rejected; no token in the response.
  - Files: `posts-api/index.ts`, tests, `_shared/oauth-state.ts`.
  - Dep: F2, C1 · Size: M.

- [ ] **F4. Desktop connect/disconnect/reconnect** — Accept: Connect opens the system browser and shows a waiting sheet; the callback refreshes accounts; Disconnect confirms and refreshes; Reconnect handles expired refresh tokens; failures are readable.
  - Verify: controller tests with a fake launcher and fake client; widget tests for each state; manual end-to-end on a real server.
  - Files: `lib/features/accounts/accounts_providers.dart`, `lib/features/accounts/data/`, `lib/features/accounts/presentation/accounts_page.dart`, `lib/core/shell/flowpost_shell.dart`, tests.
  - Dep: F1, F3 · Size: M.

- [ ] **F5. Account cards and publish wiring** — Accept: each card shows platform, name, connected/expired, and what publishing will use; publish targets update immediately after connect; expired accounts block publishing with "Reconnect".
  - Verify: widget tests; manual connect → publish without restarting the app.
  - Files: `lib/features/accounts/presentation/`, `lib/features/publishing/publishing_providers.dart`, tests.
  - Dep: F4, C3 · Size: S.

- [ ] **F6. Prove browser sign-out independence** — Accept: after connecting, signing out of the platform in the browser leaves the desktop able to list and publish (until the provider revokes the grant); documented in the runbook.
  - Verify: manual on YouTube + Instagram; one note in `docs/runbook.md`.
  - Files: `docs/runbook.md`.
  - Dep: F5 · Size: XS.

- [ ] **F7. Checkpoint** — connect, close browser, quit the app, reopen, publish.

---

## Phase G — Release, docs, final gate

- [ ] **G1. Docs** — README setup section replaced by the wizard walkthrough; `.env.example` lists every secret the wizard can store; ADR for server-side token custody and the Vault config store.
  - Files: `README.md`, `.env.example`, `docs/adr/0005-*.md`, `docs/runbook.md`.
  - Dep: E6, F6 · Size: S.

- [ ] **G2. Final gate** — web: `npm run test`, `tsc`, `npm run build`, `deno test`; desktop: analyze, format, `flutter test`, release build; `ponytail-audit` re-run has no Must-fix; `graphify update .`.
  - Dep: all · Size: S.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| No deploy access for the new/changed functions | A3/A4/F2/F3/E2 cannot be verified live | Local Deno tests; owner-assisted deploy; mark the gate blocked, not passed. |
| Meta app review | Instagram/Facebook connect may need an approved app | The operator uses their own app; the wizard lists the scopes and the review step; graceful "not available" state. |
| Vault write path | A bug could overwrite a working secret | Allowlist of keys, write-then-verify test call, never return values, env fallback stays. |
| JWT acceptance narrows nothing | Wrong mapping lets a user act as another | Map JWT subject to the app user in one place, tested; service-role operations stay server-side. |
| Dark mode contrast regressions | Readability loss | Token tests with measured ratios; visual pass on every screen. |
| Deleting the identity module | Missed reference compiles at runtime | Tree-wide grep, analyze, full test run; delete in its own commit. |

---

## Open questions (defaults chosen if no answer)

1. Operator secrets: Vault (default) vs manual dashboard entry. Vault chosen; manual entry stays possible through env vars.
2. Big-bang fix vs incremental: incremental, one commit per task, severity order.
3. Dark mode palette: keep the pink/burgundy identity and darken surfaces (default) vs a new hue.

---

## Definition of Done (every task)

Acceptance met · a test that fails without the change · `flutter analyze` zero issues · format clean · relevant tests pass · no secret in logs or code · docs updated where behaviour is user-visible · one focused commit.
