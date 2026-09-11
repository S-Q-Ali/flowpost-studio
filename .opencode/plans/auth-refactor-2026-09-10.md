# Unified Edge-Function Auth Helper — Implementation Plan (2026-09-10)

Sources: `test-coverage-2026-09-10.md` (test-engineer) + code-review of process-workflow / generate-ai-captions / WorkflowsPage (code-reviewer, verdict REQUEST CHANGES).

## Goal
Replace per-function auth with a single testable helper `supabase/functions/_shared/auth.ts`, and close the highest-severity findings (C1-C3) on `generate-ai-captions`.

## Design (from test-engineer, Critical #1)
Write `_shared/auth.ts` as a **pure decision core + thin Deno.serve wiring**:

```
isRequestAuthorized({
  authorization,        // raw Authorization header value
  adminToken,           // x-admin-token header value
  envKeys,              // { serviceRoleKey, cronApiKey, ... } read at call time
  sessionLookup,        // injected async fn: (plainToken) => { valid, expired, user } | throws
}) → { allowed: true } | { allowed: false, reason: "missing" | "anon-key" | "invalid-session" | "invalid-credentials" | "query-error" }
```

Rules:
- NO `npm:` imports or top-level `Deno.*` in the core (read env inside the call, like `crypto.ts`). Thin wrapper module reads `Deno.env` + supabase client and calls the core.
- Preserve the known-good `process-workflow/index.ts:75-97` behavior: service/cron key OR `x-admin-token` → sessions table lookup with expiry check.
- Fails closed: sessions-query error → deny, expired session → deny, anon key → deny.
- Vitest: extend `include` with `"supabase/functions/_shared/**/*.test.ts"`; `crypto.ts` tests need `globalThis.Deno` stub + `// @vitest-environment node`.

## Findings consolidated (priority order for THIS refactor)
| # | Source | Severity | Action in this refactor |
|---|---|---|---|
| P0 | C1 | Critical | `generate-ai-captions` `isAuthorized` (L34-39) accepts `SUPABASE_ANON_KEY` (public) → remove; route through unified helper (sessions validation) |
| P0 | C2 | Critical | `groq-chat` proxy (L259-285): model whitelist (`openai/gpt-oss-120b`, `qwen/qwen3.6-27b`), `max_tokens` cap (<=8192), rate limit via `_shared/rate-limit.ts` |
| P1 | C3 | Critical | `get-file-token` (L322) returns raw Drive token → short-lived encrypted wrapper (pattern: process-workflow L1022-1043). Follow-up after auth helper lands |
| P1 | R1 | Required | `getDriveToken` duplicated (process-workflow L169-219, generate-ai-captions L164-199) → `_shared/google-drive.ts` |
| P1 | R2 | Required | `process-workflow` L388-401: move `last_triggered_at` update to after successful processing |
| P1 | — | Security | Spread unified auth helper to generate-ai-captions, get-file, post-story, all upload functions (only process-workflow currently validates sessions) |
| P2 | R3/R4/R5 | Arch | Split generate-ai-captions (3 functions), decompose process-workflow, decompose WorkflowsPage (defer — separate PRs, tracked in tests plan R4/R5 is out of scope) |
| P3 | R7/O1/O2 | Testing | scheduling hash parity test, parseList/normalizePlatform tests, PLATFORM_ALLOWED_KEYS dedupe |

## Execution order (THIS session)
- [x] 1. `_shared/auth.ts` pure core + test suite (21 tests green). Deny: no creds, anon key, unknown token, expired session, sessions-query error. Allow: valid service key, cron key, valid admin token.
- [x] 2. `vitest.config.ts` include extended (3 test files / 39 tests green). `auth.ts`/`groq.ts` importable by vitest — no Deno at import time.
- [x] 3. C1: `generate-ai-captions` wired to `isRequestAuthorized`; local `isAuthorized` + anon-key path removed.
- [x] 4. C2: `_shared/groq.ts` `sanitizeChatOptions` (12 tests green) wired into groq-chat — model whitelist (`openai/gpt-oss-120b`, `qwen/qwen3.6-27b`), max_tokens cap 8192.
- [x] 5. R1: `_shared/google-drive.ts` (15 tests green); refactored generate-ai-captions + process-workflow to use it (duplicate `getDriveToken`/`getDriveAccount` removed).
- [x] 6. R2: `last_triggered_at` update moved to after successful row processing in process-workflow (recorded only when `workflowVideoCount > 0`).
- [x] 7. Commit + push (R1+R2 as `refactor: extract shared Google Drive token helper...`, graph refresh as `chore`). `6b81771`, `9176b55` on `main`.
- [x] 8. Phase 4: `createRequestAuthorizer` added to `_shared/auth.ts` (6 tests, suite 60/60). Wired into youtube/facebook/instagram/tiktok/linkedin-upload + post-story — anon-key acceptance removed, browser calls now use `Authorization: Bearer flowpost_token` (session). `UploadPage.tsx` updated to send session token instead of anon key.
  - Rationale: `get-file` left on capability-token auth (encrypted `?token=` — served to `<video>`/`<img>`/redirects where headers are unavailable); `post-story` rewired to helper (was service-key-only, browser stories needed session path). OAuth auth-callback functions (google-oauth, youtube-auth, etc.) still accept anon — separate follow-up (callbacks carry no headers).
- [x] 9. Deploy Phase 4 functions + verify remote versions.

## Live verification findings (2026-09-10)
- Deployed source confirmed new via `supabase functions download`.
- **Misconfig found & fixed**: the `FRONTEND_API_KEY` secret was literally the legacy anon JWT (sha256 matched `791850…`) — so Phase 4's anon-key rejection was defeated via the `frontend-api-key` allow path. Rotated `FRONTEND_API_KEY` to a fresh random secret; no frontend/client consumes that key (verified by grep — only `generate-ai-captions` reads it, and its browser caller uses session tokens).
- `supabase/functions/youtube-upload/index.ts` had an undeclared `SUPABASE_ANON_KEY` reference (module ReferenceError → all requests 500). Added the `const`.
- Live smoke (after rotate+redeploy): all 6 → no-auth=401, anon=401, random=401; positive path verified (valid frontend key → reaches DB / 404 "Post not found").
- Note: project env `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY` hashes differ from the legacy keys returned by `supabase projects api-keys` (legacy service JWT no longer accepted by functions) — internal service-role callers (process-workflow etc.) read env at runtime and are unaffected.

## Verified
- Current suite: 4 files, 54 tests pass. `npx tsc --noEmit` → clean. Both rewired functions parse (esbuild transform OK). `graphify update .` run.
- R1 parity: refresh threshold (<5 min), refresh URL + service-role header, fallback-to-existing, null on missing account/token — all preserved via held-out tests.
- Key finding while wiring: `supabase.functions.invoke` sends ONLY invoke-level headers (FunctionsClient.js:126 → client headers empty in this repo). So `generate-ai-captions` accent legit calls receive `Authorization: Bearer flowpost_token` + NO apikey — meaning the anon-key branch was the only thing ever authorizing them (C1) and, with anon removed, the session token is now what's actually validated. Frontend `captions.ts` needs no change.
- No Deno CLI on this machine; `deno check` unavailable (consistent with tsc excluding `supabase/`).

## Out of scope (deferred)
- R3/R4/R5 decompositions (documented, not in this pass).
- C3 encrypted Drive-token wrapper (needs decide: acceptable risk after C1 fixed; raise when C1 lands).
- Migrating get-file / post-story / upload functions (P1 — separate pass).

## Verification
- `npx vitest run` — new auth suite green; alter no existing behavior.
- `npx tsc --noEmit` — clean.
- Manual: existing flows still auth (service-key cron, admin x-admin-token, user flowpost_token).

## Phase 4B (anon-key elimination across remaining 11 functions + payment) — 2026-09-11
Decisions locked: OAuth callbacks stay open (state hardening in-band via `oauth_states`); localStorage `flowpost_token` accepted + XSS-hardening same phase; `youtube-auth` stays service-only (out of scope).

### Slice A — session-token invoke wrapper (browser)
- [x] `src/lib/invoke.ts`: `getSessionToken()`, `invokeFunction<T>()` (POST, `Authorization: Bearer <flowpost_token>`, no anon apikey, FormData/string passthrough, `signal`, query-string refs), `InvokeFunctionError`.
- [x] 17 wrapper tests (suite 60 → 77). Migrated 11 callers (`AccountsPage`, `UploadPage`, `StoragePage`, `WorkflowsPage`, `WorkflowItemsPage`, `ToolsPage`, `InsightsPage`, `captions.ts`, `driveToMegaTransfer`). Left: AuthContext/SecurityQuestionsGate/ProfilePage verify-session calls (out of scope).
- [x] `npx tsc --noEmit` clean, `npm run build` green. Commits `2226c0f` (refactor) + `eb68744` (graphify) pushed → Vercel auto-deploy.

### Slice B — belt 5 non-OAuth functions + C3 ownership
- [x] `auth.ts` extended: `createSessionLookup` selects `user_id`; `SessionLookupResult`/`AuthResult` carry `userId` (2 RED tests → green; suite 77 → 79).
- [x] `get-quota-usage` user-scoped count; `fetch-facebook-insights`, `fetch-instagram-insights`, `transfer-ticket`, `drive-to-mega` authorizer-wired + `user_id` scoping (account queries bind to session owner).
- [x] Commit `4362309` pushed. esbuild parse all 5 OK; suite 79/79 green.

### Slice C — OAuth state hardening + belt 6 OAuth functions
- [x] C1: migration `20260910000000_oauth_states.sql` (service-role-only table, RLS enabled, `state` unique, `used_at`/`expires_at`); applied + recorded via Management API SQL endpoint (no local DB creds).
- [x] C2: `_shared/oauth-state.ts` — server nonce (48-hex), `createOAuthState` (userId+mode bound), `consumeOAuthState` (atomic single-use via conditional UPDATE..SELECT). 8 tests green.
- [x] C3: coded + deployed all 11 functions:
  - facebook-auth: `state=userId:mode` (forgeable) → opaque nonce; url action authorized.
  - google-drive-auth: `url` was open → now authorized; state nonce; per-action session-owner checks on refresh/quota/list/create-folder/get-token/r2/delete.
  - linkedin-auth, tiktok-auth (unified off legacy `tiktok_oauth_states`), instagram-auth (had **no gate at all** — added authorizer + state), mega-auth (belt + owner-bound connect + scoped account ops).
  - `resolveSessionOwner(auth, requestedUserId)` helper (5 tests) — cross-user url/connect attempts denied 401.
- [x] Suite 79 → 92; esbuild parse all 11 OK. Commits `087e3b0` + `aa9b24d`. Deployed all 11 (`--no-verify-jwt`).
- [x] Live smoke: no-auth/anon bearer/anon apikey → 401; real session row → 200 + user-scoped quota; cross-user url → 401; forged/legacy state callback → 400. Smoke session + states cleaned up.

### Slice D — XSS hardening (localStorage risk)
- Pending: externalize inline theme script (`index.html` → `public/theme.js`); add CSP + security headers via `vercel.json` (script-src 'self', connect-src incl. `*.supabase.co`, Google Fonts; frame-ancestors; X-Content-Type-Options; Referrer-Policy; Permissions-Policy).