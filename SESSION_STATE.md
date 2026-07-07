# FlowPost Studio — Session State

## CURRENT HEAD: `042f66f` — Add per-workflow Drive account selection

---

## Problems & Solutions Log

### 1. Cron Functions Returning 401 (reserved secrets override)
**Symptom**: `process-workflow` and `process-scheduled-posts` returning 401 when triggered by cron jobs.
**Root cause**: `SUPABASE_SERVICE_ROLE_KEY` is a **reserved secret** — Supabase CLI auto-injects it but also allows setting it as a regular secret. The secret value overrides the auto-injected default with a **wrong value** for the project. Same for `SUPABASE_ANON_KEY`. CLI prevents deleting/updating these reserved secrets.
**Solution**: Created non-reserved secrets:
- `CRON_API_KEY` (`c395a586428b6f220ac21fa19a05bb824ee5aa4aa314799d71e82aaadf6e1573`) — used by cron-triggered functions. Cron jobs updated to use this key instead of the service role key. Jobs 26/27 deleted, jobs 28/29 created.
- `FRONTEND_API_KEY` — holds the correct anon key. Used by 6 frontend-called functions: `facebook-auth`, `youtube-upload`, `facebook-upload`, `instagram-upload`, `tiktok-upload`, `tiktok-auth`.
**Fix in code**: All functions accept `CRON_API_KEY` / `FRONTEND_API_KEY` as additional valid auth tokens alongside `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY`.

### 2. Staggered Posts Never Posted (missing Google token)
**Symptom**: Second video's posts in once_daily mode (with stagger) were always created as `"scheduled"` with future `scheduled_at`, but never posted.
**Root cause**: `process-workflow` generates a Google OAuth token, creates posts, and fires uploads with `{ postId, driveDownloadUrl, googleAccessToken }`. But staggered posts are created as `"scheduled"` and only `process-scheduled-posts` picks them up later — calling upload functions with ONLY `{ postId }`. No Google token → upload function can't access Drive URL → video never uploaded to R2 → platform API can't download the video → fails silently.
**Solution**: Removed stagger entirely (commit `b9643e3`). All posts now fire immediately with `status: "processing"`.

### 3. Instagram Uploads Stuck in "processing" Forever (timeout)
**Symptom**: Instagram posts get stuck in `"processing"` status — never transition to `"published"` or `"failed"`.
**Root cause**: `instagram-upload` uses 8×30s = 240s polling for Instagram container status. Supabase Edge Functions have a **60s default runtime timeout** (Pro plan). Deno kills the function during the polling phase, BEFORE the catch block can write `"failed"` status. The post stays in `"processing"` forever.
**Evidence**: Failed posts from R2 upload failures have `file_url` still pointing to Google Drive. Stuck posts have `file_url` in R2 (R2 upload completed) but Instagram flow never completed.
**Note**: Same class of bug was already fixed for `post-story` (commit `f8cbe1d` — reduced 5s→2s polling, 20×2s=40s fits within 60s). The reel/image flow in `instagram-upload` was never fixed.
**Status**: NOT YET FIXED. Still needs polling reduction.

### 4. Fire-and-forget Ignores Upload Failures
**Symptom**: Upload functions return errors but posts stay in `"processing"`.
**Root cause**: `process-workflow` uses `void fetch(...)` for all upload calls — the response is entirely ignored. If the upload function returns an error, nobody captures it.
**Solution**: None yet — same as #3 (needs fire-and-forget to be replaced with proper error handling).

### 5. "processing" Posts Never Retried
**Symptom**: Posts stuck in `"processing"` are abandoned forever.
**Root cause**: `process-scheduled-posts` only queries `status = "scheduled"` — never picks up `"processing"` posts.
**Solution**: None yet — needs a stale-processing cleanup query added to `process-scheduled-posts`.

### 6. Youtube Video Title Wrongfully in Instagram Caption
**Symptom**: Instagram posts showing "yt_video_title:" followed by the actual title instead of the intended caption.
**Root cause**: Caption fallback chain was reading from the wrong column or the sheet row had the wrong index.
**Solution**: Removed all caption fallback chains — each platform reads exactly one column. Instagram reads `fb_ig_caption` (for video) or `image_fb_ig_caption` (for images). Blank = empty string.

### 7. TikTok Upload Fails
**Symptom**: TikTok videos stuck in processing.
**Root cause**: Multiple issues resolved iteratively:
- Missing Drive→R2 upload step added
- `FILE_UPLOAD` + `DIRECT_POST` pattern implemented
- `SELF_ONLY` privacy level required for unaudited client
- TikTok refresh tokens rotated on each use
- OAuth flow fixed — removed `fetchUserInfo` call, uses `tokenData.open_id` directly
**Status**: Working.

### 8. Auth Race Conditions
**Symptom**: User gets stuck on loading screen during auth.
**Root cause**: `setPendingSecurityVerification(false)` called after an async operation that could throw — the setter never fired.
**Solution**: Added `.catch()` handler. Also added `sessionStorage` caching for auth state.

### 9. New Signups Possible
**Symptom**: Any Google user could sign up.
**Solution**: All new signups blocked — only existing `public.users` records can authenticate. Google OAuth callback checks `public.users` table and rejects unknown users with a toast error.

### 10. DB Cleanup Issues
- `cron.job_run_details`: 272 MB → 7.5 MB (purged old entries)
- `net._http_response`: 86 MB → 0 bytes (purged old entries)
- 12 unused npm packages uninstalled (173 transitive deps)
- 26 unused shadcn UI components deleted
- `supabase/.temp/` gitignored

### 11. Secret Management
- `GOOGLE_PRIVATE_KEY`: new key `zinc-bucksaw-489020-n0-d456522f61c7.json`, gitignored. `ALLOWED_ORIGIN` confirmed set.
- `TOKEN_ENCRYPTION_KEY`: set as Supabase secret (256-bit AES-GCM for token encryption at rest).
- `R2_PUBLIC_URL`: moved to env var in all upload functions.

### 12. "Post between (UTC time)" Feature — Removed (2026-07-06)
**What was removed**: The `trigger_hour_start`/`trigger_hour_end` base window + `day_time_windows` per-day overrides from both Once Daily and Every X Hours scheduling modes.
**Changes made**:
- `process-workflow/index.ts`: Removed window constraints, random-time-in-window calculation for once_daily, and posInInterval alignment for interval
- `WorkflowsPage.tsx`: Removed "Post between" UI (start/end hour selects, local time display, "Set different times for each day" checkbox + per-day controls), removed from save payload and card display
- `src/lib/types.ts`: Removed `trigger_hour_start`, `trigger_hour_end`, `day_time_windows` from Workflow type
**New behavior**:
- Once Daily: fires on first cron tick of the UTC day (~00:00-00:05) where `lastTriggeredDate !== todayUTC`
- Interval: fires every N hours since last trigger, 24/7 (no window alignment)
- Custom Ranges: unchanged
**Regressions**: Forgot to remove `setTriggerStartHour(0)` / `setTriggerEndHour(1)` from `resetForm()` function — caused `ReferenceError` when opening any workflow form.
**Fix**: Removed those two lines (commit `aa7705c`).

### 13. Instagram Insights Not Loading — Full Resolution (2026-07-06)

**Symptom**: Insights page shows profile stats (followers, media count) but charts are empty.

**Root causes & fixes**:

| # | Problem | Fix | Commit |
|---|---------|-----|--------|
| 1 | OAuth scope `instagram_manage_insights` missing from `facebook-auth` scope list | Added `'instagram_manage_insights'` to scope array | `a1065a1` |
| 2 | `impressions` metric deprecated in Graph API v22.0+ | Replaced with `views` | `655db93` |
| 3 | `metric_type=total_value` needed for `profile_views,views` but incompatible with `follower_count` | Split into two API calls | `34bb8c5` |
| 4 | Insights API max range is 30 days (code used 90) | Changed to `thirtyDaysAgo`; renamed `follower_net_growth_90d` → `follower_net_growth_30d` | `34bb8c5` |
| 5 | `profile_views` and `views` return empty data at user level | Acceptable — API returns 200 OK with no data; charts show "No data available" | — |

**Current status**: 
- `follower_count` (30-day chart) ✅ working
- `reach` (30-day chart) ✅ working  
- `profile_views` (lifetime) ❌ no data available
- `views` (lifetime) ❌ no data available
- Accounts must be reconnected from `/accounts` after the scope fix to get a token with `instagram_manage_insights`

---

## Current State (2026-07-07)

### What Works
- Auth: Google OAuth (existing users only) + admin email/password + security questions
- 17 edge functions deployed with `verify_jwt = false`; `instagram-publish` deleted
- All functions normalized to `SUPABASE_*` env vars; `SB_*` secrets deleted
- Cron jobs 28 (process-workflow) and 29 (process-scheduled-posts) running `*/5 * * * *` with `CRON_API_KEY`
- TikTok: OAuth + upload (FILE_UPLOAD + DIRECT_POST) working; beta mode with BetaBadge
- Instagram: status polling (8×30s but subject to timeout bug); stories use 20×2s=40s polling (fixed)
- Facebook: direct upload working
- Image workflows: dynamic `image_url`/`video_url` based on `media_type`
- Token encryption at rest (AES-GCM in `_shared/crypto.ts`)
- YouTube daily quota warning badge
- QueuePage: retry button, Select All/20/Clear, 24h guard
- Instagram insights dashboard with Recharts
- Facebook insights edge function deployed; all 4 metrics working (v25.0 API, `page_follows`/`page_media_view`/`page_post_engagements`/`page_views_total`)
- Video stagger removed — all videos fire immediately
- R2 lifecycle rule auto-deletes after 1 day
- BetaBadge shown in all 6 TikTok UI locations
- **Per-user Google Drive OAuth** — each user connects Drive via OAuth; tokens stored encrypted; R2 removed
- **`get-file` proxy** — streams Drive files directly to platform APIs via encrypted short-lived token
- **Multi-Drive per workflow** — `drive_account_id` column on workflows; Drive selector in Step 1 (mandatory); cards show assigned Drive name

### Known Issues
1. **Instagram upload timeout** (8×30s polling > 60s runtime) — same class of bug as post-story was fixed for, but not yet applied to instagram-upload
2. **Fire-and-forget swallows errors** — `void fetch(...)` in process-workflow ignores upload failures
3. **No stale processing cleanup** — posts stuck in "processing" never retried
4. **Stagger removed** — if stagger is needed in future, must also fix the Google token passthrough issue

### Blocked
- TikTok app review — needs paid domain (Vercel Pro $20/mo + $12/yr domain)
- TikTok `privacy_level` → `PUBLIC_TO_EVERYONE` — blocked by app review
- Snapchat integration — blocked by API allowlist

---

## DB Schema Notes
- `posts`: id, user_id (text), video_id, platform, caption, hashtags, scheduled_at, published_at, status, captions_enabled, created_at, account_id, contains_altered_content, fb_ai_label, metadata (jsonb), post_type
- `workflows`: id, user_id, name, is_active, sheet_url, sheet_id, platforms[], youtube_channel_ids[], facebook_page_ids[], instagram_account_ids[], trigger_hour_start, trigger_hour_end, max_videos_per_trigger, last_triggered_at, total_posted, created_at, updated_at, youtube_altered_content, post_as_story, last_manual_triggered_at, run_days[], day_time_windows (jsonb), run_interval_hours, media_type, videos_per_run, facebook_ai_generated, instagram_ai_generated, scheduling_mode, custom_schedule (jsonb), tiktok_account_ids[], drive_account_id
- `connected_accounts`: id, user_id, platform, account_id, username, avatar_url, is_connected, access_token (encrypted), refresh_token, token_expires_at, metadata (jsonb), created_at, updated_at
- Migration `20260704000000_add_post_type.sql` applied
- No `error`, `error_details`, or `attempts` column on posts

---

## Key Commands
```powershell
# Deploy all functions
foreach ($f in Get-ChildItem -Directory supabase/functions/*/index.ts | ForEach-Object { $_.Directory.Name }) { npx.cmd supabase functions deploy $f }

# Deploy specific functions
npx.cmd supabase functions deploy process-workflow process-scheduled-posts instagram-upload facebook-upload tiktok-upload youtube-upload post-story tiktok-auth facebook-auth youtube-auth google-drive-auth get-file verify-password verify-security-questions verify-session update-sheet-status fetch-instagram-insights fetch-facebook-insights

# Run SQL query against linked DB
npx.cmd supabase db query --linked "SELECT * FROM pg_views WHERE viewname LIKE '%public%';"

# Check cron run details
npx.cmd supabase db query --linked "SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;"

# Check cron jobs
npx.cmd supabase db query --linked "SELECT jobid, schedule, enabled, regular FROM cron.job;"

# Apply migration
npx.cmd supabase db push
```

## Key URLs
- App: https://flowpost-studio.vercel.app
- Supabase: https://supabase.com/dashboard/project/ximorwzknbizpceaoflw
- GitHub: https://github.com/S-Q-Ali/flowpost-studio
- Vercel: https://vercel.com/S-Q-Ali/flowpost-studio
- Supabase Project Ref: ximorwzknbizpceaoflw
- R2 Public URL: pub-1d4bcccec36046308147315db8637398.r2.dev

## Admin Users
| ID | Email | is_admin | Security Questions |
|---|---|---|---|
| 0d19e852-... | syedqasim963@gmail.com | true | fav_teacher: amna mushtaq, best_night_date: 2026-01-03 |
| ca417e70-... | qasimvamatters@gmail.com | false | — |
| f485999c-... | testuser@flowpost.app | false | — |

---

### 14. Facebook Page Insights — Added (2026-07-06)
**New feature**: Facebook Page insights with platform dropdown on `/insights` page.
**New files**:
- `supabase/functions/fetch-facebook-insights/index.ts` — new edge function; queries `platform = 'facebook'`, calls `/{page-id}/insights` with `page_fans, page_impressions, page_engaged_users, page_views_total` metrics
- `supabase/config.toml` — added `[functions.fetch-facebook-insights] verify_jwt = false`
**Modified files**:
- `src/pages/InsightsPage.tsx` — fully rewritten with platform selector dropdown (Instagram | Facebook), dynamic account loading, platform-adaptive chart labels and stats cards
**Metrics**:
| Platform | Primary chart | Secondary chart | Tertiary chart |
|---|---|---|---|
| Instagram | Follower Growth (30d) | Reach (30d) | Views (30d) |
| Facebook | Page Follows Growth (30d) | Media Views (30d) | Engaged Users (30d) |
**No scope changes needed** — `pages_read_engagement` already requested.

**Fix (2026-07-06, commit `e9465fa`)**:
- `page_fans` → deprecated Nov 15 2025, replaced with `page_follows`
- `page_impressions` → deprecated Nov 15 2025, replaced with `page_media_view`
- `page_engaged_users`, `page_views_total` — still valid, kept as-is
- Renamed `page_fan_growth_30d` → `page_follow_growth_30d` in both edge function and frontend

**Still broken (2026-07-06)**: All 4 metrics return `(#100) The value must be a valid insights metric`. Possibly due to June 15 2026 batch deprecation beyond the Nov 2025 one.

**Diagnostic fix (2026-07-06)**: Split batch `/insights?metric=a,b,c,d` into 4 individual calls with per-metric error capture. Response now includes `insights_errors: { page_follows: ..., page_media_view: ..., ... }` to identify exactly which metric name is invalid.

**Root cause identified**: `page_media_view` and `page_follows` were introduced in Graph API v25.0 (Feb 2026). Code was using v23.0 (May 2025) where these metrics don't exist. All 4 metrics failed because v23.0 doesn't recognize newer metric names.

**Fix (2026-07-06)**: Bumped API version `v23.0` → `v25.0` in `fetch-facebook-insights/index.ts`. Also updated frontend `insights_error_detail` → `insights_errors` reference.

**Third fix (2026-07-06)**: Replaced `page_engaged_users` (deprecated March 2024) with `page_post_engagements` — last remaining `(#100)` metric. All 4 metrics now valid.

**Bumped Graph API v23.0 → v25.0** for `page_follows`/`page_media_view` support; split batch into 4 individual calls.

**Brace fix**: Removed extra closing brace in process-workflow line 709 after earlier edit left mismatched `}`.

---

### 15. Google Drive OAuth — Added; Cloudflare R2 — Removed (2026-07-07)

**Problem**: All file uploads relied on a single shared Google service account JWT (`_shared/google-jwt.ts`) to download files from Drive, upload them to Cloudflare R2, then pass the R2 URL to platform APIs. This meant:
- The service account had access to ALL users' Drive files
- R2 was an unnecessary intermediate hop
- Extra latency per upload (Drive → R2 → platform)

**Solution**: Replace shared service account + R2 with per-user Google Drive OAuth + a lightweight `get-file` auth proxy.

**New files**:
- `supabase/functions/google-drive-auth/index.ts` — OAuth flow (same Google client as YouTube) with `drive.readonly` + `spreadsheets` scopes; token stored in `connected_accounts` with `platform: "google_drive"`
- `supabase/functions/get-file/index.ts` — file proxy: accepts encrypted token containing `{driveUrl, driveToken, exp}`, fetches from Drive API with Bearer auth, streams response bytes

**Modified files**:
- `supabase/functions/process-workflow/index.ts` — removed `getGoogleAccessToken()` import; added `getDriveToken(userId)` that fetches/refreshes per-user Drive OAuth token; passes `driveDownloadUrl` + `googleAccessToken` to upload functions instead of R2 URL
- `supabase/functions/facebook-upload/index.ts` — accepts `driveDownloadUrl` + `googleAccessToken` fields in request body; generates `get-file` proxy token when both provided; passes proxy URL to Facebook API instead of R2 URL; removed old R2 upload logic
- `supabase/functions/instagram-upload/index.ts` — same pattern as facebook-upload; generates `get-file` proxy URL instead of R2 URL
- `supabase/config.toml` — added `[functions.google-drive-auth]` and `[functions.get-file]` blocks; removed `[functions.get-upload-url]` and `[functions.google-oauth]` blocks
- `src/pages/AccountsPage.tsx` — added "Connect Google Drive" button (Drive icon, OAuth via `google-drive-auth` function, real-time subscription, reconnect/disconnect), calls `fetchDrive()` on mount

**Deleted files**:
- `supabase/functions/_shared/google-jwt.ts` — no longer used
- `supabase/functions/_shared/drive-to-r2.ts` — no longer used
- `supabase/functions/get-upload-url/index.ts` — no longer used
- `supabase/functions/cleanup-r2/` — already deleted in a previous session

**New behavior**:
- Each user connects their own Google Drive via OAuth
- Tokens stored encrypted in `connected_accounts` (same as other platforms)
- `get-file` proxy function uses a short-lived (15 min) encrypted token to authorize file access
- Files stream directly: Drive → get-file proxy → platform API — no intermediate R2 storage
- Crawl jobs (`process-workflow`) use per-user Drive tokens instead of shared service account, read from `process.env`

**Setup notes**:
- `GD_CLIENT_ID`, `GD_CLIENT_SECRET` set as Supabase secrets (same OAuth client used for sign-in)
- Redirect URI for Drive OAuth: `https://ximorwzknbizpceaoflw.supabase.co/functions/v1/google-drive-auth?action=callback` — must be added to OAuth client in Google Cloud Console
- `R2_PUBLIC_URL` unset from Supabase secrets (no longer needed)
- Each user must connect Drive once from Accounts page before workflows can run

**Service account fully removed** (2026-07-07):
- `_shared/google-jwt.ts` deleted permanently
- `update-sheet-status` now accepts `googleAccessToken` from caller instead of generating service account JWT
- `_shared/sheet-status.ts` accepts optional `googleAccessToken` param and forwards it
- All 4 upload functions pass the user's OAuth token to `updateSheetStatus()`
- No more sharing sheets with service account email

**Post-deploy issue**: process-workflow was running stale R2-polling code despite successful deploy log. Redeploy fixed it — second video in custom-ranges mode was failing because the function spent 60s waiting for a nonexistent R2 story URL, eating into execution time before processing the next row.

---

### 16. Multi-Drive Per Workflow — Added (2026-07-07)

**Problem**: Only one Drive account per user — all workflows used the same Drive token. User may have multiple Google accounts with different storage quotas, and wanted to assign specific Drives to specific workflows.

**Solution**: Added `drive_account_id` column to workflows; full UI + backend for per-workflow Drive selection.

**Files changed**:

| File | Change |
|------|--------|
| `supabase/migrations/20260707000000_add_drive_account_id.sql` | New migration — `ALTER TABLE workflows ADD COLUMN drive_account_id UUID REFERENCES connected_accounts(id)` |
| `src/lib/types.ts` | Added `drive_account_id: string \| null` to `Workflow` type |
| `src/pages/WorkflowsPage.tsx` | Added `selectedDriveId` + `driveAccounts` state; `fetchDriveAccounts()` loads connected Drives; Drive selector `<Select>` in Step 1 with validation; card display shows assigned Drive name; `drive_account_id` in save payload |
| `src/pages/AccountsPage.tsx` | Already had multi-Drive list (from entry 15) — reuses `fetchDrive()` showing all connected Drives with disconnect button |
| `supabase/functions/process-workflow/index.ts` | `getDriveToken()` now accepts optional `driveAccountId` param; filters by `id` when provided; refresh URL includes `account_id` |
| `supabase/functions/google-drive-auth/index.ts` | `refresh` action accepts optional `account_id` param for multi-account targeting |

**Behavior**:
- User must select a Drive when creating/editing a workflow (mandatory — save blocked otherwise)
- `process-workflow` resolves the correct token by filtering `connected_accounts` by `id`
- Token refresh targets the specific account via `account_id` query param
- If no Drives connected, form shows a link to Accounts page with an error message

---

### 17. Google Drive → Mega — Option A (2026-07-07)

**Goal**: Use Mega as an alternative file source when Drive is full. Put Mega URLs in Sheets' `video_url` column alongside Drive URLs — captions, status, scheduling all unchanged. Workflow publishes from whichever URL is provided.

**Key insight**: Google Sheets stays as the scheduling layer. Mega only replaces the file storage. A single Sheet can mix Drive URLs and Mega URLs per row.

**What stays the same**:
- Sheet columns (`video_url`, `fb_ig_caption`, `status`, `platforms`, etc.)
- Scheduling modes, platform routing, upload functions
- `process-workflow` loop (sheet reading, status management)

**What changes in `process-workflow`**:
- URL detection — Drive URL (`/d/FILEID`) → existing Drive API flow with OAuth token. Mega URL (`mega.nz/file/HASH#KEY`) → new Mega download flow
- Both paths resolve to file bytes → same upload pipeline

**Mega download challenge** — Mega uses encrypted protocol + client-side decryption. A plain `fetch(megaUrl)` won't work. Need to:
1. Resolve download URL via Mega API (`g.api.mega.co.nz/cs`)
2. Decrypt file data using key embedded in the Mega link
3. Stream decrypted bytes to platform API

**Options for Mega API integration**:
- **Deno Mega library** — `npm:mega` or `x/mega` — runs inside the edge function. Most integrated but potential compatibility issues with Supabase Edge Function runtime
- **Node.js worker service** — lightweight server that queues transfer jobs. Edge function calls worker → worker downloads/decrypts Mega file → returns bytes or stores temporarily. More reliable but adds infrastructure

**Future consideration**: If Mega proves reliable, Option B (replace both Sheets and Drive with a native Supabase queue system + Mega storage) becomes viable — removing Google dependency entirely.

**Next step**: Pick Mega API integration strategy.
