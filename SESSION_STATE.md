# FlowPost Studio — Session State (2026-07-03)

## Current HEAD: `a7cb412`

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
1. **Phase 3 — Cleanup**: regenerate DB types, extract shared JWT signing code, remove stale env var fallbacks in `get-upload-url`
2. **Phase 4 — Feature gaps**: encrypt OAuth tokens at rest, TikTok chunked upload for large files, retry UI for failed posts, YouTube daily quota warning
3. **TikTok app review** — resubmit with test account credentials; blocked on paid domain (Vercel Pro $20/mo + $12/yr domain)
4. **After TikTok approval** — switch `privacy_level` from `SELF_ONLY` to `PUBLIC_TO_EVERYONE`
5. **Snapchat integration** — blocked by API allowlist; requires Snap approval

## Key Commands
```powershell
# Deploy all functions
foreach ($f in Get-ChildItem -Directory supabase/functions/*/index.ts | ForEach-Object { $_.Directory.Name }) { npx.cmd supabase functions deploy $f }

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

### Cleanup Notes
- **`00000000-...` backdoor user deleted** — `FALLBACK_USER_ID` removed from 4 edge functions (youtube-auth, facebook-auth, tiktok-auth, process-workflow); functions redeployed; zero-UUID user dropped from `public.users`
