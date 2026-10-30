# Implementation Plan: Desktop Identity — Sign-in, Session and Security Questions

**Status:** awaiting owner approval
**Created:** 2026-10-31
**Scope:** the deferred `identity` slice from `docs/spec/SPEC-identity.md`, implemented so the downloaded Windows app can actually sign in and use Queue, Calendar and publishing.
**Owner decisions (2026-10-31):** sign-in must ship before the public `v1.0.0`; the app registers `flowpost://` for itself in HKCU on first run (portable ZIP stays portable); `verify-security-questions` gets Supabase JWT + admin verification and is redeployed as part of this slice.
**Related:** `docs/spec/SPEC-identity.md` (approved scope), `tasks/plan-production-launch.md` (T10 waits for this slice), `docs/runbook.md`.

---

## Overview

Everything needed to publish already exists below the identity line: the session seam, the Supabase access token seam, local media, captions, scheduling and offline cache. What is missing is the part that fills those seams. The app currently shows "Sign in required" on Queue and Calendar and "Not signed in" in Settings, while `verify-security-questions` mints the 7-day admin token that every edge function already expects.

This plan implements the spec's two-credential model (Supabase Auth session + `flowpost_token`), Google OAuth through the system browser with PKCE and state, the security-questions gate, secure storage on Windows, startup restore, logout, and the three missing screens. It also closes the inherited backend hole: the questions function currently trusts any caller.

## Architecture Decisions

- **Two credentials, as the spec and the web app define them.** Supabase Auth JWT for PostgREST and RLS; `flowpost_token` for edge functions. No edge-function rewrite beyond the caller check.
- **Secure storage only.** `flutter_secure_storage` (Windows Credential Manager-backed) holds the Supabase session JSON, the PKCE verifier, the admin token plus issue time, and a minimal profile cache. Nothing sensitive in SQLite, JSON files, or logs.
- **`detectSessionInUri: false`.** The existing shell deep-link dispatcher in `main.dart` stays the single owner of `flowpost://` links; the router's `/auth-callback` route becomes the exchange screen.
- **Protocol registration happens in the app, per user.** First run writes `HKCU\Software\Classes\flowpost` with a `URL Protocol` entry and the current exe path. Idempotent, no UAC, non-fatal on failure (email/password still works). No system-wide change, no installer requirement.
- **OAuth state is consumed before the code exchange** and expires after five minutes; a mismatched, missing or expired state fails closed. Landing on `/auth-callback` without a valid state is an error screen, never a retry.
- **Questions once per admin session.** A valid stored `flowpost_token` skips the questions on restart (spec Decision 4); an expired or revoked token returns to the questions page.
- **Admin-only v1.** A Supabase user with no `public.users` row or `is_admin = false` is signed out with the spec's message.
- **Backend caller check.** `verify-security-questions` verifies the Supabase JWT with the service client (`auth.getUser`), reads `public.users.is_admin`, and rejects everything else with 401. Rate limiting stays.
- **Email/password stays.** Google is the primary path, but email/password keeps the app usable if the custom-scheme callback is blocked by policy.
- **No new UI framework or state library.** Riverpod, GoRouter and Material 3 continue.

## Dependency Graph

```
I1 deps + Supabase bootstrap
      │
      ├─ I2 secure store ── I3 auth repository ── I4 OAuth flow
      │                                   │
      │                                   └─ I5 controller + session wiring + logout
      │                                               │
I6 protocol registration ──────────────────────────────┤
                                                       ├─ I7 login page
                                                       ├─ I8 questions page
                                                       ├─ I9 callback page + router guard
                                                       └─ I10 Settings account/sign-out
                                                                 │
I11 backend hardening ── I12 deploy + allowlist + real config ────┴─ I13 identity gate
```

## Task List

### Phase A — Foundation

- [ ] **I1 — Dependencies and Supabase bootstrap** (M)
  Add `supabase_flutter` and `flutter_secure_storage`; create `lib/features/identity/data/identity_client.dart` that initializes Supabase once with the secure `LocalStorage`, the PKCE async storage, and `detectSessionInUri: false`, exposed through a provider that tests override. Verify the Windows release build still links.
  - Acceptance: `flutter pub get` pins both deps; no `Supabase.initialize` call outside this seam; tests never touch the network.
  - Verification: `flutter analyze`, `flutter test`, `flutter build windows --release` with a placeholder config.
  - Files: `pubspec.yaml`, `pubspec.lock`, `lib/features/identity/data/identity_client.dart`, `lib/features/identity/identity_providers.dart`. Deps: none (owner approval of the two dependencies covered by this plan's approval).

- [ ] **I2 — Secure store adapter** (S)
  `IdentityStore` interface plus `SecureIdentityStore` (flutter_secure_storage) and `MemoryIdentityStore` for tests. Four records: Supabase session JSON, PKCE verifier, admin token + issued time, profile cache (`userId`, `email`, `isAdmin`). One `clear()` that removes all of them.
  - Acceptance: round-trip and clear covered; invalid JSON is treated as absent; nothing is written outside the adapter.
  - Verification: `flutter test test/features/identity/secure_store_test.dart`.
  - Files: `lib/features/identity/data/identity_store.dart`, test. Deps: I1.

- [ ] **I3 — Auth repository and contracts** (M)
  Injected gateways for Supabase password grant, OAuth code exchange, sign-out, `public.users` admin check, `verify-session` and `verify-security-questions` (GET + POST). Typed errors mapped to the spec's messages (offline, wrong password, rate limit, closed signup, non-admin, expired token, network).
  - Acceptance: every error table row has one test; unknown/non-admin users sign out; a missing token returns `AwaitingQuestions`; a valid token returns `SignedIn`.
  - Verification: `flutter test test/features/identity/auth_repository_test.dart`.
  - Files: `lib/features/identity/data/auth_repository.dart`, `lib/features/identity/data/identity_models.dart`, test. Deps: I1, I2.

- [ ] **I4 — OAuth flow** (S)
  State generation (32 random bytes, base64url), persistence with timestamp, URL build (`redirectTo: flowpost://auth-callback?state=…`), callback validation (scheme `flowpost`, host `auth-callback`, path empty or `/`, matching unexpired state, non-empty code, no `error`), consume-before-exchange.
  - Acceptance: rejects wrong scheme, wrong host, missing/mismatched/expired state, missing code and provider errors; consumes the state exactly once; a replay fails.
  - Verification: `flutter test test/features/identity/oauth_flow_test.dart`.
  - Files: `lib/features/identity/data/oauth_flow.dart`, test. Deps: I2.

- [ ] **I5 — Identity controller, session wiring and logout** (M)
  Sealed `AuthState` (`SignedOut`, `AwaitingQuestions`, `SignedIn` with `offline`), startup restore (session + profile cache without blocking, then `verify-session`), sign-in orchestration (password, OAuth callback, questions), wiring `sessionProvider` with `Session(accessToken, sessionToken)`, logout (global Supabase sign-out, store clear, cache wipe through the existing settings path) and token-expiry handling.
  - Acceptance: restart with valid stored state reaches `SignedIn`; offline startup reaches `SignedIn(offline: true)`; a 401 from an edge call clears the token and shows questions; logout leaves no token in the store or provider.
  - Verification: `flutter test test/features/identity/identity_controller_test.dart`.
  - Files: `lib/features/identity/identity_providers.dart`, `lib/features/identity/identity_controller.dart`, test. Deps: I3, I4.

- [ ] **I6 — First-run `flowpost://` registration** (S)
  Windows-only registrar writing `HKCU\Software\Classes\flowpost` (`URL Protocol`, default icon, `shell\open\command` = current exe). Idempotent, skipped on non-Windows, failure logged without blocking startup, covered by a fake registry target.
  - Acceptance: writes only that key; repeat runs are no-ops; a refused write does not stop the app.
  - Verification: unit test with the fake registry; manual check with `reg query HKCU\Software\Classes\flowpost` after launching the built exe.
  - Files: `lib/core/shell/protocol_registrar.dart`, `lib/main.dart`, test. Deps: none.

### Checkpoint A
- [ ] Analyze, format and the identity unit tests green; release build links with both new dependencies.

### Phase B — Screens and routing

- [ ] **I7 — Login page** (M)
  Email/password form and "Continue with Google", disabled while busy, inline error text, Enter submits, `Semantics(liveRegion: true)`, 200 % text check, minimum window size.
  - Acceptance: every spec error message reachable; cancel/timeout returns to idle; no password or token in logs.
  - Verification: `flutter test test/features/identity/login_page_test.dart`.
  - Files: `lib/features/identity/presentation/login_page.dart`, test. Deps: I5.

- [ ] **I8 — Security questions page** (M)
  Verify and setup modes, server lockout message shown verbatim, network error state, live region, answers never stored.
  - Acceptance: GET decides setup vs verify; correct answers continue; wrong answers show the server text; unconfigured questions offer setup.
  - Verification: `flutter test test/features/identity/security_questions_page_test.dart`.
  - Files: `lib/features/identity/presentation/security_questions_page.dart`, test. Deps: I5.

- [ ] **I9 — Callback page and router guard** (M)
  Replace the `/auth-callback` placeholder with the exchange screen (spinner, success, error with retry-to-login). Router redirect: no session → `/login`; awaiting questions → `/security-questions`; signed in → requested route; `/setup` and `/auth-callback` always reachable.
  - Acceptance: a signed-out deep link to any app route lands on login; an auth callback while signed out still reaches the callback page; a signed-in user cannot open login/questions.
  - Verification: `flutter test test/features/identity/router_guard_test.dart` plus the existing navigation tests.
  - Files: `lib/core/router/app_router.dart`, `lib/features/identity/presentation/auth_callback_page.dart`, test. Deps: I5.

- [ ] **I10 — Settings account section** (S)
  Show the signed-in email and state, add Sign out (confirm, global sign-out, cache wipe), keep the backend-change sign-out rule.
  - Acceptance: signed-in and signed-out states both covered; sign-out returns to login; the cached data is wiped.
  - Verification: `flutter test test/features/settings/settings_page_test.dart`.
  - Files: `lib/features/settings/presentation/settings_page.dart`, test. Deps: I5.

### Checkpoint B
- [ ] All Flutter gates green (analyze, format, full `flutter test`, release build); login, questions, callback and sign-out verified with fakes.

### Phase C — Backend and the real gate

- [ ] **I11 — Harden `verify-security-questions`** (S)
  Verify the caller's Supabase JWT with `auth.getUser`, require a `public.users` row with `is_admin = true`, return 401 otherwise; keep CORS, rate limiting and the response shape. Confirm `supabase.functions.invoke` in the web gate sends the session JWT (add the header explicitly if it does not). Shared logic goes in `_shared/` with a vitest test.
  - Acceptance: anonymous and non-admin callers get 401; the admin path is unchanged; web gate still verifies.
  - Verification: `npm test` (new shared tests), `npx tsc -b`; review the function diff.
  - Files: `supabase/functions/verify-security-questions/index.ts`, `supabase/functions/_shared/auth.ts` (or a new helper), `src/components/SecurityQuestionsGate.tsx` (only if the header is missing), tests. Deps: I5 (contract confirmed).

- [ ] **I12 — Deploy, allowlist and real configuration** (S, owner-assisted)
  Deploy the hardened function to `ximorwzknbizpceaoflw`; add `flowpost://auth-callback` to the Supabase Auth redirect allowlist (owner dashboard, or the Management API with the existing PAT once the owner confirms); write the real `SUPABASE_URL`/`SUPABASE_ANON_KEY` into the gitignored `config/dev.json`.
  - Acceptance: a release build with the real config completes Google and email/password sign-in, survives a restart without re-entry, honours logout, and shows the questions page on an expired token; `app.log` contains no token, code, state, password or answer.
  - Verification: manual gate on the Windows build; `reg query` shows the protocol; restart/logout/expired cases walked through.
  - Files: `config/dev.json` (not committed). Deps: I6–I11; owner supplies credentials and approves the allowlist change and deploy.

- [ ] **I13 — Identity gate** (S)
  `flutter analyze`, `dart format --set-exit-if-changed`, full `flutter test`, integration test, release build; then hand the launch plan back to T2 with the download now usable.
  - Verification: all commands green; evidence appended to `tasks/todo.md`.
  - Deps: I12.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Supabase rejects a custom-scheme redirect for the desktop app | High | Verify in I12 before the release; email/password remains the fallback, loopback redirect is the follow-up if the allowlist refuses. |
| Windows policies block HKCU protocol registration | Med | Non-fatal; app tells the user to use email/password; installer can register system-wide later. |
| `flutter_secure_storage` on Windows fails on some profiles | Med | Explicit startup error ("FlowPost can't store your sign-in securely. Restart the app."); never fall back to plaintext. |
| Web and desktop invalidate each other's admin token (single global session) | Med | Treated as an expired token → questions page with the spec's message; no crash. |
| Real credentials or allowlist unavailable | High (blocks I12) | Everything through Checkpoint B is testable with fakes; I12 is the only owner-blocked step. |
| Hardened questions function rejects the web gate | Med | I11 confirms the web client sends the JWT and includes the explicit header if needed; both surfaces tested. |
| Google sign-in requires the owner's Google account in the browser | Low | Email/password path proves the slice; owner performs the Google step in I12. |

## Owner Actions

1. Supply the real `SUPABASE_URL` and `SUPABASE_ANON_KEY` for `config/dev.json` (and as repository secrets for the release build).
2. Approve the `flowpost://auth-callback` redirect allowlist entry (owner dashboard, or confirm so the Management API can set it).
3. Approve the hardened `verify-security-questions` deploy (already agreed in principle on 2026-10-31).
4. Run the Google sign-in step of I12 in the browser; confirm email/password credentials for the admin account.
5. Rotate the credentials exposed in git history (unchanged from the launch plan).

## Open Questions

None — the spec's open questions are resolved: questions once per admin session, admin-only v1, harden the backend, global sign-out, and the portable-ZIP protocol registration via HKCU.
