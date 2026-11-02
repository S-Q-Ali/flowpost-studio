# Spec: `license` — The Desktop Unlocks with a Key

**Module:** `license` (owner decision 2026-10-31; built as plan-license L1–L9b)
**Status:** Documents shipped behaviour — written at L10, after the code, so every line below is what the tree does today (2026-11-03)
**Depends on:** `shell` (the router and the startup sequence), `credentials` (there must be a backend to ask before a key means anything), `settings` (the section that shows the state and deactivates)
**Supersedes:** `identity` — sign-in, Google OAuth and the security-question gate left the desktop; the module's files are deleted

---

## Objective

Give the owner a way to decide who may use their hosted backend from the Windows app, without an account system: the user types a key, the server says yes or no, and a yes opens the app for seven days — including offline.

FlowPost is MIT and public, so the key is not source protection. It unlocks the owner's servers (publishing, AI captions, platform grants), and that is the thing being rationed.

**User:** anyone the owner has handed a key to. **Success looks like:** paste the key once, use the app, close it, and next morning it opens with no network; when the owner revokes the key, the app stops taking work.

## Scope

In:

- `/license`: the key field, the answer, and a way to deactivate this PC.
- `verify-license` (edge, no JWT): hash, look up, mint a session.
- The vault-backed grant: token + expiry + the key itself, for silent renewal.
- The router guard, the expiry re-check, and the Settings **License** section.

Out:

- **Accounts, sign-up, passwords.** Gone from the desktop; the web dashboard keeps its Supabase login.
- **Per-PC or per-seat limits.** One key holds one session row, wherever it is used.
- **A billing or provisioning flow.** The owner issues keys by hand; see the runbook.
- **Offline renewal.** A key whose session expired cannot be renewed without reaching the function.

## The exchange

`desktop-flutter/lib/features/license/` ⇄ `supabase/functions/verify-license/index.ts`

1. The client POSTs `{licenseKey}` to `<supabaseUrl>/functions/v1/verify-license` with the `apikey` header and 30 seconds for the whole call (`defaultLicenseTimeout`).
2. The function checks its own pepper first: `LICENSE_PEPPER` unset or under 16 characters → **503**, because every stored digest was made with it and any answer would be a guess.
3. Two rate buckets, each 10 attempts per 15 minutes, through `consume_rate_limit`: `verify-license:ip:<ip>` so one machine cannot loop, and `verify-license:key:<hash>` so many machines cannot attack one key. A spent bucket is **429** with the server's own countdown text; a bucket whose store errored is **503** — a limit that opens when its store is down is not a limit.
4. `normalizeLicenseKey` trims and requires 16–256 characters, else **400**. `hashLicenseKey` makes lowercase `HMAC-SHA-256(LICENSE_PEPPER, key)` and one row is looked up by `licenses.key_hash`; anything else — no row, `active = false`, `expires_at` in the past, an unparseable expiry — is the same **401** "Invalid license key", so the screen never says how a key was wrong.
5. A usable row mints the session the other functions already accept: `createSession` writes `sessions (token, expires_at, user_id)` for 7 days with a token made of two fresh UUIDs and **deletes that user's older rows** first. The owner id is `licenses.user_id`, falling back to the `is_admin` user and then to `00000000-…`. `last_used_at` is stamped, and the answer is `{valid: true, token, expiresAt}`.
6. The client needs `valid === true`, a non-empty token and a parseable expiry, or it reports a failure; only then are the three vault records written.

The plaintext key is never stored on the server, never echoed by the API, and never part of an error — `LicenseException.toString()` carries the reason name only, so nothing that logs a license failure leaks a key.

## Where the grant lives

Windows Credential Manager through `flutter_secure_storage` (`SecureLicenseStore`): `flowpost.license.token`, `.expires_at`, `.key`. Nothing token-like goes in the data root, `cache.db`, `drafts.db` or `app.log`.

The key is stored on purpose: it is what lets an expired session renew itself while the app sits open. Its absence (an older build's record) is treated as an expired license and the record is cleared.

## The screen

`/license` (`LicenseGatePage`) is the only door into the app: the title "Unlock FlowPost", the copy that says the key unlocks the hosted backend and not the source, one plain-text key field (`autocorrect` and suggestions off), **Unlock** (which reads "Checking…" while the call runs), and **Deactivate this PC**. Errors land in a `Semantics(liveRegion: true)` line, never only a toast; keyboard submit works; the field is cleared and the failure stays after a refusal.

When a grant is already stored, the same screen shows it — "Active license · expires 2026-11-10 · offline" — with **Back to the app**, so Settings → **Change license** is not a dead end. Settings shows the same state in its **License** section: "Checking the license…", "Active license" with its expiry, or the reason it is locked ("No active license." when nothing is stored).

## States

`LicenseState` is sealed: `Active(expiresAt, offline)` or `Locked(reason, message?)`. The router decides from it and nothing else (`_licenseRedirect`):

| State | Route |
|---|---|
| no backend values | `/setup` — setup outranks the gate, since a key cannot be checked with no server |
| loading | `/starting` |
| `Locked` | `/license` |
| `Active` | the app shell; `/license` stays reachable |

- **First run.** `restore()` finds an empty vault → `Locked(missing)` → the key screen.
- **Activated.** Token, expiry and key in the vault, `sessionProvider.signIn(Session(sessionToken: …))`, and a timer armed for the expiry moment.
- **Offline start.** `restore()` reads the vault, the stored expiry has not passed → `Active(offline: true)` with no network call. The screen and Settings both mark it "offline".
- **Expired while open.** The armed timer fires `revalidate()` → the token is dropped first, then the queue and calendar providers are invalidated, then the stored key is offered again; a fresh grant re-arms the timer.
- **Refused while open.** A 401 from any posts call reaches `onRejected` in `ReportingTransport` → `revalidate(refused: true)`, which renews with the key instead of trusting the local clock. A renewal refused as `invalidKey`/`expired` clears the vault and sends the user to `/license` with the reason.
- **No network.** `LicenseError.offline` — "Can't reach FlowPost. Check your connection." A stored, unexpired grant still opens the app.
- **Vault unreadable or unwritable.** `LicenseError.storageUnavailable` — "FlowPost can't store your license securely. Restart the app."
- **Deactivated.** `deactivate()` clears the three records, ends the session, invalidates the queue and calendar and wipes the posts cache — a vault failure still does all of that and only adds the storage message. Locally the PC is clean; the minted session row lives until it expires, so an owner who is revoking for cause deletes it too (runbook).

## What the key does and does not protect

| Threat | Answer |
|---|---|
| A database dump leaks the keys | It leaks digests. Without `LICENSE_PEPPER` an attacker cannot test a guess offline, and the digests are not reversible. |
| Guessing keys over the network | 10 attempts per 15 minutes per IP and per key, in one atomic SQL counter, and the store refusing counts as a refusal. |
| Patching the client to skip the gate | The client is open source and patchable, so its check is not the protection. Every function and `posts-api` still authenticates the minted session (`_shared/auth.ts`); a patched binary with no valid session gets 401s. |
| A stolen laptop with an unexpired grant | Real exposure: the vault is per Windows account, and the app opens offline for the rest of the session. Lock your screen; use **Deactivate this PC** on a machine you no longer control, and have the owner revoke the key when it is lost. |
| A shared key | Nothing stops it. `last_used_at` says when a key last worked; one session row per user means sharers take turns (below). |
| Revoking a key | `active = false` blocks the next activation immediately; a session already minted stays valid until its expiry unless the owner deletes the row. |

**Two machines, one key.** Sessions are one-per-user, so activating on the second PC kills the first one's token. The first PC's next call is refused → it renews with its stored key → which kills the second. The practical result is that they alternate and each shows the license screen when it loses. Issue one key per person (`user_id`) when more than one person must work at the same time; a household with two PCs used by the same person is fine, since only one is normally open.

## Decisions

| # | Decision |
|---|---|
| 1 | Server-side check, session minted by the function. The desktop holds no password and never calls GoTrue. |
| 2 | `HMAC-SHA-256` under a server-only pepper, not plain SHA-256 and not bcrypt. Determinism is required: `licenses.key_hash` is a UNIQUE equality lookup, so per-row salts and password hashes cannot be used; the pepper moves guessing off the database and onto the secret. Added after the 2026-11-01 audit. |
| 3 | The function fails closed with 503 when the pepper is missing or too short, rather than comparing against digests it cannot reproduce. |
| 4 | The 401 never says whether the key was unknown, inactive or expired. |
| 5 | The key is kept in the vault beside the token, so an expired session renews without bothering the user. |
| 6 | The desktop's only credential is `Session.sessionToken`; `posts-api` replaced every direct `rest/v1/posts` read, because with no Supabase Auth there is no JWT to send. |
| 7 | Local expiry, confirmed by refusal — not `verify-session`. The app trusts the stored expiry while offline and re-checks the moment a call is refused or the timer fires. |
| 8 | The gate is one sealed state read by the router; screens never ask "am I signed in". |

## Tests

- `supabase/functions/_shared/license.test.ts` — normalization bounds, digest determinism and case-sensitivity, pinned HMAC vectors for two peppers and two keys, the blank/short-pepper refusals, and `isLicenseUsable` for inactive, expired and unparseable rows.
- `supabase/functions/_shared/session.test.ts` — the 7-day expiry, one-user's-sessions-only delete, insert failure throws.
- `test/features/license/license_client_test.dart` — each status to each `LicenseError`, the server's countdown text surviving, and a `valid: true` body missing a token treated as a failure.
- `test/features/license/license_store_test.dart` — round-trip, a record with no expiry is nothing, and `clear()` deletes all three records even when one delete fails.
- `license_service_test.dart` / `license_controller_test.dart` — offline start, silent renewal, renewal refused clears the vault, the timer, a refused call renewing rather than trusting the clock, and deactivation ending the session when the vault fails.
- `license_gate_page_test.dart` — success, 401, 429, network failure, busy state, keyboard submit, the live-region semantics, deactivation, the restored state and **Back to the app**.
- `router_guard_test.dart` — each row of the table above, including setup outranking the gate.

## Verification

`npm test` (the `_shared` license and session suites), `flutter analyze lib test`, `dart format --set-exit-if-changed lib test integration_test`, `flutter test`, `npx tsc -b`. The owner-side gate (L11) is the real key on a real deployment: activate, restart offline, expire, revoke, and confirm `app.log` contains no key.

## Open questions

None blocking. Two worth the owner's attention: whether a deactivation should revoke its session row server-side (today it expires), and whether `verify-password` / `verify-security-questions` stay deployed now that the desktop no longer uses them.
