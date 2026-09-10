# FlowPost Studio — Full Audit Report

Date: 2026-09-10
Scope: Security, Code Quality, Performance, UI + Whop/Earn-readiness
Baseline: `npm run lint` FAIL (170 problems: 149 errors, 21 warnings) · `npx tsc --noEmit` PASS · tests PASS (6/6)

---

## 1. Security (severity: CRITICAL first)

| ID | Sev | Finding |
|----|-----|---------|
| F1 | INFO | Secrets handling correct — no service-role key / GCP key referenced in code; GCP key is gitignored. |
| F2 | **CRITICAL** | `verify_jwt = false` for ALL ~26 edge functions in `supabase/config.toml:4-79`. Functions are protected only by `Authorization: Bearer <static-key>` checks. If any function skips that check, it is fully open. Verify each function validates the custom session token; otherwise anyone can call endpoints with leaked anon key. |
| F3 | MEDIUM | `cleanup-r2` is scheduled in migration `20260508010000_cleanup_cron.sql` but the edge function does not exist — cron will 404 every run. |
| F4 | **CRITICAL** | Admin custom session token stored in `localStorage` (`src/contexts/AuthContext.tsx:10,14,20,22`). XSS ⇒ token theft ⇒ full control. Mitigate: HttpOnly cookie via edge function, or at least short expiry + cleanup. |
| F5+ | TRUNCATED | Further security findings from agent report (see audit session output). |

## 2. Code Quality

| ID | Sev | Finding |
|----|-----|---------|
| A1 | HIGH | Monolith pages: `WorkflowsPage.tsx` (1770), `WorkflowItemsPage.tsx` (1435), `AccountsPage.tsx` (1337), `UploadPage.tsx` (1314 lines). |
| A2 | HIGH | `supabase/functions/process-workflow/index.ts` = 1236 lines (single file, all platforms logic). |
| A3 | MEDIUM | CORS headers/helper duplicated across ~28 edge functions — should be shared (`_shared`) + central `config.toml` verification. |
| A4+ | TRUNCATED | Lint debt: 149 errors mostly `no-explicit-any`, `@ts-ignore`, `no-empty` in edge functions. |

## 3. Performance

| Item | Size | Note |
|------|------|------|
| `charts-*.js` (recharts) | 393 kB (gz 113) | Loaded on initial bundle |
| `ui-*.js` (radix/lucide/sonner) | 200 kB | Initial |
| `supabase-*.js` | 173 kB | Initial |
| `vendor-*.js` | 164 kB | Initial |
| `StoragePage-*.js` (megajs) | 264 kB | Lazy route — good |
| CSS | 64 kB (gz 11.6) | OK |

Initial JS bundle ~1 MB raw; recharts should be lazy-loaded on Routes that use it (most pages don't need it).

## 4. UI + Whop/Earn-readiness

| ID | Sev | Finding |
|----|-----|---------|
| U1 | HIGH | Two toast systems mounted: shadcn `Toaster` + `Sonner` (double toasts/noise). Pick one. |
| U2 | HIGH | No React Error Boundary anywhere `src/App.tsx:92-104` — a runtime crash unmounts the app. |
| U3 | MEDIUM | `PipelineLandingPage.tsx:512-517` uses inline `<style>` tag for typography instead of Tailwind tokens. |
| U4 | MEDIUM | `PipelineLandingPage.tsx:319-339` Step 4 card has hardcoded dark colors — theme inconsistent. |
| U5 | MEDIUM | No per-route document titles — bad for SEO/social share. |
| U6+ | TRUNCATED | Whop earnings-flow gap analysis partially delivered in audit session. |

---

## Recommended Fix Order

1. **Security:** turn on `verify_jwt` / verify token checks in every edge function (F2); move admin token out of `localStorage` or shorten expiry (F4); remove/rotate `zinc-*.json` GCP key from project root.
2. **Stability:** add React Error Boundary (U2); collapse to one toast system (U1).
3. **Perf:** lazy-load recharts (charts) off the initial bundle.
4. **Quality:** refactor 4 monolith pages + `process-workflow/index.ts`.
5. **Cleanup:** delete dead `cleanup-r2` cron or create the function (F3).

## Open Items
- Re-run of truncated findings (F5+/A4+/U6+) if full detail needed.
- Restart opencode so the 10 installed skills load (`.opencode/skills/`) for future scripted audits.