# FlowPost Studio — Session State (2026-07-03)

## Current HEAD: `fd272fa`

---

## What Works
- Auth flow (Google OAuth + email/password + security questions)
- All 17 edge functions deployed and functional
- TikTok integration (FILE_UPLOAD + DIRECT_POST)
- Instagram status polling instead of blind wait
- Scheduling (cron every 5min for 2 jobs)
- Image workflows (image_url/image_fb_ig_caption)
- R2 lifecycle auto-cleanup (1 day)

---

## Verified Audit: Phase 1 & 2 Remnants

### Env Vars — 14 Functions Still Use `SB_*` Reads
Everything works because SB_* secrets exist in Supabase dashboard, but this is inconsistent with the 3 verify functions that correctly use SUPABASE_*. Fix: sed + redeploy.

**Full `SB_*` (10):** cleanup-r2, facebook-upload, google-oauth, instagram-upload, post-story, process-scheduled-posts, process-workflow, tiktok-upload, update-sheet-status, youtube-upload

**Hybrid `SB_*` read + `SUPABASE_*` var (3):** facebook-auth, tiktok-auth, youtube-auth

**Both patterns:** get-upload-url

**Correct `SUPABASE_*`:** verify-password, verify-security-questions, verify-session

### config.toml
- project_id = "pgnwazhcmanzpaavvhun" → should be "ximorwzknbizpceaoflw"
- Only 6/17 functions listed (missing: process-workflow, process-scheduled-posts, verify-password, verify-session, verify-security-questions, update-sheet-status, cleanup-r2, post-story, etc.)

### Stale Directories
- supabase/functions/instagram-publish/ → empty dir, delete
- supabase/functions/cleanup-r2/ → full code, delete (R2 lifecycle handles cleanup)

### Migration
- 20260616000000_add_multi_user_rls.sql still on disk (Phase 2)
- 20260703000000_restore_backdoor_rls.sql exists (Phase 3 restore)
- ~80+ RLS policies total (backdoor + _own coexist)

### Clean
- _shared/constants.ts — gone
- PHASES.md — gone
- admin_sessions migration — gone
- No Phase references in frontend code
- AuthContext has both fixes (setPendingSecurityVerification(false) + .catch())
- Working tree is clean (no uncommitted changes)

---

## Next Steps (Priority)
1. Fix env vars in 14 functions (SB_* → SUPABASE_*)
2. Fix config.toml project_id
3. Add missing function sections to config.toml
4. Delete cleanup-r2/ and instagram-publish/
5. Decide on multi-user RLS migration retention
6. Redeploy all 17 edge functions
7. Push to GitHub → trigger Vercel auto-deploy

---

## Key Commands
```powershell
# Fix env vars in all 14 functions
$files = @(
  "cleanup-r2", "facebook-auth", "facebook-upload", "google-oauth",
  "instagram-upload", "post-story", "process-scheduled-posts",
  "process-workflow", "tiktok-auth", "tiktok-upload",
  "update-sheet-status", "youtube-auth", "youtube-upload", "get-upload-url"
)
foreach ($f in $files) {
  $path = "supabase/functions/$f/index.ts"
  if (Test-Path $path) {
    (Get-Content $path) -replace 'Deno\.env\.get\("SB_URL"\)', 'Deno.env.get("SUPABASE_URL")' -replace 'Deno\.env\.get\("SB_SERVICE_ROLE_KEY"\)', 'Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")' -replace 'Deno\.env\.get\("SB_ANON_KEY"\)', 'Deno.env.get("SUPABASE_ANON_KEY")' | Set-Content $path
  }
}

# Fix config.toml
# Edit project_id + add missing function sections

# Delete stale directories
Remove-Item -Recurse -Force supabase/functions/cleanup-r2
Remove-Item -Recurse -Force supabase/functions/instagram-publish

# Deploy all functions
foreach ($f in Get-ChildItem -Directory supabase/functions/*/index.ts | ForEach-Object { $_.Directory.Name }) { npx.cmd supabase functions deploy $f }

# Commit and push
git add -A
git commit -m "fix: normalize all edge functions to SUPABASE_* env vars, fix config.toml, cleanup stale dirs"
git push origin main
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
|---|---|---|---|
| 0d19e852-... | syedqasim963@gmail.com | true | fav_teacher: amna mushtaq, best_night_date: 2026-01-03 |
| 00000000-... | admin@flowpost.local | false | fav_teacher: amna mushtaq, best_night_date: 2026-01-03 |
| ca417e70-... | qasimvamatters@gmail.com | false | (no questions) |
| f485999c-... | testuser@flowpost.app | false | (no questions) |
