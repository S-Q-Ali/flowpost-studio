# Implementation Plan: FlowPost Desktop — Production-Ready Windows MVP

**Status:** Auth deferred by owner; building features without login (accounts first)
**Created:** 2026-10-27
**Owner override (2026-10-28):** identity/login is deferred to the end. Phases 2–5 build the real screens and local flows against local repositories/seeded data, with no login gate. Real Supabase/edge-function wiring resumes when identity is implemented. The Phase 1 spec and ADR are retained. This override is deliberate, not a gate pass.
**Scope:** Windows 10/11 x64 only, Flutter + Material 3, native desktop client
**Source of truth:** `docs/spec/flowpost-native-capability-map.md`, `docs/spec/SPEC-shell.md`
**Supersedes:** archived Pake plans in `tasks/archive/`

---

## Overview

Ship FlowPost Studio as an installable native Windows app for the existing admin user. The client owns its UI, uses the existing Supabase project and edge functions as the API, and adds Google sign-in, account connections, local media processing, publishing, scheduling, and a thin offline cache with local drafts.

This is the MVP boundary, not full parity. Workflows, insights, and admin user management are v1.1. There is no new backend service, no WebView for app UI, no automatic updater, and no code signing in v1.

The work is split into eight vertical phases. Each phase ends with a gate: tests, build, security/performance checks where relevant, code review, and a scoped audit. No phase starts until the previous gate passes and the human approves.

---

## Current State (2026-10-28)

- Phase 0 is implemented and gated: shell safety blockers fixed, installer/protocol shipped, tests and release build green. Evidence is in `tasks/todo.md`.
- `desktop-flutter/` has a working shell: window, tray, close-to-tray, single-instance hand-off, deep links, rotating logs, config, theme, router, update check, and a navigation rail (Home, Accounts, Upload, Calendar, Settings).
- The accounts local slice is implemented: six cards, local JSON persistence, connect/disconnect/reconnect, loading/error states, and an installed-build smoke test. Spec: `docs/spec/SPEC-accounts.md`.
- `flutter analyze`, formatting, 73 unit/widget tests, the Windows integration test, release build, and installer smoke pass.
- Tray **Quit**/**Show** was accepted at the Phase 0 approval (Quit via code path/review).
- No identity, media, publishing, scheduling, or offline code exists.
- Real Supabase auth, Google OAuth, platform connections, R2 upload, and publishing are not implemented; Phase 1 needs dashboard access, a real URL/anon key, and the `flowpost://auth-callback` redirect allowlist entry.
- Phase 2's local gate still needs the security/audit review and human approval; the real platform OAuth flow is deferred with identity.

---

## Assumptions

1. The existing Supabase project and its 30 edge functions are the only backend. No new service is added.
2. Google sign-in uses the system browser and returns through `flowpost://auth-callback`.
3. The existing admin session model (`public.users`, `sessions`, `flowpost_token`) is reused; signups stay closed.
4. One admin user, one Windows PC, one running instance. Low concurrency; no server-side load from this client.
5. v1 ships as an unsigned Inno Setup `.exe`. SmartScreen is documented, not bypassed.
6. Updates are manual in v1: show the current version, check a JSON manifest, open the download URL. No silent auto-update.
7. Offline v1 is cached reads plus local drafts. Publishing requires a connection; no queued publishing.
8. FFmpeg is bundled and invoked as a local process. No cloud media service is added.
9. The old Pake app and its `%APPDATA%\FlowPost` WebView cache are separate and are not migrated.
10. Deploy access for Supabase and Vercel may be blocked. Local tests use mocks; real auth/publish gates still need credentials.

---

## Architecture Decisions

| Decision | Rationale |
|---|---|
| Keep Flutter, Riverpod, GoRouter, Material 3 | Already scaffolded, tested, and approved. No framework change. |
| Fix the shell before identity | Login depends on the installer, protocol handler, deep links, and a safe single instance. |
| Existing Supabase + edge functions only | No new backend, no duplicate API, no data migration. |
| Typed API clients per module | No `dynamic` across boundaries; parse once at the boundary. |
| System browser for OAuth | Google blocks embedded webviews; the spec already requires the system browser. |
| Session tokens in OS-protected storage | No plain-text token file. Decision and implementation belong in the identity spec. |
| FFmpeg binary invoked via `Process` | Avoids an unmaintained Flutter plugin; control arguments, temp files, and cleanup directly. |
| SQLite for cache and drafts | Small, local, queryable, survives restart. Engine choice is an offline-spec decision. |
| Inno Setup, unsigned, per-user | Approved v1 path; no admin requirement and no certificate needed. |
| Manual update check | Spec requirement; no auto-updater, no background service. |
| Local logs and diagnostics only | No new telemetry service; a rotating log plus a copy-diagnostics action. |

---

## Definition of Done (every task)

- Acceptance criteria met.
- New non-trivial logic has a test that fails without the change.
- `flutter analyze` reports zero issues.
- `dart format --set-exit-if-changed lib test` reports no changes.
- Relevant unit/widget/integration tests pass.
- Release build succeeds for the touched Windows code.
- No secret, token, OAuth code, or service-role key appears in logs or code.
- No skipped test and no new `// ignore` without a one-line reason.
- Changed behavior is reflected in README, spec, or an ADR.
- Task fits one focused session and touches roughly five files or fewer.

---

## Phase Gates (after every phase)

The gate is not optional. Run it in this order:

1. **TDD check** — every new branch has a test; tests fail if the behavior is removed.
2. **Commands** — `flutter pub get`, `flutter analyze`, format check, `flutter test`.
3. **Windows integration** — `flutter test integration_test -d windows --dart-define-from-file=config/dev.json` for touched shell/auth flows.
4. **Build** — `flutter build windows --release --dart-define-from-file=config/prod.json`.
5. **Security** — `security-and-hardening` checklist for trust boundaries touched in the phase.
6. **Performance** — `performance-optimization` check for startup, media, upload, or list paths.
7. **Code review** — `code-review-and-quality` on the phase diff.
8. **Audit** — scoped `ponytail-audit`; fix every Must-fix and Should-fix before moving on.
9. **Human approval** — review the gate result and explicitly approve the next phase.

If any command fails, the phase stays open. Do not move to the next phase with a known Must-fix.

---

## Phase 0 — Shell Completion and Installability

**Goal:** Close the approved shell spec and the audit blockers. The app must install, register `flowpost://`, survive a second launch, hide to tray, log safely, and be ready for identity.
**Estimate:** 1–1.5 weeks.

### Task 0.1 — Archive the stale plan and approve this one
**Acceptance:** Pake plan/todo are in `tasks/archive/`; this plan and `tasks/todo.md` are reviewed and approved.
**Verify:** Files exist; no unchecked Pake task remains active.
**Depends:** None.
**Files:** `tasks/plan.md`, `tasks/todo.md`, `tasks/archive/`.
**Scope:** XS.

### Task 0.2 — Fix shell safety blockers
**Acceptance:**
- Single instance uses an exclusive OS lock held for the process lifetime; a second launch cannot become primary.
- An owner that cannot be inspected is treated as alive, not dead.
- Tray setup failure does not leave a hidden window with no tray icon.
- OAuth `code` and `state` never reach the log.
- Config rejects a non-HTTPS URL and a service-role/secret key.
- Startup, async, and framework errors are logged.

**Verify:** New unit tests for lock decision, owner branch, config rejection, and log redaction; manual tray-failure test with a missing icon; `flutter test`.
**Depends:** 0.1.
**Files:** `desktop-flutter/lib/core/shell/flowpost_shell.dart`, `lib/core/config/app_config.dart`, `lib/core/logging/app_logger.dart`, `lib/main.dart`, focused tests.
**Scope:** M.

### Task 0.3 — Make deep-link restore and intent delivery reliable
**Acceptance:**
- Every accepted deep link calls `showFromTray()` before routing.
- A hidden window returns with a taskbar entry and focus.
- A failed batch read restores the batch or leaves the original intent file intact.
- Unknown paths are rejected and logged with the actual path.

**Verify:** Unit test for drain failure; Windows smoke with close-to-tray plus `flowpost://auth-callback`; `flutter test`.
**Depends:** 0.2.
**Files:** `flowpost_shell.dart`, `main.dart`, `test/core/shell_guard_test.dart`.
**Scope:** S.

### Task 0.4 — Add shell tests
**Acceptance:** Guard, tray failure, quit, hand-off, and deep-link restore have tests; the Windows integration test launches and exits cleanly.
**Verify:** `flutter test`, `flutter test integration_test -d windows --dart-define-from-file=config/dev.json`.
**Depends:** 0.2, 0.3.
**Files:** `desktop-flutter/test/core/`, `desktop-flutter/integration_test/shell_test.dart`.
**Scope:** M.

### Task 0.5 — Build the installer and register the protocol
**Acceptance:**
- `installer/flowpost.iss` produces `FlowPostNativeSetup.exe`.
- Install creates Start Menu and uninstall entries.
- `HKCU\Software\Classes\flowpost` points at the installed executable.
- Icon is derived from `public/logo.png`.
- Uninstall removes the protocol entry.

**Verify:** Install, launch from Start Menu, open `flowpost://auth-callback?code=test`, uninstall; check the registry before and after.
**Depends:** 0.2, 0.3.
**Files:** `desktop-flutter/installer/flowpost.iss`, `windows/runner/Runner.rc`, `windows/runner/resources/`, `README.md`.
**Scope:** M.

### Task 0.6 — Add version/update check, README, and log-path decision
**Acceptance:**
- App shows its version and checks a mocked JSON manifest at startup or from the placeholder screen.
- A newer version opens the download URL with `url_launcher`.
- `README.md` documents toolchain versions, config, build, test, and log location.
- The log path in the spec/comment matches the path the app actually writes (`%APPDATA%\com.flowpost\FlowPost\logs`), or the code is changed deliberately. The old Pake folder is not reused.

**Verify:** Unit test for version comparison and malformed manifest; widget test for the prompt; manual `README` walkthrough.
**Depends:** 0.5.
**Files:** `desktop-flutter/lib/core/update/`, `lib/features/home/`, `app_config.dart`, `README.md`, `app_logger.dart`, tests.
**Scope:** M.

### Task 0.7 — Phase 0 gate
**Acceptance:** All shell success criteria pass; no Must-fix remains from the shell audit.
**Verify:** Full gate commands, installer smoke, cold start under 3 seconds, two cold starts, protocol callback, log inspection.
**Depends:** 0.2–0.6.
**Files:** No new code; evidence in `tasks/todo.md`.
**Scope:** S.

**Phase 0 skills:** `test-driven-development`, `security-and-hardening`, `observability-and-instrumentation`, `shipping-and-launch`, `code-review-and-quality`, `ponytail-audit`.

---

## Phase 1 — Identity and Session (DEFERRED by owner 2026-10-28)

**Goal:** The existing admin can sign in with Google (and the existing email/password path), the session survives restart, logout works, and no token leaks.
**Estimate:** 1–1.5 weeks.

### Task 1.1 — Write and approve `SPEC-identity.md`
**Acceptance:** Spec covers objective, commands, structure, style, testing, boundaries, success criteria, and these decisions:
- Supabase auth vs the existing custom `flowpost_token` session.
- Secure session storage on Windows.
- PKCE/state handling and the `flowpost://auth-callback` contract.
- Closed signups, existing admin security questions, and lockout behavior.
- Error states for offline, expired state, cancelled login, and revoked session.

**Verify:** Human review and approval.
**Depends:** Phase 0.
**Files:** `docs/spec/SPEC-identity.md`, `docs/adr/`.
**Scope:** S.

### Task 1.2 — Build the auth data layer
**Acceptance:** Supabase client is initialized from config; a typed session model exists; tokens are persisted only in OS-protected storage; refresh and logout are implemented; config errors fail fast.
**Verify:** Unit tests with a fake auth client; no token in log output; test restart restore with a mock store.
**Depends:** 1.1.
**Files:** `desktop-flutter/lib/features/identity/data/`, `lib/core/providers/`, tests.
**Scope:** M.

### Task 1.3 — Build the login UI
**Acceptance:** Email/password form and Google button; loading, invalid credentials, offline, cancelled, and expired-state states are readable; keyboard and focus work; no signup link.
**Verify:** Widget tests for every state; manual keyboard walkthrough.
**Depends:** 1.2.
**Files:** `lib/features/identity/presentation/`, router, theme, tests.
**Scope:** M.

### Task 1.4 — Implement the Google OAuth deep-link flow
**Acceptance:** Google opens in the system browser; callback returns through the registered protocol; state/PKCE mismatch is rejected; code exchange succeeds; the app lands on the authenticated home; unknown or replayed callbacks fail closed.
**Verify:** Unit tests for callback parsing/state; Windows integration with a fake callback; real Google login on the installed build.
**Depends:** 1.1, 1.3, Phase 0 protocol registration.
**Files:** `lib/features/identity/`, `lib/core/router/`, `lib/main.dart`, tests.
**Scope:** M.

### Task 1.5 — Session restore, logout, and failure handling
**Acceptance:** Session survives app restart; logout clears the store and returns to login; expired/revoked sessions show a clear re-login action; no secret in logs.
**Verify:** Unit and integration tests; manual restart and logout.
**Depends:** 1.2, 1.4.
**Files:** `lib/features/identity/`, `lib/core/shell/`, tests.
**Scope:** S.

### Task 1.6 — Phase 1 gate
**Acceptance:** Real Google login works on the installed build; no signups; no token in logs; security review passes.
**Verify:** Full gate commands; `security-and-hardening`; manual real login and restart.
**Depends:** 1.1–1.5.
**Files:** No new code; evidence in `tasks/todo.md`.
**Scope:** S.

**Phase 1 skills:** `spec-driven-development`, `test-driven-development`, `security-and-hardening`, `documentation-and-adrs`, `code-review-and-quality`, `ponytail-audit`.

---

## Phase 2 — Account Connections (no-auth local slice first)

**Goal:** The user can connect, see, refresh, and disconnect the six supported account types.
**Estimate:** 1 week.

### Task 2.1 — Write `SPEC-accounts.md` and map the existing API
**Acceptance:** Six account types and their existing edge functions are listed; request/response models are typed; token storage and refresh ownership are decided; disconnect behavior is defined.
**Verify:** Human review; every function has a named contract.
**Depends:** Phase 1.
**Files:** `docs/spec/SPEC-accounts.md`, API notes.
**Scope:** S.

### Task 2.2 — Build the accounts data layer
**Acceptance:** A typed `AccountsRepository` exists; the local implementation reads seeded accounts, maps statuses, and survives restart; the Supabase implementation is a later swap behind the same interface.
**Verify:** Unit tests for mapping and status changes; no network required.
**Depends:** 2.1.
**Files:** `desktop-flutter/lib/features/accounts/data/`, tests.
**Scope:** M.

### Task 2.3 — Build the accounts screen
**Acceptance:** Each platform shows connected/disconnected/expired; connect and disconnect actions have confirmation and error states; empty/loading/offline states are covered.
**Verify:** Widget tests; keyboard navigation.
**Depends:** 2.2.
**Files:** `lib/features/accounts/presentation/`, tests.
**Scope:** M.

### Task 2.4 — Connect and disconnect (local slice)
**Acceptance:** Connect and disconnect update local state and persist across restart; the real system-browser platform flow is deferred to the identity/real-backend pass; no token is invented or logged.
**Verify:** Widget/unit tests for both actions; real YouTube connect deferred.
**Depends:** 2.2, 2.3.
**Files:** `lib/features/accounts/`, tests.
**Scope:** M.

### Task 2.5 — Phase 2 gate (local)
**Acceptance:** Six cards, local connect/disconnect, no token leak, offline and expired states correct.
**Verify:** Full gate commands; `security-and-hardening`; real platform flow deferred.
**Depends:** 2.1–2.4.
**Files:** No new code; evidence in `tasks/todo.md`.
**Scope:** S.

**Phase 2 skills:** `test-driven-development`, `api-and-interface-design`, `security-and-hardening`, `code-review-and-quality`, `ponytail-audit`.

---

## Phase 3 — Media Pipeline

**Goal:** Pick a local video or image, probe it, transcode it, extract a thumbnail/audio/frames, generate captions, and upload to R2 with progress.
**Estimate:** 1.5–2 weeks.

### Task 3.1 — Write `SPEC-media.md`, choose FFmpeg packaging, add fixtures
**Acceptance:** FFmpeg build, license, size, and path are decided; supported formats and limits are listed; fixture files and expected outputs are committed; temp-file cleanup is defined.
**Verify:** Human review; fixture files open and run on Windows.
**Depends:** Phase 1.
**Files:** `docs/spec/SPEC-media.md`, `desktop-flutter/test/fixtures/`.
**Scope:** S.

### Task 3.2 — File picker, validation, and workspace
**Acceptance:** User can pick a supported file; unsupported type/size shows a clear error; a per-job temp folder is created and cleaned on success, cancel, and crash recovery.
**Verify:** Unit tests for validation; widget test for picker states.
**Depends:** 3.1.
**Files:** `lib/features/media/`, tests.
**Scope:** M.

### Task 3.3 — FFmpeg service
**Acceptance:** Probe returns duration, dimensions, codecs; transcode produces the expected format; thumbnail and audio/frame extraction work; progress is reported; arguments are passed as a list, never through a shell string.
**Verify:** Fixture-based integration tests; manual large-file run; no orphan process after cancel.
**Depends:** 3.1, 3.2.
**Files:** `lib/features/media/ffmpeg/`, tests.
**Scope:** L (split sub-tasks if it exceeds one session).

### Task 3.4 — Caption generation
**Acceptance:** Existing `generate-ai-captions` is called with a typed request; progress and errors are visible; the result can be edited before publishing; no API key is stored in the client.
**Verify:** Contract test with a mocked response; widget test; manual real call.
**Depends:** 3.3.
**Files:** `lib/features/media/captions/`, tests.
**Scope:** M.

### Task 3.5 — R2 upload with progress
**Acceptance:** Upload uses the existing edge function; progress is visible; failure can be retried without duplicating the object; cancel cleans up; URLs/keys are not logged.
**Verify:** Mocked upload tests; manual real upload; log inspection.
**Depends:** 3.3.
**Files:** `lib/features/media/upload/`, tests.
**Scope:** M.

### Task 3.6 — Phase 3 gate
**Acceptance:** End-to-end media path works on a clean Windows machine; large-file run does not freeze the UI; temp files are cleaned; performance and security reviews pass.
**Verify:** Full gate commands; `performance-optimization`; `security-and-hardening`; manual fixture run.
**Depends:** 3.1–3.5.
**Files:** No new code; evidence in `tasks/todo.md`.
**Scope:** S.

**Phase 3 skills:** `test-driven-development`, `performance-optimization`, `security-and-hardening`, `code-review-and-quality`, `ponytail-audit`.

---

## Phase 4 — Publishing

**Goal:** Publish now or schedule through the existing upload functions, show status, and never double-publish on retry.
**Estimate:** 1.5 weeks.

### Task 4.1 — Write `SPEC-publishing.md` and map upload functions
**Acceptance:** Platform limits, statuses, error codes, and retry rules are documented; duplicate-publish rule is explicit: refresh status before retry, never blind-retry.
**Verify:** Human review; each upload function has a contract.
**Depends:** Phase 2, Phase 3.
**Files:** `docs/spec/SPEC-publishing.md`, API notes.
**Scope:** S.

### Task 4.2 — Compose and publish UI
**Acceptance:** User selects platforms, caption, media, and schedule; validation covers missing media, caption limits, and past times; progress and per-platform status are visible.
**Verify:** Widget tests for each validation and status; keyboard walkthrough.
**Depends:** 4.1.
**Files:** `lib/features/publishing/presentation/`, tests.
**Scope:** M.

### Task 4.3 — Publish-now flow
**Acceptance:** Calls the existing function, polls status, maps failures to readable messages, and refreshes the status before offering Retry.
**Verify:** Contract tests with success/timeout/already-published responses; manual publish to one test account.
**Depends:** 4.2.
**Files:** `lib/features/publishing/data/`, tests.
**Scope:** M.

### Task 4.4 — Schedule and retry guard
**Acceptance:** Schedule creates/updates a post; queue shows the scheduled time in the user’s timezone; Retry is disabled until status is refreshed; an already-published post cannot be retried.
**Verify:** State-machine unit tests; timezone tests; mocked schedule responses.
**Depends:** 4.3.
**Files:** `lib/features/publishing/`, tests.
**Scope:** M.

### Task 4.5 — Phase 4 gate
**Acceptance:** Publish now and schedule work; duplicate guard proven; one real platform publish; failures do not lose the draft.
**Verify:** Full gate commands; `security-and-hardening`; `performance-optimization`; manual publish.
**Depends:** 4.1–4.4.
**Files:** No new code; evidence in `tasks/todo.md`.
**Scope:** S.

**Phase 4 skills:** `test-driven-development`, `security-and-hardening`, `performance-optimization`, `code-review-and-quality`, `ponytail-audit`.

---

## Phase 5 — Scheduling and Offline Slice

**Goal:** Calendar and queue views with cached reads and local drafts; publishing still requires a connection.
**Estimate:** 1.5 weeks.

### Task 5.1 — Write `SPEC-scheduling.md` and `SPEC-offline.md`
**Acceptance:** Calendar scope, timezone rules, queue filters, cache tables, migration policy, draft conflict rules, and connectivity behavior are defined. SQLite engine choice is an ADR.
**Verify:** Human review; schema and timezone cases reviewed.
**Depends:** Phase 4.
**Files:** `docs/spec/SPEC-scheduling.md`, `docs/spec/SPEC-offline.md`, `docs/adr/`.
**Scope:** S.

### Task 5.2 — Calendar and queue UI
**Acceptance:** Month/week/list views show scheduled posts; create/update opens the publishing flow; timezone conversion is correct across DST; empty/loading/error states exist.
**Verify:** Unit tests for timezone/DST; widget tests for views and empty states.
**Depends:** 5.1.
**Files:** `lib/features/scheduling/`, tests.
**Scope:** L (split views if needed).

### Task 5.3 — SQLite cache
**Acceptance:** Posts, accounts, and profile reads are cached; cache is refreshed after writes; stale data is marked; schema version and migration path exist; corrupt DB is handled without data loss.
**Verify:** Unit tests for cache read/write and migration; integration test with a temp DB.
**Depends:** 5.1.
**Files:** `lib/features/offline/`, tests.
**Scope:** M.

### Task 5.4 — Local drafts
**Acceptance:** Draft autosaves locally; reopening restores it; delete removes it; drafts never publish while offline; conflict rule is explicit.
**Verify:** Round-trip tests; restart test; offline widget test.
**Depends:** 5.3.
**Files:** `lib/features/offline/drafts/`, `lib/features/publishing/`, tests.
**Scope:** M.

### Task 5.5 — Connectivity and offline behavior
**Acceptance:** Offline mode shows cached reads and a clear banner; network errors do not wipe the cache; reconnect refreshes; publish buttons explain the connection requirement.
**Verify:** Integration test with network disabled; manual airplane-mode test.
**Depends:** 5.3, 5.4.
**Files:** `lib/features/offline/`, `lib/core/`, tests.
**Scope:** S.

### Task 5.6 — Phase 5 gate
**Acceptance:** Calendar/queue work; cache and drafts survive restart; timezone is correct; offline cannot publish; no data loss.
**Verify:** Full gate commands; `performance-optimization`; data-loss review; manual offline run.
**Depends:** 5.1–5.5.
**Files:** No new code; evidence in `tasks/todo.md`.
**Scope:** S.

**Phase 5 skills:** `test-driven-development`, `performance-optimization`, `security-and-hardening`, `code-review-and-quality`, `ponytail-audit`.

---

## Phase 6 — Production Hardening

**Goal:** Settings, version/update, observability, accessibility, security, performance, and documentation are production-grade.
**Estimate:** 1 week.

### Task 6.1 — Settings and update UI
**Acceptance:** Settings shows account, logout, app version, update check, log location, and about; update check reuses the Phase 0 service; no secret is displayed.
**Verify:** Widget tests; manual update check with a mocked manifest.
**Depends:** Phase 5.
**Files:** `lib/features/settings/`, tests.
**Scope:** M.

### Task 6.2 — Observability and diagnostics
**Acceptance:** Global error handlers log all unexpected errors; log rotation works; a copy-diagnostics action includes version, OS, and recent logs but no tokens; crash recovery does not lose drafts.
**Verify:** Fault-injection tests; log inspection; manual diagnostics export.
**Depends:** 6.1.
**Files:** `lib/core/logging/`, `lib/core/diagnostics/`, tests.
**Scope:** M.

### Task 6.3 — Accessibility
**Acceptance:** Keyboard-only flow works for login, accounts, media, publish, schedule, and settings; focus order is correct; labels exist; contrast is at least 4.5:1; 200% scaling does not clip critical controls.
**Verify:** Manual keyboard walkthrough; contrast check; Windows display scaling test.
**Depends:** Phase 5.
**Files:** `lib/core/theme/`, feature UI, tests.
**Scope:** M.

### Task 6.4 — Performance
**Acceptance:** Cold start under 3 seconds; no UI freeze over 100ms on media/publish paths; large file memory stays bounded; list scrolling stays smooth; app size is recorded.
**Verify:** Stopwatch cold-start runs; FFmpeg large-file run; DevTools timeline; size report.
**Depends:** Phase 5.
**Files:** `lib/core/`, media/publishing paths.
**Scope:** S.

### Task 6.5 — Security review
**Acceptance:** No service-role key; session tokens protected; deep links allowlisted and state-checked; FFmpeg arguments not shell-interpolated; upload URLs not logged; dependency audit has no critical/high issue; RLS assumptions documented.
**Verify:** `security-and-hardening` checklist; secret scan; dependency audit; log inspection.
**Depends:** Phase 5.
**Files:** Config, auth, deep links, media, upload.
**Scope:** M.

### Task 6.6 — Documentation and ADRs
**Acceptance:** README, architecture notes, identity/offline/FFmpeg ADRs, support runbook, release checklist, and rollback notes are current.
**Verify:** A second person can build and run from the docs.
**Depends:** 6.1–6.5.
**Files:** `README.md`, `docs/adr/`, `docs/runbook.md`.
**Scope:** S.

### Task 6.7 — Phase 6 gate
**Acceptance:** Pre-launch checklist green; no P0/P1 security, accessibility, or performance issue.
**Verify:** `shipping-and-launch` checklist; full commands; `ponytail-audit`.
**Depends:** 6.1–6.6.
**Files:** No new code; evidence in `tasks/todo.md`.
**Scope:** S.

**Phase 6 skills:** `shipping-and-launch`, `security-and-hardening`, `performance-optimization`, `frontend-ui-engineering`, `documentation-and-adrs`, `code-review-and-quality`, `ponytail-audit`.

---

## Phase 7 — Release Candidate and Launch

**Goal:** Install, upgrade, use, and remove the production build on a clean Windows machine, then release to the admin user with a rollback path.
**Estimate:** 3–5 days.

### Task 7.1 — Build the release candidate
**Acceptance:** Version is bumped; production config is used; Release build and installer are produced; checksum is recorded; release notes list known limits (unsigned, manual update, no offline publish).
**Verify:** Clean build from a fresh checkout; installer hash.
**Depends:** Phase 6.
**Files:** `pubspec.yaml`, `installer/flowpost.iss`, release notes.
**Scope:** S.

### Task 7.2 — Clean-machine install test
**Acceptance:** Windows 10 1809+ and Windows 11 x64 install, launch, close to tray, relaunch, deep link, login, update check, uninstall, and reinstall all pass. Uninstall removes the protocol entry and leaves user data safe.
**Verify:** Manual checklist on clean VMs.
**Depends:** 7.1.
**Files:** No code; `tasks/todo.md` evidence.
**Scope:** M.

### Task 7.3 — End-to-end product smoke
**Acceptance:** Google login, one real account connect, media pick/probe/transcode/caption/upload, publish now, schedule, calendar, offline cache, draft restore, logout, and second login all pass.
**Verify:** Manual checklist with a real test account and a small fixture.
**Depends:** 7.2.
**Files:** No code; evidence.
**Scope:** M.

### Task 7.4 — Rollback and support
**Acceptance:** Previous installer is available; user data and SQLite schema are compatible; rollback steps are documented; log location and diagnostics export are documented; SmartScreen instructions are written.
**Verify:** Rollback dry run; doc review.
**Depends:** 7.2.
**Files:** `docs/runbook.md`, release notes.
**Scope:** S.

### Task 7.5 — Staged release
**Acceptance:** Internal clean VM first, then the admin machine; monitor logs and feedback for one week; no P0/P1 issue before calling v1 done.
**Verify:** Release checklist; one-week observation.
**Depends:** 7.3, 7.4.
**Files:** No code.
**Scope:** S.

### Task 7.6 — Final audit and sign-off
**Acceptance:** Final `ponytail-audit` has no Must-fix; all phase evidence is in `tasks/todo.md`; human signs off.
**Verify:** Final gate commands; audit report.
**Depends:** 7.5.
**Files:** `tasks/todo.md`.
**Scope:** XS.

**Phase 7 skills:** `shipping-and-launch`, `code-review-and-quality`, `ponytail-audit`.

---

## Cross-Phase Skills Matrix

| Phase | During the phase | Gate skills |
|---|---|---|
| 0 Shell | `test-driven-development`, `observability-and-instrumentation` | `security-and-hardening`, `shipping-and-launch`, `code-review-and-quality`, `ponytail-audit` |
| 1 Identity | `spec-driven-development`, `test-driven-development`, `documentation-and-adrs` | `security-and-hardening`, `code-review-and-quality`, `ponytail-audit` |
| 2 Accounts | `test-driven-development`, `api-and-interface-design` | `security-and-hardening`, `code-review-and-quality`, `ponytail-audit` |
| 3 Media | `test-driven-development`, `performance-optimization` | `security-and-hardening`, `code-review-and-quality`, `ponytail-audit` |
| 4 Publishing | `test-driven-development`, `performance-optimization` | `security-and-hardening`, `code-review-and-quality`, `ponytail-audit` |
| 5 Scheduling/Offline | `test-driven-development`, `performance-optimization` | `security-and-hardening`, data-loss review, `ponytail-audit` |
| 6 Hardening | `shipping-and-launch`, `frontend-ui-engineering`, `documentation-and-adrs` | `security-and-hardening`, `performance-optimization`, `ponytail-audit` |
| 7 Release | `shipping-and-launch` | `code-review-and-quality`, `ponytail-audit` |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| No Supabase/Vercel deploy access | Identity and real publish cannot be verified | Get access before Phase 1; use mocks for local tests; mark real gate blocked, not passed |
| Google redirect allowlist missing | Login fails after install | Register `flowpost://auth-callback` in Supabase and Google before Phase 1; test on the installed build |
| Protocol registration broken | Browser cannot return to the app | Installer test in Phase 0; uninstall test; registry check |
| OAuth token leakage | Account takeover | OS-protected storage; redact logs; security review |
| Duplicate publishing | Duplicate posts to real accounts | Refresh status before retry; no blind retry; request backend idempotency guard if needed |
| Existing callbacks redirect to Vercel | Account connection appears broken | Poll `connected_accounts`; document close-browser step; `return_to` later |
| FFmpeg license/size/Windows paths | Installer bloat or failed processing | ADR in Phase 3; bundle a known build; fixture tests on clean Windows |
| Large media freezes UI | Poor UX or crash | Run FFmpeg in a separate process; progress; bounded memory; performance gate |
| SQLite corruption or migration loss | Draft/cache loss | Schema versioning; backup before migration; corruption recovery; data-loss review |
| Unsigned installer SmartScreen | User cannot install confidently | Document the warning; publish checksum; no fake signing |
| No code-signing certificate | SmartScreen warning remains | Accepted v1 limitation; revisit when certificate exists |
| Plugin drift on Windows | Build breaks after upgrade | Pin versions in `pubspec.lock`; upgrade deliberately with tests |
| One developer, many modules | Scope creep and delay | Freeze MVP boundary; phase gates; cut workflows/insights/admin |
| Old Pake app data confusion | Wrong logs/cache inspected | Keep separate data root; document both paths |

---

## Blocking Inputs

These must be available before the phase that needs them:

| Input | Needed by | Owner |
|---|---|---|
| Supabase project URL, anon key, and dashboard access | Phase 1 | Project owner |
| Google OAuth client and redirect allowlist entry for `flowpost://auth-callback` | Phase 1 | Project owner |
| Test accounts for one platform (YouTube recommended) | Phase 2/4 | Project owner |
| R2/edge-function upload credentials and test bucket | Phase 3 | Project owner |
| Supabase/Vercel deploy access (if backend changes are needed) | Phase 2/4 | Project owner |
| Decision on backend idempotency/status guard | Phase 4 | Project owner |
| Code-signing certificate (optional; unsigned accepted) | Phase 7 | Project owner |

---

## Out of Scope for v1

- Workflows, insights, admin user management.
- Silent/automatic updates.
- MSIX, code signing, macOS, Linux, mobile.
- WebView-based UI.
- Multiple windows.
- Offline publishing queue.
- New backend service or new product features.
- Bulk operations beyond select-all on the upload list.
- A custom component library beyond Material 3 + FlowPost tokens.

---

## Open Questions

1. Does identity use Supabase Auth, the existing custom `flowpost_token` session, or both? Decide in `SPEC-identity.md`.
2. Which secure storage: `flutter_secure_storage`/DPAPI or a small Credential Manager wrapper? Decide in `SPEC-identity.md`.
3. Drift or `sqflite_common_ffi` for SQLite? Decide in `SPEC-offline.md`.
4. Which FFmpeg build and license ships? Decide in `SPEC-media.md`.
5. Does the backend need an idempotency/status guard for retry, or is the client-side status refresh enough for v1?
6. Are real platform test accounts available for all six, or only YouTube for v1?
7. Is a code-signing certificate available before release? If not, unsigned is accepted.

---

## Release Checklist (Phase 7)

- [ ] `flutter analyze` zero issues.
- [ ] Format check clean.
- [ ] Unit and widget tests pass.
- [ ] Windows integration tests pass.
- [ ] Release build succeeds with production config.
- [ ] Installer builds and installs on clean Windows 10/11.
- [ ] Start Menu, uninstall, and protocol registration work.
- [ ] Real Google login and session restore work.
- [ ] One real account connect works.
- [ ] Media fixture path works end to end.
- [ ] Publish now and schedule work; duplicate guard proven.
- [ ] Offline cache and drafts work; no offline publish.
- [ ] No secrets in code or logs.
- [ ] Accessibility and contrast checks pass.
- [ ] Cold start under 3 seconds.
- [ ] README, runbook, ADRs, and release notes current.
- [ ] Rollback installer and steps ready.
- [ ] SmartScreen warning documented.
- [ ] Final `ponytail-audit` has no Must-fix.
- [ ] Human sign-off.
