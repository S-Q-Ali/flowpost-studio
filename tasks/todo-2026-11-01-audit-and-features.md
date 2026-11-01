# Todo — Audit Fixes + Dark Mode, Guided Setup, Browser Connect

Plan: `tasks/plan-2026-11-01-audit-and-features.md` · Created 2026-11-01 · Approved; Phases A–E shipped, F–G open

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
- [x] C2. Desktop accounts repository from the server
      - `account-list` is the source; `accounts.json` is only the cache used when there is no session or the network is unreachable. The six seeded placeholder cards and the local Connect/Disconnect toggle are deleted, so an empty server renders the empty state. 27 accounts tests, desktop suite 832.
- [x] C3. Publish targets derived from connected accounts
      - `publishTargetsFor` turns a connected row into its targets (Instagram feed + story; drive rows and rows without the platform id name nothing). `publishTargetsProvider` is a FutureProvider over the accounts read, so the compose screen tells loading, unreadable and genuinely empty apart. 12 more tests, desktop suite 844.
      - Follow-up (`fe1b0d1`, `3b9c3bf`): the accounts screen no longer hints at a connect button it does not have — the empty state and the compose notice say to connect in the web dashboard, the offline note only shows when something was actually kept, and `SPEC-accounts.md` plus both READMEs describe the server-owned list.
- [ ] C4. Checkpoint: connect + publish on a real server (needs Phase F and a deployed `posts-api`)

## Phase D — Dark mode
- [x] D1. Dark palette + contrast tests
      - `FlowPostDarkColors` is the web `.dark` block ported to ARGB, with two tokens lifted where the web value measures below WCAG on this surface (destructive at 65%, the outline from the web's muted-foreground). The accent text and the published green go into a `FlowPostTones` extension because Material 3 has no slot for them. The contrast test measures both themes on the screen and on a card: 18 assertions, `606fb4f`.
- [x] D2. Replace hardcoded colours
      - The rail, the media errors, the post actions, the publish status rows, the account badge and `postStatusColor` read from the active `ThemeData` now; `postStatusColor` takes the theme, so the queue and the calendar cannot name different greens for a published post. Same commit.
- [x] D3. Persist and apply the mode
      - `preferences.json` in the data root, written atomically, written before the state changes: a refused write leaves the screen on the look it is showing and says so. `main()` reads it before `runApp`, so a machine left in the dark opens in the dark. `2941270`.
- [x] D4. Settings appearance section
      - One `SegmentedButton` — System / Light / Dark, the mode in use selected, applied on the same frame; System stays unresolved so Flutter follows the Windows setting. Three tests added to the Settings screen. `cb888f4`, and the spec plus the README follow in `a152143`.
- [ ] D5. Checkpoint: both modes on every screen
      - Gates done: format 0 changed, analyze clean, 873 tests passed, release build produced `flowpost.exe`. `theme_mode_test.dart` covers the dark shell at 200% text in the smallest window; the walk of each screen in both looks on the installed build is the owner's.

## Phase E — Guided setup wizard
- [x] E1. Step model and copy
      - `lib/features/setup/domain/setup_steps.dart` holds the nine steps as plain data: two tracks (`setupStepsFor`), fields with their store (this PC / the server), obscuring, validation rule, optionality, plus links, OAuth callback URIs and the "Test" action. Names are the `Deno.env.get` reads in the functions; the callback paths are the ones the six auth functions build. Service-role and encryption keys appear only as instructions to set on the server. `httpsUrlProblem` is exported from `app_config.dart` so the wizard and the config share one address rule. 23 tests in `setup_steps_test.dart`; suite 890 green, analyze clean. `34983b0`.
- [x] E2. Vault-backed `operator-config` + `config-status`
      - `public.operator_config` (name / AES-GCM ciphertext / updated_at / updated_by) with RLS on and no policy for anon or authenticated, so only a function holding the service role touches it; the name is checked to look like an env var. `operator-config` stores values for the account that runs the server only — the caller must be a license session whose user owns the server, checked by `resolveConfigCaller` in `_shared/operator-config.ts` — and writes with `encrypt()`; if `TOKEN_ENCRYPTION_KEY` is missing nothing reaches the table in the clear. `config-status` answers which names have a value and never returns one. `verify_jwt = false` for both, like the other functions that authenticate their own caller. 31 tests in `operator-config.test.ts`. `2ffed84`.
      - Deviation from the plan: the spec said "Vault". Supabase Edge Functions have no Vault API in the request path, so the server keeps the values itself in this table, sealed with the same AES-GCM key the platform credentials already use. The wizard-facing contract is unchanged.
- [x] E3. Vault read path with env fallback
      - `_shared/secrets.ts`: `readSecrets(supabase, names)` takes the stored value, falls back to `Deno.env`, and raises `SecretProblem` with the words "add it in the guided setup, or set it under Supabase → Edge Functions → Secrets". A stored value that will not open is reported, not replaced by the env: two answers for one name is worse than a visible failure. A failed config read only logs, so a deployment that still uses env secrets keeps serving. `upload-local-file` builds its R2 client per request from the five `R2_*` names and `generate-ai-captions` reads `GROQ_API_KEY` per request in all four modes, so a key saved in the wizard works on the next call without a redeploy. 9 tests in `secrets.test.ts`, `npx vitest run supabase/functions` 207 green. `daeb3fa`.
      - `google-drive-auth` and `process-workflow` still read R2 from the env; they are on the scheduler path and move in Phase G once the wizard is proven.
- [x] E4. Desktop client + controller
      - `setup_client.dart`: `SetupClient` posts `config-status` and `operator-config` with the license session and turns 400/401/403/500 into the server's own cleaned sentence; a value is never part of `SetupException`, its message or `toString()`. `HttpSetupTransport` keeps one deadline over the whole call, like the other clients. `setup_controller.dart`: `SetupController` marks a step ready only from what the server reports after the write — the plan's write-then-verify — splits fields by store (this PC goes through `ConfigController`, the server through the client), and keeps `unknown / testing / ready / failed` per step. 17 tests over a fake client and a fake transport: ready only when every name is present, no session asks nothing, a refused session, an unreachable server, and one test that scans every log record and state string for the value it typed. `805ee27`.
- [x] E5. Wizard UI (two tracks, stepper, tests)
      - `setup_wizard_page.dart` mounted at `/setup`: a two-track chooser (the account that runs the server gets all nine steps, a licence holder the two that need no server key), the step list with each step's "why", optional/free-tier notes and its state (ready, needs attention, checking), links that open the dashboard page for the value being set, the OAuth callback URIs as text to select and paste, secret fields hidden behind a reveal, "Test", "Skip for now", Back, and "Save and continue" / "Continue" / "Finish". The place-mark goes to `setup-wizard.json` beside the other preferences, so a restart opens on the step left behind; the licence gate still wins over the wizard and the wizard keeps its own place once there are values. `fffbe3c`.
      - The old `setup_page.dart` is absorbed and deleted. Two defects came out of writing the tests: `SetupController` refused to save the server address on a clean machine because the merge had no config to merge with (a first run could never create `credentials.json`), and `reload()` replaced the whole step list, so testing one step blanked the others' answers. Both pinned with tests. 23 widget tests drive the flow through the router with the browser launch and the resume file behind seams; gate 930 tests green, analyze clean, release build produced.
- [x] E6. First run and Settings entry
      - Settings gains a **Guided setup** section with **Open the setup wizard** (`settings-open-setup`), so the steps after the server address are reachable without clearing the credentials first. Two router tests hold the other half: a machine with nothing saved starts on the wizard even with an active licence, and once there are values `/setup` keeps its place instead of bouncing to Home. The old setup screen and its test were deleted with E5, so no route is dead. `04535f7`, and the specs that still described a three-field screen (SPEC-credentials' first-run state, its Decision 7, SPEC-settings' section table, two runbook rows) were corrected in `1ba885f`.
- [x] E7. Checkpoint: clean folder → wizard → usable
      - Gate: format 0 changed, analyze clean, 933 tests green, release build produced `flowpost.exe`. The walk is held by tests, not by a description: no values opens the two tracks, the server step writes `credentials.json` on this machine and moves to the licence step, **Finish** opens Home, a step change is kept and the next start lands where the last one stopped, a refused save keeps the step open with the server's own sentence, and a stored key never returns to a field. `ef73d1a` names the wizard in the startup log line that says which screen a clean machine starts on.
      - Owner-only half (this agent cannot drive the installed window against a real server): clear `%APPDATA%\com.flowpost\FlowPost`, start the installed build and walk the end-user track; then the operator track with `operator-config` / `config-status` deployed and `TOKEN_ENCRYPTION_KEY` set, and check that a key saved in the wizard works on the next caption request without a redeploy (E3's read path) and that **Settings → Open the setup wizard** comes back to the step left behind.

## Phase F — Browser account connections
- [x] F1. Deep-link contract + pending nonce store
      - `domain/connect_link.dart` parses `flowpost://connect-callback?platform=…&nonce=…&result=…` against one fixed shape and answers null for everything else: scheme, host, no path below it, a platform `socialPlatformOf` can name, 64 lower-case hex characters, and a stated outcome (an unknown word in `result` is a failure, never a success). `data/pending_connect_store.dart` holds the waits in memory — a 32-byte `Random.secure()` nonce per platform, ten minutes, spent on the first link that names it — and answers `trusted / unknown / expired / wrongPlatform`.
      - Deliberately not on disk: a wait that outlives the process has nothing to check a link against, and the account list read from the server is the truth either way; a nonce in a plain JSON file would be a live token anyone holding the folder could replay.
      - 23 tests, including the 9m59s / 10m boundary and a replay. Desktop gate: format clean, analyze clean, 956 tests green. `8a7cc7d`. F2 has to send exactly this link and F3 carries the nonce into the state row.
- [x] F2. `return_to` allowlist in the auth functions
      - `_shared/oauth-state.ts` gained `normalizeReturnTo` and `callbackLocation`, and the state row gained `return_to` (`20261102000000_oauth_state_return_to.sql`). Only two places may receive a finished connect: the desktop link `flowpost://connect-callback?platform=…&nonce=…` — known platform, 64 lower-case hex, no path, no caller-supplied `result` — and an URL on the app origin exactly (`ALLOWED_ORIGIN`, the shipped Vercel URL as the fallback). Everything else stores null, and the callback sends the browser to the web accounts page like before.
      - Wired through all seven state-carrying auth functions (youtube, facebook which also serves the standalone instagram mode, instagram, tiktok, linkedin, google-drive): the `url` action reads `return_to` from the query (the body too where the function already reads a body) and `createOAuthState` normalises before inserting; the success 302 comes from `callbackLocation`, which re-checks the stored value so a hand-written row cannot become an open redirect. `mega-auth` uses no server state row and `google-oauth` (user login) has its own guard, so neither changed. Error branches still answer a page, never a redirect: a link the app never asked for matches no pending wait on the desktop.
      - 17 new tests in `oauth-state.test.ts` (25 in the file), incl. a lookalike origin (`flowpost-studio.vercel.app.evil.example`), a path-traversal host, a pre-filled `result`, and the "foreign host never reaches Location" case. Web gate: vitest 260 green, `tsc --noEmit` clean, eslint findings unchanged (8 pre-existing on these files, 0 added), `vite build` produced. `e228202`. F3 sends the F1 link as `return_to` when the desktop asks for a connect URL.
- [x] F3. `connect-url` and `disconnect` in posts-api
      - `_shared/posts-api.ts` carries the logic so vitest can hold it: `connectTarget` (a platform with an auth function and a 64 lower-case hex nonce), `connectUrlRequest` (the `*-auth` URL with `action=url`, the caller's own session userId and `return_to` set to the F1 desktop link, that link re-checked through `normalizeReturnTo` before it is ever put in a query), `disconnectTarget` (platform + account id, never an owner), `findAccountForDisconnect` over its own `DISCONNECT_COLUMNS`, and `revokeRequest` (Google's revoke for youtube and google_drive, TikTok's for a stored refresh token plus `TIKTOK_CLIENT_KEY`; facebook and linkedin are the row delete alone, because no single-token endpoint exists for them).
      - `posts-api/index.ts` wires two cases: `connect-url` hops to the auth function under the service key with a 15s deadline and answers only `{ url, platform }`; `disconnect` decrypts the stored token, best-effort revokes at the provider (10s, a failure logs and the delete still runs), then deletes the caller's own row and answers the ids that went. No token material is ever copied out, and `account-list` keeps its token-free column list.
      - `oauth-state.ts` gained `desktopReturnTo`, an exported `CONNECT_PLATFORMS`, and a mode argument to `normalizeReturnTo`, so one platform's state row cannot answer another platform's wait.
      - Correction to the plan: `disconnect` no longer demands a connect nonce. The server matches it against nothing, so requiring one only gives the desktop a failure to work around.
      - 21 new tests in `posts-api.test.ts` (48 in the file) and 2 in `oauth-state.test.ts` (27), including "never takes an owner from the body", "finds nothing for a row owned by another user", and the column-list invariants. Web gate: vitest 283 green, `tsc --noEmit` clean, eslint findings unchanged (8 pre-existing `supabase: any` on these files, 0 added), `vite build` produced. `b3c1ed1`. F4 opens that URL in the system browser and waits on the nonce.
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
