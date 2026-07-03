# FlowPost Studio — Session State (2026-07-03)

## Current HEAD: `627c7e9`

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

## This Session (2026-07-04) — Commits: a7cb412 → 627c7e9

### Changes made
- **README.md** — removed stale refs to `cleanup-r2/` and `instagram-publish/`
- **DB types regenerated** — `supabase gen types typescript --linked`; now includes `scheduling_mode`, `custom_schedule`, `media_type`, `users` table, `sessions`, `rate_limits`, etc.
- **`connected_accounts_public` view dropped** — security definer view exposing OAuth tokens to anon; migration `20260703010000_drop_connected_accounts_public_view.sql` created
- **`FALLBACK_USER_ID` removed** from `youtube-auth`, `facebook-auth`, `tiktok-auth`, `process-workflow` — returns 400 instead of falling back to zero-UUID; all 4 redeployed
- **Backdoor user `00000000-...` deleted** from `public.users` — no data rows reference it
- **`_shared/` code extracted**:
  - `_shared/google-jwt.ts` — `getGoogleAccessToken()` extracted from `process-workflow` + `update-sheet-status` (~70 lines × 2 → 1 shared file)
  - `_shared/drive-to-r2.ts` — `uploadDriveMediaToR2()` extracted from `instagram-upload` + `facebook-upload` (~60 lines × 2 → 1 shared file)
- **Dead code removed** (zero callers): `GetUploadUrlResponse` in process-workflow, `SUPABASE_ANON_KEY` in youtube-upload, `TIKTOK_CLIENT_KEY` in tiktok-upload, `uploadDriveVideoToR2()` wrappers in instagram-upload + facebook-upload
- **6 functions deployed** (process-workflow, update-sheet-status, instagram-upload, facebook-upload, youtube-upload, tiktok-upload) — all respond HTTP 401 (alive, module imports resolved)
- **4 commits pushed** to `origin/main`

### Outstanding from this session
- `checkRateLimit()` + `recordFailedAttempt()` still duplicated in `verify-password` + `verify-security-questions` (~40 lines)
- `update-sheet-status` fetch call duplicated ~12 times across 4 upload functions

### Migration
- 20260616000000_add_multi_user_rls.sql on disk — harmless, kept for reference
- 20260703000000_restore_backdoor_rls.sql on disk — applied
- ~80+ RLS policies total (backdoor + _own coexist; _own are redundant but harmless)
- 20260703010000_drop_connected_accounts_public_view.sql — new

### Clean
- _shared/constants.ts — gone
- PHASES.md — gone
- admin_sessions migration — gone
- No Phase references in frontend code
- AuthContext has both fixes (setPendingSecurityVerification(false) + .catch())
- Working tree is clean (no uncommitted changes)

---

## Next Steps
1. **Extract `checkRateLimit()` + `recordFailedAttempt()`** to `_shared/rate-limit.ts` — duplicated in verify-password + verify-security-questions
2. **Extract `update-sheet-status` fetch block** — duplicated ~12 times across 4 upload functions
3. **Phase 4 — Feature gaps**: encrypt OAuth tokens at rest, TikTok chunked upload for large files, retry UI for failed posts, YouTube daily quota warning
4. **TikTok app review** — blocked on paid domain (Vercel Pro $20/mo + $12/yr domain)
5. **After TikTok approval** — switch `privacy_level` from `SELF_ONLY` to `PUBLIC_TO_EVERYONE`
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
