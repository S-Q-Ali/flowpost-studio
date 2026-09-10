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
- [ ] 5. R1: `_shared/google-drive.ts`; refactor both functions to use it.
- [ ] 6. R2: fix `last_triggered_at` ordering in process-workflow.
- [ ] 7. Commit (per git-workflow): auth helper as one commit, wiring as another.

## Verified
- `npx vitest run` → 3 files, 39 tests pass. `npx tsc --noEmit` → clean.
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