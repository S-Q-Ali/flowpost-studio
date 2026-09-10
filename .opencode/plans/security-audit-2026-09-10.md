# Security Audit — FlowPost Studio (2026-09-10)

Auditor: `security-auditor` agent, OWASP Top 10 + STRIDE lens, graphify-backed.

## Summary
- **Critical:** 2 · **High:** 4 · **Medium:** 4 · **Low:** 3 · **Info:** 3

## Prior-finding status
- **F2 anon-key bypass — VERIFIED & EXPANDED** (now worse than first reported): `verify_jwt=false` for all 27 functions; anon key (public, in browser bundle) accepted by 15+ functions.
- **F4 localStorage token — VERIFIED** (`AuthContext.tsx:12-24`, `SecurityQuestionsGate.tsx:31-37`).
- **generate-ai-captions mismatch — MODIFIED**: not a 401; supabase-js auto-injects `apikey` header (anon key) which passes `isAuthorized`. Bearer admin token = meaningless window dressing.
- **process-workflow pattern — CONFIRMED** as the reference (service/cron key OR x-admin-token → sessions).

## Findings

### CRITICAL
- **F1** `config.toml:3-79` + auth blocks — anon key authenticates 15+ functions (all OAuth/upload/transfer/insights/captions). Full admin actions: post as owner, read/write connected OAuth tokens, transfer Drive→Mega, delete Drive files, burn GROQ credits. PoC: `curl -H "Authorization: Bearer <anon-key>"`. Fix: remove anon from all `validKeys`; standardize on process-workflow pattern; `verify_jwt=true` for client-invoked functions, `false` only for OAuth callbacks.
- **F5** `zinc-bucksaw-489020-n0-d456522f61c7.json` — GCP SA private key on disk (gitignored, never committed, but unencrypted on disk). Fix: rotate key, delete file, move to edge-function secrets.

### HIGH
- **F3** localStorage admin token — XSS/exfiltration → full admin. Fix: httpOnly Secure SameSite cookie, shorter TTL, rotation, CSP.
- **F6** `generate-ai-captions:226-285` — open GROQ proxy (`groq-chat`/`groq-transcribe`, arbitrary model/messages/max_tokens), anon-authed, no budget/ratelimit → cost abuse (LLM10). Fix: remove/open-proxy or model allowlist + max_tokens cap + ratelimit.
- **F7** `get-file/index.ts:21-176`;y no auth, replayable encrypted token proxy for Drive/Mega. Add auth + single-use + caller-ownership.
- **F8** `verify-session/index.ts:22-60` — no auth, token-validation oracle, leaks user_id. Add ratelimit/auth; prefer Supabase built-in.

### MEDIUM
- **F9** RLS backdoor `user_id='00000000-...'` on connected_accounts/workflows/videos/posts + `users_select FOR SELECT USING (true)` (`20260508000000_...sql:69-176`, `20260703000000_restore_backdoor_rls.sql`). Any authenticated user reads/writes admin data + enumerates users.
- **F10** `instagram-auth:87-232` — no auth check for non-callback actions; attacker can bind own IG to victim userId.
- **F11** No CSP/HSTS/X-Frame-Options on Vercel (vercel.json) — amplifies F3.
- **F12** Weak security questions (low-entropy, case-insensitive, IP-only ratelimit bypassable).
- **F13** CORS: no startup assertion that `ALLOWED_ORIGIN` is set; misconfig nullifies restriction.

### LOW
- **F14** OAuth `state` carries userId, not signed/verified server-side (except **tiktok-auth — correct**, lines 155-184; replicate everywhere).
- **F15** Raw third-party error bodies returned to callers (`JSON.stringify(jsonRes)`).
- **F16** `_shared/crypto.ts:41-43` — `decrypt()` returns ciphertext on failure instead of null.

## Positive observations
AES-GCM token encryption at rest; ratelimit+lockout on password/security-questions; process-workflow multipath auth; process-scheduled-posts/post-story/update-sheet-status restricted to service-role; tiktok state verification; get-file 15-min exp; workflow_items RLS correct; no secrets in committed code; URL allowlists in upload functions.

## Prioritized fix order
1. Remove anon key from all `validKeys` (single highest-impact).
2. Rotate + delete GCP SA key.
3. localStorage → httpOnly cookie + CSP; fix RLS backdoor.
4. OAuth state verification (tiktok pattern), ratelimit get-file/verify-session, close groq proxy, instagram-auth check.
5. Backlog: TOTP MFA, session rotation, single-use get-file tokens, generic errors, decrypt-null.