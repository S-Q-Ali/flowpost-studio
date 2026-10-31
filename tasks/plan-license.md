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
        └──────────────────►  mint session (7 days)   ──────►  Router guard opens the app
                              bound to the admin user id
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
  (marked "offline"); an expired token goes back to the license screen. When
  online, the stored token is confirmed with the existing `verify-session`.
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

- [ ] **L5 — License data layer** (M)
  `features/license/data/`: models (`LicenseState`: `Locked(reason)` /
  `Active(expiresAt, offline)`), a client that POSTs to
  `<supabaseUrl>/functions/v1/verify-license` with `apikey` and maps
  401/429/network/timeout to typed errors, a vault-backed store (`SecretVault`,
  keys `flowpost_license_token` / `_expires_at`), and a service with
  `activate(key)`, `restore()` (expiry check + optional `verify-session`) and
  `clear()`. Injectables for tests; clock injected.
  - Acceptance: success persists token + expiry and returns Active; 401 → Locked
    with "not valid"; expired stored token → Locked; offline with a future expiry
    → Active(offline: true); clear removes both records.
  - Files: `lib/features/license/data/*.dart`, tests beside them.

- [ ] **L6 — Controller and session wiring** (S)
  `licenseControllerProvider` (AsyncNotifier) that drives
  `sessionProvider.signIn/clear` and loads at startup; `/starting` while loading.
  - Acceptance: provider tests cover activate, restore, expiry, clear.

- [ ] **L7 — License screen** (M)
  `/license`: key field (`license-key`), submit (`license-submit`), busy state,
  calm error (`license-error`, live region), sign-out/deactivate link, and the
  setup link when config is missing. No key is echoed back or logged.
  - Acceptance: widget tests for success, 401, 429, network error, busy state,
    keyboard submit, and the semantics label.

- [ ] **L8 — Unwire identity, wire the guard** (M)
  `app.dart`, `main.dart`, `app_router.dart`: drop every identity import and the
  `/login`, `/security-questions`, `/auth-callback` routes; add `/license`; the
  guard reads the license state. `identityGuard` becomes `licenseGuard` (default
  false for the existing widget tests, true in `main.dart`). Files under
  `features/identity/**` stay untouched and unreferenced.
  - Acceptance: router tests (new) cover locked → `/license`, active → app,
    loading → `/starting`, setup still wins when config is missing; the app builds
    with `flutter analyze` clean.

- [ ] **L9 — Settings and sign-out** (S)
  Replace the Account section with a License section (state line + expiry +
  "Change license" → `/license`, "Deactivate this PC" with the same confirmation
  and cache wipe). `Session` drops the unused `accessToken` and
  `authAccessTokenProvider`; removing the Supabase JWT from the app is part of the
  unwiring.
  - Acceptance: settings tests show Active/expired/offline copy; deactivation
    clears the token and the caches even when identity is not present; no settings
    copy mentions signing in.

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
