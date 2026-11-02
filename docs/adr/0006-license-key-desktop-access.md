# ADR 0006: A license key, checked on the server, opens the desktop app

**Status:** Accepted (2026-11-03)
**Module:** `license` (and the desktop's access path in `shell`, `settings`, `posts-api`)
**Deciders:** project owner
**Supersedes:** ADR 0001 for the desktop client — sign-in, Google OAuth and the security-question gate no longer stand in front of the Windows app

## Context

The repository is public under MIT, and the product is the owner's hosted backend: publishing to five platforms, Groq captions, Cloudflare R2, and the OAuth grants the owner paid to obtain. Anyone can build the client from source; only the owner's servers do anything useful, and those servers are what a stranger would actually consume.

The first design put an account system in front of the desktop — Supabase Auth with Google sign-in, plus the admin security-questions gate, both built (plan I1–I11) and shipped in the tree. The owner replaced that decision on 2026-10-31: a user should be let in with a key the owner hands out, with no sign-up, no password and no third-party identity. A personal-use tool does not need an account system to decide who may use it.

Two facts shape the design. The client is open source, so anything it checks for itself can be patched out. And the functions already accept a bearer token stored in `public.sessions` — the minted token every edge call validates through `_shared/auth.ts` — so a gate that produces one of those tokens needs no change to any other function.

## Decision

Unlock the desktop with a license key verified **server-side**, which mints the session the rest of the system already accepts.

**At rest.** `public.licenses` holds `key_hash`, `label`, `active`, `expires_at`, `created_at`, `last_used_at` and an optional `user_id`. `key_hash` is lowercase `HMAC-SHA-256(LICENSE_PEPPER, key)` — the plaintext key never reaches the database. The table has RLS enabled with **no** policies, so only the service role inside `verify-license` can read it; a signed-in dashboard user cannot even list the key names.

**At activation.** `verify-license` (`verify_jwt = false`, since a locked user has no token yet) refuses to answer at all when `LICENSE_PEPPER` is unset or shorter than 16 characters — every stored digest was made with it, so any comparison would be a guess and any answer a false negative. It then counts the attempt in two fixed windows (`consume_rate_limit`, one atomic SQL statement): per caller IP and per key hash, ten each per fifteen minutes, and a store that errors counts as a refusal. A trimmed key of 16–256 characters is hashed and looked up by equality; a row that exists, is `active`, and has no past (or unparseable) expiry is good. Everything else answers **401** with one sentence that does not say which.

**The grant.** A good key mints the same 7-day `sessions` row the security-question gate used to mint, for `licenses.user_id` when the key has an owner and the admin user otherwise. `createSession` deletes that user's older sessions first, so one user has one live session. `last_used_at` is stamped and the client stores `{token, expiresAt, key}` in Windows Credential Manager. The key is stored beside the token so an expired session renews itself without asking the user again.

**Offline.** The stored expiry, not the network, decides whether the app opens. An unexpired grant opens the app with no call at all, marked "offline"; the moment the expiry timer fires, or any posts call is refused, the app drops the token, clears the reads that depended on it, and offers the stored key again. Only a key the server will not take sends the user back to `/license`.

**Issuance.** There is no admin UI or function. The owner makes a key locally, hashes it with the pepper, and inserts the digest — the runbook carries the commands.

## Consequences

- The server check is the boundary, not the client. A patched binary that skips `/license` still has to present a session token to `posts-api` and every privileged function, so it gets 401s instead of the owner's backend.
- `LICENSE_PEPPER` joins `TOKEN_ENCRYPTION_KEY` as a set-once secret. Changing it invalidates every key issued, because the digests cannot be reproduced and there is no rewrap. The runbook says so next to the rotation rules.
- A revoked key stops the next activation immediately, but a session already minted lives until its expiry unless the owner deletes the `sessions` row — revocation for cause is two statements, documented in the runbook.
- One live session per user means a key used on two machines at the same time makes them fight: the later activation invalidates the earlier token, and the machine that lost renews with its stored key, which knocks out the other. Issuing one key per person (set `user_id`) is how more than one person works at once.
- Deactivating a PC forgets the key and wipes the local caches, but does not revoke the session it minted. Nothing on the server knows the PC is gone.
- The desktop holds no Supabase Auth session, so posts and accounts reach the backend through `posts-api`, which derives ownership from the session row (ADR-0005 custody model unchanged). The identity module is deleted; the web dashboard keeps its own Supabase login, and `verify-security-questions` / `verify-password` stay deployed for that admin gate even though the desktop no longer calls them.
- Revocation is manual and the owner is the only issuer. That is the intended shape for a tool used by a handful of people; a real user base would need a provisioning flow, which is deliberately not built here.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Keep the account system (ADR 0001) for the desktop | Built and tested, then replaced by the owner: sign-up is closed, so it only ever moved the same small set of people, with a browser round-trip and a password to remember. |
| Check the key in the client | The source is public; one patched build reaches every owner key. A client check is a UX convenience, never a control. |
| Plain SHA-256 of the key | What the first cut did, and the 2026-11-01 audit's finding: a database dump alone lets anyone test guessed keys offline forever. |
| bcrypt/scrypt/argon2 per key, or a per-row salt | Both destroy the equality lookup — a salted or cost-hashed value cannot be found by `key_hash`, and `licenses.key_hash` is a UNIQUE index the whole flow depends on. A peppered HMAC keeps determinism while moving guessing off the dump. |
| Supabase Auth with a custom identity provider | Puts GoTrue, a user table and a session refresh in the desktop path again for something a `sessions` row already does. |
| An admin function or UI that issues keys | Nothing in the app needs to issue a key, and an issuer endpoint is one more attack surface holding the pepper. SQL the owner already knows how to run does the job. |
