# FlowPost Studio — Session State (2026-07-04)

## Current HEAD: `52cfea8` (+ BetaBadge indicator added to TikTok UI)

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

## Cleanup Status — All Phase 1 & 2 Remnants Resolved

- **Env vars** — 14 functions normalized from `SB_*` to `SUPABASE_*`; `SB_*` secrets deleted from dashboard
- **config.toml** — project_id fixed to `ximorwzknbizpceaoflw`; all 17 functions listed with `verify_jwt = false`
- **Stale dirs** — `cleanup-r2/` and `instagram-publish/` deleted
- **All 17 functions redeployed** — no Node.js deprecation warnings (supabase-js pinned to v2.49.0)
- **`connected_accounts_public` view dropped** — was a security definer view exposing OAuth tokens to `anon`, never used by any code
- **`SB_*` custom secrets deleted** — all functions use auto-injected `SUPABASE_*` secrets
- **Post-story polling** replaced blind 15s wait + retry with status polling (20×2s=40s)
- **Auth race condition fixed** — `setPendingSecurityVerification(false)` + `.catch()` in AuthContext
- **Code extraction** — `_shared/` has 5 modules: `rate-limit.ts`, `sheet-status.ts`, `google-jwt.ts`, `drive-to-r2.ts`, `crypto.ts`

## This Session (2026-07-04) — Commits: `627c7e9` → `52cfea8` (9 commits)

### Changes made
- **Migration `20260704000000_add_post_type.sql`** — adds `post_type` column to `posts`; applied
- **`post-story/index.ts`** — accepts `postId`; retry DB lookup; writes `published`/`failed` status; IG polling 20×2s=40s
- **`process-workflow/index.ts`** — inserts story `posts` row before firing `post-story`
- **`process-scheduled-posts/index.ts`** — dispatches IG story posts to `post-story`
- **`src/pages/QueuePage.tsx`** — retry button; Select All/20/Clear; 24h guard
- **`src/components/BetaBadge.tsx`** — amber "Beta" badge shown next to all TikTok UI labels in UploadPage, AccountsPage, WorkflowsPage
- **`_shared/rate-limit.ts`** — NEW: rate limiting for verify endpoints (-48 lines)
- **`_shared/sheet-status.ts`** — NEW: deduplicated sheet status update (-79 lines)
- **`_shared/crypto.ts`** — NEW: AES-GCM encrypt/decrypt via Deno `crypto.subtle`
- **`get-quota-usage/index.ts`** — NEW: daily YouTube quota tracker (1,600 units/upload, 10,000 limit)
- **Module extraction** — rate-limit, sheet-status, crypto extracted; 4 upload + 2 verify + all auth functions updated
- **Token encryption** — write paths (3 auth functions) encrypt; read paths (8 functions) decrypt; 38 existing tokens backfilled
- **Legal links added** — LoginPage footer, AppSidebar footer (Terms/Privacy icons), Terms↔Privacy cross-links
- **Quota warning** — UploadPage + AccountsPage show yellow/red badge when YouTube quota ≥50%/80%
- **Key** — `TOKEN_ENCRYPTION_KEY` set as Supabase secret
- **17 functions deployed** — +1 new (get-quota-usage), 9 redeployed for encryption

## Next Steps
1. **Add `'tiktok'` to `posts` platform CHECK** — constraint was already dropped from live DB; adding it back with `'tiktok'` would restore data integrity (optional cleanup)
2. **TikTok app review** — blocked on paid domain (Vercel Pro $20/mo + $12/yr domain)
3. **After TikTok approval** — switch TikTok `privacy_level` from `SELF_ONLY` to `PUBLIC_TO_EVERYONE`
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
