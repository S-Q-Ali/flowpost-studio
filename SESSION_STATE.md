# FlowPost Studio — Session State (2026-07-04)

## Current HEAD: `a221822`

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
- **Post-story polling** replaced blind 15s wait + retry with status polling
- **Auth race condition fixed** — `setPendingSecurityVerification(false)` + `.catch()` in AuthContext

## This Session (2026-07-04) — Commits: `627c7e9` → `a221822`

### Changes made
- **Migration `20260704000000_add_post_type.sql`** — adds `post_type TEXT NOT NULL DEFAULT 'feed' CHECK (post_type IN ('feed', 'story'))` to `posts` table; applied
- **`post-story/index.ts`** — accepts optional `postId`; retry path does DB lookup (video URL + access token) when raw fields absent; writes `published`/`failed` status to `posts` via `postId`; IG polling increased from 15→20 attempts (75s→100s)
- **`process-workflow/index.ts`** — before firing `post-story` for Instagram stories, inserts a story `posts` row (`post_type='story'`, `status='publishing'`) and passes `postId` in the request body
- **`process-scheduled-posts/index.ts`** — selects `post_type`; dispatches IG story posts (`post_type='story'` + `platform='instagram'`) to `post-story` instead of `instagram-upload`
- **`src/pages/QueuePage.tsx`** — retry button (RotateCw icon) on failed IG posts; resets status to `'scheduled'` + `now+1min`; Select All / Select 20 / Clear selection controls in all Queue tabs; auto-clear on tab switch; 24h guard (hides retry button if `uploaded_at > 24h`)
- **DB types regenerated** — `post_type` now in auto-generated types
- **3 edge functions deployed** — `post-story`, `process-workflow`, `process-scheduled-posts`
- **4 commits pushed** — `58cd751` (retry feature), `8e57750` (selection controls), `0ad03ae` (24h guard), `a221822` (session state update)

### Verified Duplications
- **`checkRateLimit()` + `recordFailedAttempt()`** — confirmed: 2 functions × 2 files, identical logic (only key prefix differs: `verify-password:` vs `verify-security-questions:`). `resetRateLimit()` exists only in `verify-password`. Constants `MAX_ATTEMPTS=5`, `LOCKOUT_DURATION_MINUTES=15` also duplicated. No `_shared/rate-limit.ts` exists.
- **`update-sheet-status` fetch block** — confirmed: 12 identical fetch blocks across 4 upload functions (insta:1, fb:3, yt:2, tt:6). Only variance is `status: "posted"` vs `"failed"`. 3 minor wrapping variants (own try/catch, outer catch with log, outer catch silent).

### Migration
- `20260704000000_add_post_type.sql` — new, applied

---

## Next Steps
1. **Extract `_shared/rate-limit.ts`** — export `checkRateLimit(supabase, namespace, ip)`, `recordFailedAttempt(supabase, namespace, ip)`, `resetRateLimit(supabase, namespace, ip)` + `MAX_ATTEMPTS`, `LOCKOUT_DURATION_MINUTES`. Modify `verify-password` + `verify-security-questions` to import and use. Net: ~75 lines removed.
2. **Extract `_shared/sheet-status.ts`** — export `updateSheetStatus(supabaseUrl, serviceRoleKey, postId, status)`. Replace 12 duplicated fetch blocks across 4 upload functions. Net: ~95 lines removed.
3. **Phase 4 — Feature gaps**: encrypt OAuth tokens at rest, TikTok chunked upload for large files, YouTube daily quota warning
4. **TikTok app review** — blocked on paid domain (Vercel Pro $20/mo + $12/yr domain)
5. **After TikTok approval** — switch TikTok `privacy_level` from `SELF_ONLY` to `PUBLIC_TO_EVERYONE`; add `'tiktok'` to `posts` platform CHECK
6. **Snapchat integration** — blocked by API allowlist; requires Snap approval

## Key Commands
```powershell
# Deploy all functions
foreach ($f in Get-ChildItem -Directory supabase/functions/*/index.ts | ForEach-Object { $_.Directory.Name }) { npx.cmd supabase functions deploy $f }

# Deploy specific functions
npx.cmd supabase functions deploy process-workflow update-sheet-status instagram-upload facebook-upload

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
