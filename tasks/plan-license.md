# Implementation Plan: License-key access for the desktop app

## Context

Owner decision (2026-10-31): the desktop app is opened with a simple license key.
Login, Google OAuth and sign-up are removed from the desktop experience, and the
existing identity module (I1–I11) is **unwired but kept** in the repository.
The repository is already public and MIT-licensed, so "open source" needs no work;
the license is access control for the owner's backend, not a source licence.

Scope answers:

| Question | Answer |
|---|---|
| What is gated | The desktop app only. The web dashboard keeps its Supabase login. |
| Existing identity code | Unwired from the app; files and history stay. |
| License model | SHA-256 hashes in a `licenses` table; a new `verify-license` function mints the existing 7-day session token. |

## Architecture

```
Desktop first run                Backend                        Desktop after
setup (URL + anon key)  ──►  POST functions/v1/verify-license
license key (user)            hash = sha256(key)              secure vault:
        │                     licenses: active, not expired   token + expiresAt
        └──────────────────►  mint session (7 days)   ──────►  + key in the vault
                              bound to the admin user id      Router guard opens the app
                                                                     │
                                                              edge calls use
                                                              x-admin-token / Bearer <session token>
```

- **Server-side only.** In an open-source app a client check is patchable, so the
  key is checked by an edge function and the functions keep requiring the minted
  session token. The anon key alone is rejected by `_shared/auth.ts` as today.
- **No Supabase Auth on the desktop.** The desktop never calls GoTrue; the session
  token comes from the license function, exactly the token the existing edge
  functions already accept, so no other function changes.
- **Only hashes at rest.** The `licenses` table stores `sha256(key)`; the plaintext
  key exists only in the owner's hand-off and on the user's machine (no UI echo,
  no log).
- **Same single-session model as today.** Minting a session deletes older ones, so
  activating a license signs out the web admin gate and vice versa; this is the
  documented behaviour and stays.
- **Offline.** A stored, unexpired token opens the app without a network call
  (marked "offline"); an expired token renews silently with the key kept in the
  vault, and only a revoked or missing key sends the user back to the license
  screen. When online, the stored token is confirmed with the existing
  `verify-session`.
- **Unwired, not deleted.** `features/identity/**` stays in the tree and its unit
  tests keep passing; no app file imports it. `SPEC-identity.md` gets an inactive
  header; ADR 0001 stays as history and ADR 0005 records the supersession.

## Task List

### Phase 1 — Backend

- [ ] **L1 — Shared license logic** (S)
  `_shared/license.ts`: `normalizeLicenseKey` (trim, reject shorter than 16 or
  longer than 256), `hashLicenseKey(key, subtle)` → lowercase hex, and
  `isLicenseUsable(row, now)` (active, not expired). Vitest with the Node WebCrypto
  (injected) so the hash is pinned.
  - Acceptance: short/blank keys rejected; hash is stable and lowercase; an
    inactive or expired row is not usable; no key is ever logged.
  - Files: `supabase/functions/_shared/license.ts`, `.test.ts`.

- [ ] **L2 — One session-minting helper** (S)
  Extract the session insert from `verify-security-questions` into
  `_shared/session.ts` (`createAdminSession(supabase, { now })` → token, expiresAt),
  tested with a fake Supabase builder. Both functions use it; the question
  function's behaviour is unchanged.
  - Acceptance: 7-day expiry, token is 64 hex chars, insert failure throws.
  - Files: `_shared/session.ts`, `.test.ts`, `verify-security-questions/index.ts`.

- [ ] **L3 — `licenses` migration** (XS)
  Table `public.licenses`: `id uuid pk default gen_random_uuid()`,
  `key_hash text unique not null`, `label text`, `active boolean not null default
  true`, `expires_at timestamptz`, `created_at`, `last_used_at`; RLS enabled with
  no policies (service role only).
  - Acceptance: `supabase db lint`-clean SQL; no policy grants anon access.

- [ ] **L4 — `verify-license` edge function** (M)
  `verify_jwt = false` in `config.toml`; CORS; IP rate limit through the existing
  `_shared/rate-limit.ts` (5 attempts / 15 min, reused lockout); POST `{licenseKey}`
  → normalize, hash, `maybeSingle` active row, set `last_used_at`, mint session,
  answer `{valid:true, token, expiresAt}`; invalid → 401 `{valid:false}`; locked →
  429; malformed → 400. No key in any log line.
  - Acceptance: valid key returns a working session; wrong/expired/inactive keys
    return 401 without revealing which; sixth attempt is locked; OPTIONS works.
  - Files: `supabase/functions/verify-license/index.ts`, `supabase/config.toml`.

### Phase 2 — Desktop

- [x] **L5 — License data layer** (M)
  `features/license/data/`: models (`LicenseState`: `Locked(reason)` /
  `Active(expiresAt, offline)`), a client that POSTs to
  `<supabaseUrl>/functions/v1/verify-license` with `apikey` and maps
  401/429/network/timeout to typed errors, a vault-backed store (`SecretVault`,
  keys `flowpost.license.token` / `.expires_at` / `.key`), and a service with
  `activate(key)`, `restore()` (local expiry check, silent renewal from the
  stored key) and `clear()`. Injectables for tests; clock injected.
  - Acceptance: success persists token + expiry + key and returns Active; 401 →
    Locked with "not valid"; expired stored grant → renewed silently, or Locked
    (offline/expired) with the key kept; revoked grant → Locked and cleared;
    clear removes all three records.
  - Files: `lib/features/license/data/*.dart`, tests beside them.

- [x] **L6 — Controller and session wiring** (S)
  `licenseControllerProvider` (AsyncNotifier) that drives
  `sessionProvider.signIn/clear` and loads at startup; `/starting` while loading.
  - Acceptance: provider tests cover activate, restore, expiry, clear.

- [x] **L7 — License screen** (M)
  `/license`: key field (`license-key`), submit (`license-submit`), busy state,
  calm error (`license-error`, live region), the active license and its expiry
  when one is stored, and a deactivate link. The setup link is dropped because
  the router always sends the setup screen first when values are missing.
  No key is echoed back or logged.
  - Acceptance: widget tests for success, 401, 429, network error, busy state,
    keyboard submit, the semantics label, deactivation and the restored state.
  - Files: `lib/features/license/presentation/license_gate_page.dart`.

- [x] **L8 — Unwire identity, wire the guard** (M)
  `app.dart`, `main.dart`, `app_router.dart`: drop every identity import and the
  `/login`, `/security-questions`, `/auth-callback` routes; add `/license`; the
  guard reads the license state. `identityGuard` becomes `licenseGuard` (default
  false for the existing widget tests, true in `main.dart`). The three route
  constants stay because the unwired pages still name them. Files under
  `features/identity/**` stay untouched and unreferenced; the identity router
  test and the callback's login-route assertion are removed with the routes,
  replaced by `test/features/license/router_guard_test.dart`.
  - Acceptance: router tests cover locked → `/license`, active → app,
    loading → `/starting`, license reachable while active, pending link and
    setup still wins when config is missing; `flutter analyze` clean.

- [x] **L9 — Settings license section and deactivation** (S)
  Replace the Account section with a License section: the state line, the expiry,
  "Change license" → `/license`, and "Deactivate this PC" behind the existing
  confirmation. Deactivation clears the vault record, the session, the queue and
  calendar reads and the posts cache, whichever of those fail. `settings_providers`
  stops importing the identity module. The diagnostics line becomes
  "License: active/inactive".
  - Acceptance: settings tests show Active/expired/offline copy; deactivation
    clears the token and the caches even when identity is not present; no settings
    copy mentions signing in; a failed vault clear still ends the session and the
    caches.
  - Note: `Session.accessToken` stays until **L9b**, because the queue and publish
    writes still need it (see below).
  - Done 2026-10-31: `deactivate()` returns whether the vault was cleared but ends
    the session and caches either way; the license page gained a "Back to the app"
    link so Settings → "Change license" is not a dead end; `signedIn` in the
    diagnostics facts became `licensed`. All 858 tests, analyzer and formatter
    green; no `lib/` file outside `features/identity/**` imports identity.

- [x] **L9b — Posts access without Supabase Auth** (M) — found while reading L9
  The queue, calendar and publish writes talk to `posts` over PostgREST with the
  Supabase Auth JWT (`auth.uid() = user_id`). With login gone there is no JWT to
  send, and the 7-day session token is not one. Add a `posts-api` edge function
  (service role, `_shared/auth.ts` session lookup, ownership from the session's
  user) exposing only the calls the desktop makes: list, range, read, insert,
  update, delete. Move `PostgrestPostsRepository` and
  `PostgrestScheduledPostsRepository` onto it, rewrite their tests, then delete
  `Session.accessToken`, `authAccessTokenProvider` and the JWT helpers, and change
  the remaining "Sign in required" copy.
  - Acceptance: no `rest/v1` call from the desktop app; a session can only touch
    its own rows; the queue/calendar/publish tests run against a fake function
    transport; no `lib/` file imports `core/auth/access_token.dart`.
  - Deploy: ships with L11 (owner-assisted).
  - Done 2026-10-31: `posts-api` takes `{action, ...}` bodies and answers
    `{rows: [...]}`; every query filters `user_id` from the session and insert
    overwrites the owner, so a client cannot name another user. The session is
    the only credential (`Session.sessionToken`); `accessToken`,
    `authAccessTokenProvider` and `core/auth/` are gone, and the remaining
    copy says "Activate a license…". The settings connection probe still pings
    `/rest/v1/` — it tests the backend, not a posts call. 855 Flutter tests, 179
    Vitest tests, analyzer, formatter, `tsc -b` green.


### Phase 3 — Docs, deploy and gate

- [ ] **L10 — Docs** (S)
  `docs/spec/SPEC-license.md` (flow, threats, key issuance/rotation/revocation),
  `docs/adr/0005-license-key-access.md`, inactive note atop `SPEC-identity.md`,
  runbook (issue a key, revoke a key, activation signs out the web gate), README
  first-run copy.
  - Acceptance: issuing/revoking a key is a copy-pasteable SQL snippet using a
    one-line hash command; no secret in any doc.

- [ ] **L11 — Deploy and seed a key** (owner-assisted)
  `npx supabase db push`, `functions deploy verify-license
  verify-security-questions`, insert the first license row, then the manual
  Windows gate: activate, restart, expire, revoke, offline start, log has no key.
  - Acceptance: manual gate passes; `sessions` gets a row on activation.

- [ ] **L12 — Gate** (S)
  `dart format --set-exit-if-changed`, `flutter analyze`, full `flutter test`,
  `npm test`, `npx tsc -b`; graph update; atomic commits.
  - Acceptance: all green; identity tests still green but nothing in `lib/` outside
    `features/identity/**` imports that folder.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| OSS client check bypassed | High | The check is server-side; functions still need the session token |
| Key leak / sharing | Med | Hashes only, per-key revoke (`active=false`), rate limit, optional expiry |
| Single-session model logs out the web gate | Med | Documented; expired token → license screen with a clear message |
| Owner deploy credentials unavailable | High (blocks L11) | Everything through L10 is testable with fakes; only L11 is owner-blocked |
| Identity files rot once unwired | Low | Kept as reference; `SPEC-identity.md` marks them inactive, tests still run |

## Owner Actions

1. Provide a Supabase personal access token when L11 is reached (deploy + migration).
2. Confirm licenses are issued per person with an optional expiry (default: no expiry).
3. Run the manual Windows gate on the real backend after deploy.
