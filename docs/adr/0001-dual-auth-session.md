# ADR 0001: Supabase Auth plus the existing admin session

**Status:** Proposed (2026-10-28)
**Module:** `identity`
**Deciders:** project owner

## Context

The native Windows client needs two different capabilities:

1. Read `public.users` and future tables through PostgREST with the signed-in user's identity and RLS.
2. Call the existing edge functions, whose shared auth helper accepts a bearer token found in the `sessions` table (the web app's `flowpost_token`), not a Supabase JWT.

The web app already combines Supabase Auth (email/password, Google) with the admin security-questions gate that mints the `sessions` token. Replacing either half would mean rewriting edge-function auth or adding a backend service, both outside the MVP boundary.

## Decision

Use both credentials, matching the web app:

- **Supabase Auth session** for PostgREST/RLS. The access token is used as issued; the client does not refresh it, so an expired token means signing in again.
- **Existing `sessions` token** for edge functions, obtained from `verify-security-questions` after the admin answers the gate. Sent as `Authorization: Bearer <token>`, matching `src/lib/invoke.ts`.

Both live in memory only (`SessionController`): nothing is written to disk, so a restart starts at sign-in. The client never sees a service-role key. No edge-function contract changes are required.

## Consequences

- The native app can use the existing backend and RLS without a deploy.
- The admin must pass the security-questions gate before edge-function actions; the tokens are not persisted, so every start begins at the gate.
- Two tokens must be cleared on logout and invalidated independently.
- The `sessions` token is a 7-day bearer token with no server-side revoke endpoint; v1 accepts that window.
- `verify-security-questions` deletes all sessions when it mints a new one, so only the newest client keeps edge-function access.
- `google-oauth` mints a session only for a row that already exists in `public.users` (signups are closed), redirects to a same-origin path only, and hands the token over in the URL fragment.
- The function currently lacks caller authentication; hardening it with a Supabase JWT check is a separate, deploy-gated task (see `SPEC-identity.md`).

## Alternatives considered

| Alternative | Why not |
|---|---|
| Supabase JWT only, rewrite edge functions | Requires changing every function and a backend deploy; outside MVP. |
| Custom `sessions` token only | No RLS/PostgREST identity; would need a new backend or service-role client. |
| New auth service (Auth0, Clerk, etc.) | New dependency, new user migration, no Windows advantage. |
| Store tokens in SQLite or `shared_preferences` | Not OS-protected; fails the identity boundary. |
