# Spec: `identity` — FlowPost Native Sign-in and Session

**Module:** `identity` (see `docs/spec/flowpost-native-capability-map.md`)
**Status:** Draft for approval
**Created:** 2026-10-28
**Depends on:** `shell` (approved 2026-10-28)
**Blocks:** `accounts`, and every later module

---

## Objective

Let the existing FlowPost administrator sign in to the native Windows app with Google or email/password, pass the existing admin security-questions gate, and stay signed in across restarts without exposing tokens. This module owns authentication, session persistence, refresh, logout, and the identity screens; it does not own platform connections or publishing.

**User:** the existing FlowPost admin on Windows 10/11 x64. Signups are closed.

**Why now:** every later module needs an authenticated Supabase client and the existing edge-function session token. Without this module the app is a shell.

**Success looks like:** the admin installs the app, signs in with Google or email/password, answers the security questions, restarts the app and lands back in the app without signing in again, can log out, and no token or OAuth code appears in the log file.

## Assumptions (correct before implementation)

1. The Supabase project already has Google enabled as an auth provider and the existing admin user in `auth.users` and `public.users`.
2. Supabase Auth still uses the project's public anon/publishable key; the service-role key is never shipped in the client.
3. The existing edge functions keep their current contracts: `verify-security-questions`, `verify-session`, and the `sessions` table. This module does not rewrite or replace them.
4. The web app keeps using Supabase Auth plus the custom `flowpost_token` admin session. The native app mirrors that split; it does not invent a third auth system.
5. The Windows installer already registers `flowpost://` (Phase 0). The Supabase redirect allowlist can be updated to include `flowpost://auth-callback`.
6. Windows 10 1809+ has a working Credential Manager/DPAPI for the current user. Secure storage is per Windows user, not per app install.
7. The native MVP is for the single admin account. Non-admin `public.users` rows are not supported in v1 because every MVP action needs the admin session token.
8. The app can show a clear error and stay usable if Supabase is unreachable; cached reads and local drafts are Phase 5, not this module.

## Decisions (proposed — confirm at approval)

### 1. Two credentials, matching the web app

| Credential | Purpose | Lifetime | Storage |
|---|---|---|---|
| Supabase Auth session (access + refresh JWT) | Direct PostgREST reads (`public.users`), RLS, future cached reads | Access ~1 h; refresh until revoked | OS-protected secure storage |
| `flowpost_token` admin session | `Authorization: Bearer <token>` for edge functions, via the existing `sessions` table | 7 days, server-defined | OS-protected secure storage |

The Supabase JWT is **not** accepted by the edge functions today; their shared helper looks up the `sessions` table. The native app therefore signs in with Supabase Auth, then mints the admin session through `verify-security-questions`, exactly like the web app. No edge-function rewrite is needed.

### 2. Secure storage on Windows

Use `flutter_secure_storage` (Windows implementation: AES-GCM ciphertext with the key held by Windows Credential Manager). Store four records, all through one adapter:

- the Supabase session JSON (custom `LocalStorage` for `supabase_flutter`);
- the PKCE verifier (custom `GotrueAsyncStorage`);
- the `flowpost_token` plus its issue time;
- a minimal profile cache (`userId`, `isAdmin`) for offline startup.

Never write tokens to SQLite, `shared_preferences`, `%APPDATA%` plain files, or logs. The app data root keeps only logs and the shell's lock/owner files.

### 3. Google OAuth: system browser + PKCE + state

Use `supabase_flutter` with `detectSessionInUri: false` so the existing shell deep-link dispatcher stays the single owner of `flowpost://` links. The flow:

1. Generate a 32-byte random `state`; persist `{state, createdAt}` in secure storage.
2. `getOAuthSignInUrl(provider: google, redirectTo: 'flowpost://auth-callback?state=<state>')`. The SDK stores the PKCE verifier through the secure adapter.
3. Open the URL with `url_launcher` in the system browser.
4. On `flowpost://auth-callback`, require the exact scheme/host/path, a matching unexpired `state`, a non-empty `code`, and no `error` parameter.
5. Consume the pending state **before** exchanging the code, then call `exchangeCodeForSession(code)`. A consumed code is never retried; the user starts a new sign-in.
6. Pending state expires after 5 minutes. A cold-start callback can still validate it because it is persisted.

Do **not** request `access_type=offline` or `prompt=consent` for login. The app only needs the Supabase session; platform upload tokens are owned by the existing `*-auth` functions.

### 4. Security questions: once per admin session, not once per launch

After a successful Supabase sign-in (or when a stored admin token is missing/expired/revoked), the admin answers the existing two questions. A valid `flowpost_token` is proof that the gate was passed, so a normal restart with a valid token skips the questions. The web app currently re-prompts on every reload; this is the one deliberate behaviour difference, because the token already carries the verification and re-prompting would make every cold start a challenge.

- Call `GET verify-security-questions` to decide between **Set up** and **Verify**.
- `POST {action: "verify", favTeacher, bestNightDate}` returns `{verified, token}`.
- `POST {setQuestions: true, favTeacher, bestNightDate}` only when the GET says questions are unconfigured.
- Show the server's lockout message verbatim (5 failures / 15 minutes per IP). Do not add a local lockout or store answers.
- The function deletes all rows in `sessions` when it mints a token, so the newest verification wins and older clients are signed out of edge functions. Handle a later `401` by clearing the token and showing the questions again.

### 5. Admin-only v1

After Supabase sign-in, read `public.users` by the auth user id. If there is no row, sign out and show "Sign up is closed. Contact the admin." If `is_admin` is not true, sign out and show "This desktop build is for the administrator account." This matches the closed-signup model and avoids a half-working non-admin UI.

### 6. Offline startup

Restore the Supabase session and profile cache from secure storage without blocking on the network. If `verify-session` cannot be reached, keep the token and mark the session `offline`; the shell can open, but privileged actions wait for connectivity. On reconnect, revalidate the token; an invalid token returns the admin to the questions. Phase 5 adds cached data and drafts.

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Auth / DB | `supabase_flutter` | Wraps `supabase`, `gotrue`, PostgREST; Windows supported |
| Secure storage | `flutter_secure_storage` | Windows Credential Manager-backed; no plaintext fallback |
| Browser launch | `url_launcher` | Already in `pubspec.yaml` |
| State | `flutter_riverpod` | Existing app pattern |
| Routing | `go_router` | Existing router; add `/auth-callback` and `/security-questions` |
| Logging | `logging` | Existing redaction; never log tokens, codes, or answers |

Add only `supabase_flutter` and `flutter_secure_storage` as direct dependencies. Pin versions in `pubspec.lock`; run `flutter pub get` and rebuild the installer after adding them.

## Commands

```powershell
cd desktop-flutter
flutter pub get
flutter analyze
dart format --set-exit-if-changed lib test integration_test
flutter test
flutter test test/features/identity
flutter test integration_test -d windows --dart-define-from-file=config/dev.json
flutter build windows --release --dart-define-from-file=config/prod.json
iscc installer/flowpost.iss
```

Real sign-in needs `config/dev.json` or `config/prod.json` with the real Supabase URL and anon key, plus the Supabase redirect allowlist entry. Those are not committed.

## Project Structure

```
desktop-flutter/lib/features/identity/
  data/
    auth_repository.dart       # Supabase auth, user lookup, admin session, logout
    secure_store.dart          # flutter_secure_storage adapter (LocalStorage + PKCE + token)
    oauth_flow.dart            # state generation, callback validation, exchange
    identity_models.dart       # typed session/profile/error states
  presentation/
    login_page.dart            # email/password + Google + states
    security_questions_page.dart
    auth_callback_page.dart    # spinner/error while the code is exchanged
  identity_providers.dart      # Riverpod providers and route controller
```

Router changes live in `lib/core/router/app_router.dart`; startup wiring lives in `lib/main.dart` and `lib/app.dart`. Tests mirror this under `test/features/identity/`.

## Auth Contract

| Call | Credential | Request | Response / use |
|---|---|---|---|
| Supabase password grant | anon key | email, password | Supabase session |
| Supabase `/authorize` + PKCE exchange | anon key | provider, redirect, code verifier | Supabase session |
| `GET /rest/v1/users?id=eq.<uid>&select=id,is_admin` | Supabase JWT | — | admin check |
| `GET /functions/v1/verify-security-questions` | public function | — | `questionsConfigured` |
| `POST /functions/v1/verify-security-questions` | public function | verify or setup body | `{verified, token}` |
| `POST /functions/v1/verify-session` | public function | `{token}` | `{valid, userId}` |
| Edge functions | `flowpost_token` in `Authorization` | existing bodies | unchanged |

`verify-password` is legacy and is **not** used by this client. The web app's login page uses Supabase Auth, not that function.

## Flows

**Email/password**

1. Validate non-empty email/password locally; disable the form while waiting.
2. `signInWithPassword`; map `invalid_credentials`, `email_not_confirmed`, `over_request_rate_limit`, and socket errors.
3. Look up `public.users`; reject missing/non-admin users as above.
4. If no valid admin token, show security questions; otherwise go to `/`.

**Google**

1. Build the URL, persist state, launch the browser, show a waiting state with **Cancel**.
2. Accept the callback only from the shell's `/auth-callback` route; validate state/code.
3. Exchange the code, then run the same user check and security-question step.
4. Cancel, timeout, `access_denied`, and exchange failure all return to the login page with a specific message.

**Startup**

1. Initialize Supabase with the secure local storage and `detectSessionInUri: false`.
2. Restore the session and profile cache.
3. If online, re-read `public.users`; a missing/non-admin row signs out.
4. If a stored admin token exists, call `verify-session`. Valid → signed in. Invalid → questions. Offline → signed in with an offline marker.
5. No session → login page.

**Logout**

1. Call Supabase `signOut` with global scope to revoke refresh tokens.
2. Clear the Supabase session, admin token, profile cache, and pending OAuth state.
3. Stop timers, navigate to `/`, and leave no token in the log.

## Error States

| Condition | Message |
|---|---|
| Offline during sign-in | "Can't reach FlowPost. Check your connection." |
| Wrong email/password | "Email or password is incorrect." |
| Supabase rate limit | "Too many attempts. Try again in a few minutes." |
| Unknown Supabase user | "Sign up is closed. Contact the admin." |
| Non-admin user | "This desktop build is for the administrator account." |
| OAuth cancelled / denied | "Google sign-in was cancelled." |
| Missing/expired/mismatched state | "Sign-in could not be verified. Try again." |
| Code exchange failure | "Google sign-in failed. Try again." |
| Admin token expired/revoked | Questions page with "Your admin session expired. Answer your security questions again." |
| Questions unconfigured | Setup form |
| Questions wrong / locked | Server message; remaining attempts if provided |
| Network error on questions | "Can't reach FlowPost. Check your connection." |
| Secure storage unavailable | "FlowPost can't store your sign-in securely. Restart the app." |

Every error is visible text (not only a snackbar), keyboard reachable, and announced with `Semantics(liveRegion: true)`.

## Code Style

- Dart 3, `flutter_lints`, no `dynamic` in the auth layer; parse at the boundary.
- One public class per file; feature-first under `lib/features/identity/`.
- Secrets never enter `toString()`; models expose only `userId`, `email`, `isAdmin`, and expiry.
- Fail closed on any missing/invalid OAuth parameter.

```dart
sealed class AuthState {
  const AuthState();
}

final class SignedOut extends AuthState {
  const SignedOut(this.message);
  final String? message;
}

final class AwaitingQuestions extends AuthState {
  const AwaitingQuestions({required this.questionsConfigured});
  final bool questionsConfigured;
}

final class SignedIn extends AuthState {
  const SignedIn({required this.userId, required this.isAdmin, this.offline = false});
  final String userId;
  final bool isAdmin;
  final bool offline;
}
```

## Testing Strategy

| Level | Scope | Command |
|---|---|---|
| Unit | Secure store round-trip/clear; OAuth state generation; callback rejects missing/wrong/expired state, missing code, error callback, wrong scheme/path; user check rejects missing/non-admin; token expiry; logout clears; error mapping | `flutter test test/features/identity` |
| Widget | Login idle/loading/error/offline; questions verify/setup/locked; callback spinner/error; keyboard focus and Enter submit | `flutter test` |
| Integration | App boots to login without a session; fake callback reaches `/auth-callback`; signed-in fake state reaches home | `flutter test integration_test -d windows` |
| Manual | Real Google and email/password login on the installed build; restart; logout; expired/revoked token; no token in `app.log` | Phase 1 gate |

Use a fake auth gateway and an in-memory secure store for tests. The real Supabase client is never called in unit tests. Every new branch (missing user, non-admin, expired state, consumed code, invalid token) gets one test.

## Boundaries

- **Always:** validate state/code before exchange; store tokens only through the secure adapter; redact deep links and auth errors in logs; sign out unknown/non-admin users; send the existing Supabase JWT for `public.users`; run analyze/format/tests before the gate.
- **Ask first:** adding the two dependencies; changing the Supabase redirect allowlist, Google provider, or signup setting; changing the `sessions` lifetime or `verify-security-questions` contract; any backend deploy.
- **Never:** ship the service-role key or a secret key; add a signup or password-reset flow in v1; log tokens, codes, state, passwords, or security answers; store tokens in plaintext/SQLite; accept an OAuth callback without a matching state; retry a consumed code; skip the admin check.

## Success Criteria

1. Email/password and Google sign-in work for the provisioned admin on the installed build.
2. Google returns through `flowpost://auth-callback`; a wrong scheme/path, missing state, mismatched state, expired state, missing code, or provider error is rejected with a readable message.
3. Unknown Supabase users and non-admin `public.users` rows are signed out; no signup UI exists.
4. The security-questions gate appears when there is no valid admin token; setup works when unconfigured; wrong answers show the server's lockout message; correct answers mint and store a token.
5. A valid session and admin token survive an app restart without re-entering credentials; a missing/expired/revoked token returns to the questions or login.
6. Logout clears the Supabase session, admin token, profile cache, and pending OAuth state, revokes refresh tokens, and returns to login.
7. No token, authorization code, OAuth state, password, or security answer appears in `%APPDATA%\com.flowpost\FlowPost\logs\app.log` or in SQLite.
8. `flutter analyze`, formatting, unit/widget tests, the Windows integration test, release build, and installer pass.
9. The manual real-login gate passes on the installed build without a Must-fix security finding.

## Known Inherited Risks / Backend Hardening

1. **`verify-security-questions` has no caller authentication.** It is deployed with `verify_jwt = false` and does not check a Supabase JWT. Anyone who can reach the function URL can call `setQuestions` or attempt verification (rate-limited to 5 attempts / 15 minutes per IP). This can lock the admin out of edge functions. **Recommended fix before the Phase 1 gate:** verify the caller's Supabase JWT with `supabase.auth.getUser(jwt)` and require the admin user; the native client will send the Supabase access token. This needs a backend deploy and is blocked until deploy access exists.
2. **One admin session globally.** `verify-security-questions` deletes every `sessions` row before inserting, so signing in on the web invalidates the desktop token and vice versa. The app handles this as an expired token, not a crash.
3. **No server-side logout for the custom token.** Logging out clears the client but the 7-day bearer token stays valid until expiry or the next verification. A revoke function is a backend change; accept the 7-day window for v1.
4. **`sessions` tokens are bearer tokens.** They must never appear in logs or support bundles. Secure storage protects them at rest only.
5. **Uninstall keeps secure storage.** A reinstall on the same Windows user can restore the previous session unless the user logged out or the token expired. Accept for v1; document it.

## Out of Scope

Platform account connections (`accounts`), media, publishing, scheduling, offline cache/drafts, password reset, signup, MFA/passkeys, biometric unlock, admin user management, silent update, and any backend rewrite. The web app keeps its current auth flow.

## Open Questions (confirm at approval)

1. **Question cadence:** accept "once per admin session" (recommended) instead of the web app's every-launch prompt?
2. **Admin-only:** accept rejecting non-admin `public.users` rows in v1 (recommended), or allow them into a read-only shell?
3. **Backend hardening:** approve adding JWT verification to `verify-security-questions` as a Phase 1 Must-fix (requires deploy access), or accept the inherited public-function risk for the single-admin MVP?
4. **Logout scope:** use global Supabase sign-out (revokes the web session too) or local-only sign-out? Global is recommended.
5. **Real credentials:** confirm when the Supabase dashboard redirect allowlist and real `config/*.json` values will be available; without them the real-login gate stays blocked.

## Approval

Awaiting project-owner approval of the decisions and open questions above. Implementation starts with Task 1.2 (auth data layer) only after approval; real Google login remains gated on Supabase dashboard access.
