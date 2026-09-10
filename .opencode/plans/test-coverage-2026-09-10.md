# Test Coverage Analysis — FlowPost Studio (2026-09-10)

Auditor: `test-engineer` agent, Vitest conventions, ties to audit findings.

## Current Coverage
- **1 file / 6 tests**: `src/lib/utils.test.ts` (all `cn()` merger). `npm test` → 1 file, 6 pass (~28s cold).
- Conventions: explicit `import { describe, it, expect } from "vitest"`, plain-English `it`, AAA, no shared state.
- Runner (`vitest.config.ts`): `environment: jsdom`, `globals: true`, setup `src/test/setup.ts`, include = `src/**/*.{test,spec}.{ts,tsx}` → **supabase/functions/ invisible to runner**.
- Edge Functions: 26 functions, **ZERO tests**. All `verify_jwt = false`.

## Discrepancy corrections (vs earlier brief)
- File is `src/lib/driveToMegaTransfer.ts` (not `driverToMegaTransfer.ts`).
- `formatBytes` does not exist; pure parts = percent clamping (L180) + size parseInt (L59).
- `sheet-status.ts` is an unused fetch wrapper. `getColumnLetter` is module-private in `update-sheet-status/index.ts:26-33`; status mapping at L58/L96. **Extract to `_shared/sheet-status.ts` as exported pure functions, then test.**
- `scheduling.ts`: `simpleHash`, `computeTargetsForDay`, `formatTime`, `getDayLabel` module-private; only `getItemPublishTime`/`getNextPublishTime` exported → export for testability.
- `captions.ts`: pure helpers not exported; `groqGenerateCaptions`/`regenerateCaptions` testable via `vi.mock` of `supabase.functions.invoke`.

## Key structural recommendation (critical)
Write `_shared/auth.ts` as **pure decision core + thin Deno.serve wiring**. Core signature: `{ authorization, adminToken, envKeys, sessionLookup } → AuthResult`. No `npm:`/top-level `Deno.*` (read env inside call, like crypto.ts). Then extend vitest `include` with `"supabase/functions/_shared/**/*.test.ts"`; pure modules compile under Vite; `crypto.ts` needs `globalThis.Deno` stub + `// @vitest-environment node`. Do NOT introduce Deno CLI just for this file.

## Priority
- **Critical**
  1. `_shared/auth.ts` suite — F1/F2 gate: rejects anon as Bearer, rejects missing Authorization when CRON_API_KEY unset, fails closed on sessions-query error, expired session rejected, integrity of process-workflow pattern.
  2. `crypto.ts` decrypt→null regression (F16) — round-trip, tampered ciphertext, bad tag, short IV, wrong key, non-base64.
- **High**
  3. `rate-limit.ts` — lockout/expiry/reset semantics; explicit decision-locking test for the fail-open path.
  4. `verify-password`/`verify-security-questions` session creation — delete-then-insert rotation, 7-day expiry, UUID token.
  5. `scheduling.ts` — deterministic targets, window bounds, inverted range, day labels, formatTime.
  6. `captions.ts` — platform allowlist stripping, code-fence removal, invalid-JSON fallback, progress emission.
- **Medium**
  7. `getColumnLetter` + status mapping (extract first) — 0→A…702→AAA, negative→"".
  8. `driveToMegaTransfer` percent clamp 99 / NaN guard on size 0.
  9. `verify-session` oracle behavior (F8).
- **Low**
  10. Edge-function handler smoke tests (OPTIONS 200 / POST 401 / 405) post-auth-helper.
  11. `utils.test.ts` fine as-is.

## Commands
- Baseline: `npm test`
- TDD loop: `npm run test:watch`
- Single: `npx vitest run src/lib/scheduling.test.ts`
- Shared (after include extension): `npx vitest run supabase/functions/_shared`
- Coverage: needs `npm i -D @vitest/coverage-v8` (NOT installed — do not run without)