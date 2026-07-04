# FlowPost Studio — Session State (2026-07-04)

## Current HEAD: `bd24b71`

---

## What Works
- Auth flow (Google OAuth + email/password + security questions)
- All 16 edge functions deployed and functional
- TikTok integration (FILE_UPLOAD + DIRECT_POST)
- Instagram status polling instead of blind wait
- Scheduling (cron every 5min for 2 jobs)
- Image workflows (image_url/image_fb_ig_caption)
- R2 lifecycle auto-cleanup (1 day)

---

## Cleanup Status — All Phase 1 & 2 Remnants Resolved

- **Env vars** — 14 functions normalized from `SB_*` to `SUPABASE_*`; `SB_*` secrets deleted from dashboard
- **config.toml** — project_id fixed to `ximorwzknbizpceaoflw`; all 16 functions listed with `verify_jwt = false`
- **Stale dirs** — `cleanup-r2/` and `instagram-publish/` deleted
- **All 16 functions redeployed** — no Node.js deprecation warnings (supabase-js pinned to v2.49.0)
- **`connected_accounts_public` view dropped** — was a security definer view exposing OAuth tokens to `anon`, never used by any code
- **`SB_*` custom secrets deleted** — all functions use auto-injected `SUPABASE_*` secrets
- **Post-story polling** replaced blind 15s wait + retry with status polling (20×2s=40s)
- **Auth race condition fixed** — `setPendingSecurityVerification(false)` + `.catch()` in AuthContext
- **Code extraction** — `_shared/rate-limit.ts`, `_shared/sheet-status.ts`, `_shared/google-jwt.ts`, `_shared/drive-to-r2.ts` all active

## This Session (2026-07-04) — Commits: `627c7e9` → `f8cbe1d`

### Changes made
- **Migration `20260704000000_add_post_type.sql`** — adds `post_type` column to `posts`; applied
- **`post-story/index.ts`** — accepts `postId`; retry DB lookup; writes `published`/`failed` status; IG polling 15→20 attempts; poll interval 5s→2s (fix: 20×2s=40s fits within Supabase 60s timeout)
- **`process-workflow/index.ts`** — inserts story `posts` row (`post_type='story'`) before firing `post-story` with `postId`
- **`process-scheduled-posts/index.ts`** — dispatches IG story posts to `post-story` instead of `instagram-upload`
- **`src/pages/QueuePage.tsx`** — retry button on failed IG posts; Select All/20/Clear; 24h guard
- **`_shared/rate-limit.ts`** — NEW: exports `checkRateLimit(supabase, namespace, ip)`, `recordFailedAttempt()`, `resetRateLimit()`, `MAX_ATTEMPTS`, `LOCKOUT_DURATION_MINUTES`. Replaces 3 duplicated functions in `verify-password` + `verify-security-questions`. Net -48 lines.
- **`_shared/sheet-status.ts`** — NEW: exports `updateSheetStatus(supabaseUrl, serviceRoleKey, postId, status)`. Replaces 12 duplicated fetch blocks across 4 upload functions. Net -79 lines.
- **`verify-password/index.ts`** — removed local `checkRateLimit`, `recordFailedAttempt`, `resetRateLimit`, `MAX_ATTEMPTS`, `LOCKOUT_DURATION_MINUTES` → imported from `_shared/rate-limit.ts`
- **`verify-security-questions/index.ts`** — same extraction as verify-password
- **`instagram-upload/index.ts`** — 1 fetch block → `updateSheetStatus(...)` call
- **`facebook-upload/index.ts`** — 3 fetch blocks → `updateSheetStatus(...)` calls
- **`youtube-upload/index.ts`** — 2 fetch blocks → `updateSheetStatus(...)` calls
- **`tiktok-upload/index.ts`** — 6 fetch blocks → `updateSheetStatus(...)` calls
- **8 edge functions deployed** — `verify-password`, `verify-security-questions`, `instagram-upload`, `facebook-upload`, `youtube-upload`, `tiktok-upload`, plus previously deployed `post-story`, `process-workflow`, `process-scheduled-posts` from earlier this session
- **7 commits pushed** — `58cd751` (retry), `8e57750` (selection), `0ad03ae` (24h), `a221822` (session), `64376a5` (analysis), `6dbecb6` (extractions), `f8cbe1d` (2s poll fix)

### Duplications resolved
- ✅ `checkRateLimit()` + `recordFailedAttempt()` — extracted to `_shared/rate-limit.ts`, both files updated, deployed
- ✅ `update-sheet-status` — extracted to `_shared/sheet-status.ts`, all 4 upload files updated, deployed

### Migration
- `20260704000000_add_post_type.sql` — applied

---

## Next Steps
1. **Phase 4 — Feature gaps**: encrypt OAuth tokens at rest, TikTok chunked upload for large files, YouTube daily quota warning
2. **TikTok app review** — blocked on paid domain (Vercel Pro $20/mo + $12/yr domain)
3. **After TikTok approval** — switch TikTok `privacy_level` from `SELF_ONLY` to `PUBLIC_TO_EVERYONE`; add `'tiktok'` to `posts` platform CHECK
4. **Snapchat integration** — blocked by API allowlist; requires Snap approval

## Key Commands
```powershell
# Deploy all functions
foreach ($f in Get-ChildItem -Directory supabase/functions/*/index.ts | ForEach-Object { $_.Directory.Name }) { npx.cmd supabase functions deploy $f }

# Deploy specific functions
npx.cmd supabase functions deploy process-workflow update-sheet-status instagram-upload facebook-upload verify-password verify-security-questions post-story

# Smoke test a deployed function
curl.exe -X POST "https://<ref>.supabase.co/functions/v1/<function-name>" -H "Authorization: Bearer test" -H "Content-Type: application/json" -d "{}"

# Run SQL query against linked DB
npx.cmd supabase db query --linked "SELECT * FROM pg_views WHERE viewname LIKE '%public%';"

# Create new migration
npx.cmd supabase migration new <name>

# Apply local migrations (in local dev)
npx.cmd supabase db push

# Re-pull DB types
npx.cmd supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

---

## Key URLs
- App: https://flowpost-studio.vercel.app
- Supabase: https://supabase.com/dashboard/project/ximorwzknbizpceaoflw
- GitHub: https://github.com/S-Q-Ali/flowpost-studio
- Vercel: https://vercel.com/S-Q-Ali/flowpost-studio
- Supabase Project Ref: ximorwzknbizpceaoflw
- R2 Public URL: pub-1d4bcccec36046308147315db8637398.r2.dev

---

## Admin Users
| ID | Email | is_admin | Questions |
|---|---|---|---|---|
| 0d19e852-... | syedqasim963@gmail.com | true | fav_teacher: amna mushtaq, best_night_date: 2026-01-03 |
| ca417e70-... | qasimvamatters@gmail.com | false | (no questions) |
| f485999c-... | testuser@flowpost.app | false | (no questions) |
