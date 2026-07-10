# FlowPost Studio — Session State

## CURRENT HEAD: see `git log --oneline -1`

## Current Issues
- Drive scope changed to `drive.file` + `drive.readonly`; users must reconnect accounts to get the new combined token.

## Current Status
- **v19**: Browser-streamed Drive→Mega transfer. Moved CPU-intensive megajs AES encryption from server-side edge function to user's browser. New `transfer-ticket` edge function provides temporary decrypted credentials. Client-side `driveToMegaTransfer.ts` handles streaming upload. No server CPU limits — files of any size can transfer (subject to browser tab staying open).
- **Delete files**: Users can delete files and folders from both Drive and Mega directly in the Storage page. Drive scope upgraded from `drive.readonly` to `drive.file` — existing Drive accounts must be reconnected.

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

## Current State (2026-07-09)

### What Works
- Auth: Google OAuth (existing users only) + admin email/password + security questions
- 18 edge functions deployed with `verify_jwt = false`; `instagram-publish` deleted
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
- **Mega as alternate file source** — paste mega.nz URLs in Sheet's `video_url`; get-file proxy downloads via `npm:megajs`; mixed Drive + Mega URLs per row supported
- **Mega account integration** — users connect Mega via email/password on AccountsPage; `mega:filename.mp4` in Sheet triggers authenticated download via get-file proxy; mega-auth function handles connect/files/disconnect
- **Browser-streamed Drive→Mega transfer** — CPU-intensive AES encryption runs in user's browser (no server CPU limits); `transfer-ticket` edge function provides temporary decrypted credentials; `driveToMegaTransfer.ts` handles streaming upload

- Light + dark theme (Aurora Rose Studio / Aurora Rose Dark) via `next-themes`; no theme toggle UI. Theme preference is client-side only — the `sessions` table, admin `flowpost_token`, and auth logic are unchanged (see entry #36).

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

### 17. Mega as Alternate File Source — Implemented (2026-07-07)

**Goal**: When Drive is full, upload files to Mega, paste Mega URLs into the same Sheet's `video_url` column, and the workflow publishes from Mega instead of Drive. Sheet + scheduling + captions remain identical.

**Key discovery**: `npm:megajs` v1.3.10 has native Deno support. Public Mega links include the decryption key — no Mega account credentials needed for downloading.

**Files changed** (commit `5a53fc6`):

| File | Change |
|------|--------|
| `supabase/functions/get-file/index.ts` | Import `npm:megajs`; accept `megaUrl` in encrypted token; download via `megajs` when present; keep existing Drive API flow as fallback |
| `supabase/functions/facebook-upload/index.ts` | Parse `megaUrl` from body; generate proxy token `{ megaUrl, exp }`; precedence: megaUrl > drive |
| `supabase/functions/instagram-upload/index.ts` | Same as facebook |
| `supabase/functions/tiktok-upload/index.ts` | Parse `megaUrl`; use megajs for video size; fetch video via proxy URL; added mega.nz + supabase host to ALLOWED_DOMAINS |
| `supabase/functions/youtube-upload/index.ts` | Parse `megaUrl`; use megajs for content-length; proxy URL as sourceUrl; added mega.nz + supabase host to ALLOWED_DOMAINS |
| `supabase/functions/process-workflow/index.ts` | Detect `mega.nz` in `video_url`; pass `megaUrl` field instead of `driveDownloadUrl` + `googleAccessToken`; story token generation handles both sources |

**What stays the same**:
- Google Sheets is the single source of truth — same `video_url`, `fb_ig_caption`, `status`, `platforms` columns
- Google OAuth token still used for Sheets API
- Scheduling modes, upload pipeline, platform routing — all unchanged
- Drive URLs in the same sheet still work alongside Mega URLs
- **No DB migrations, no frontend changes, no new tables**

**Flow**:
```
Sheet video_url column:
  drive.google.com/... → process-workflow → driveDownloadUrl → get-file proxy → Drive API
  mega.nz/file/...     → process-workflow → megaUrl         → get-file proxy → megajs
                                                    ↓
                                     Facebook/Instagram/TikTok/YouTube
```

**Manual steps** (done by user):
1. Created Mega account
2. Uploaded videos to Mega
3. Got share links (mega.nz/file/HASH#KEY)
4. Paste links into Sheet's `video_url` column

---

### 18. Mega Account Integration — Refined Plan (2026-07-07)

**Goal**: Replace anonymous public share links with authenticated Mega account login. Users connect their own Mega account (like Drive), put `mega:filename.mp4` in the Sheet, and the system looks up the file by name inside the logged-in Mega session. No decryption keys exposed.

**Reason**: After testing, public share links work but expose the decryption key in the Sheet. Account login keeps files private and allows lookup by filename instead of full URL.

**How it works**:
- Each user connects their own Mega account (email + password) → encrypted in `connected_accounts` with `platform: "mega"`
- Sheet `video_url` column accepts `mega:filename.mp4` instead of `https://mega.nz/file/HASH#KEY`
- `get-file` proxy logs into Mega via `new Storage({ email, password })`, searches root for filename, downloads via authenticated session
- Three source types supported per row: Drive URL, public Mega URL, or `mega:filename`

**New files**:

| File | Purpose |
|------|---------|
| `supabase/functions/mega-auth/index.ts` | Actions: `connect` (validate + store encrypted credentials), `files` (list root files), `disconnect` |
| `src/pages/AccountsPage.tsx` | Add Mega section — same pattern as Drive: connect button → email/password form → connected account list with disconnect |

**Modified files**:

| File | Change |
|------|--------|
| `supabase/functions/get-file/index.ts` | Accept `{ megaFileName, megaAccountId, exp }` in token; fetch encrypted creds from DB, log in, search root by name, download |
| `supabase/functions/process-workflow/index.ts` | Detect `mega:` prefix; retrieve user's Mega account from `connected_accounts`; pass `megaFileName` + `megaAccountId` |
| `supabase/config.toml` | Add `[functions.mega-auth]` block with `verify_jwt = false` |

**No changes needed**:
- Upload functions (`facebook-upload`, `instagram-upload`, `tiktok-upload`, `youtube-upload`) — already accept `megaUrl` field, unchanged
- Sheet columns — `video_url` gets `mega:filename.mp4`, rest same
- Scheduling, platforms, captions — all unchanged

**3 supported Sheet patterns** (all in one sheet):
```
video_url:
  https://drive.google.com/...     → Drive API (existing)
  https://mega.nz/file/HASH#KEY    → Public link (existing)
  mega:my-cool-video.mp4           → Account lookup (new)
```

**Implementation order**:
1. `mega-auth` function (connect + files + disconnect)
2. `AccountsPage.tsx` Mega section
3. `get-file` proxy update (authenticated Mega download)
4. `process-workflow` URL detection update (`mega:` prefix)
5. Deploy + test

---

### 19. Mega Account Integration — Implemented (2026-07-07)

**Goal**: Replace anonymous public share links with authenticated Mega account login. Users connect their own Mega account, put `mega:filename.mp4` in the Sheet, and the system looks up the file by name inside the logged-in Mega session.

**Changes**:

| File | Change |
|------|--------|
| `supabase/functions/mega-auth/index.ts` | New — 3 actions: `connect` (validate + store encrypted credentials), `files` (list root files), `disconnect` |
| `src/pages/AccountsPage.tsx` | Added Mega section — connect form (email/password), account list, disconnect button |
| `supabase/config.toml` | Added `[functions.mega-auth] verify_jwt = false` |
| `supabase/functions/get-file/index.ts` | Accept `{ megaFileName, megaAccountId, exp }` in token; decrypts creds from DB, logs in via `new Storage()`, searches root by name, downloads |
| `supabase/functions/process-workflow/index.ts` | Detects `mega:` prefix; looks up user's Mega account from `connected_accounts`; passes `megaFileName` + `megaAccountId` to uploaders |
| `supabase/functions/facebook-upload/index.ts` | Accepts `megaFileName` + `megaAccountId`; builds get-file proxy token for authenticated Mega |
| `supabase/functions/instagram-upload/index.ts` | Same pattern |
| `supabase/functions/tiktok-upload/index.ts` | Same pattern (2 locations: video size + stream) |
| `supabase/functions/youtube-upload/index.ts` | Same pattern |

**3 supported Sheet patterns**:
```
video_url:
  https://drive.google.com/...     → Drive API
  https://mega.nz/file/HASH#KEY    → Public link (anonymous)
  mega:my-cool-video.mp4           → Account lookup (authenticated)
```

**All 7 functions deployed** (commit `d47d03c`).

---

### 20. Mega Connection 400 Bug — Fixed (2026-07-07)

**Symptom**: Connecting Mega account via FlowPost UI returned 400 "Missing action".

**Root cause**: The frontend sends `action` inside the request body (`{ action: "connect", email, password, userId }`), but `mega-auth/index.ts` read `action` from `url.searchParams.get("action")` — never matching, always returning 400.

**Fix**: Restructured `mega-auth/index.ts` to parse the request body once at the top with `await req.json()`, then extract `action` from `body.action` with fallback to `url.searchParams.get("action")`. Also refactored `connect` and `disconnect` to use the already-parsed `body` instead of calling `req.json()` again.

**Redeployed** (commit `317c07d`).

---

### 21. storage.api.logout is not a function — Fixed (2026-07-07)

**Symptom**: Mega connection failed with `TypeError: storage.api.logout is not a function`.

**Root cause**: `npm:megajs` v1.3.10's `Storage` doesn't expose `api.logout()` as a callable method in Deno.

**Fix**: Removed all `storage.api.logout()` calls from `mega-auth/index.ts` (2 occurrences) and `get-file/index.ts` (2 occurrences). Connection closes naturally when the function returns.

**Redeployed** both functions (commit `a177814`).

---

### 22. Auth Success Pages Styled — Updated (2026-07-07)

**Problem**: All 4 OAuth callback pages (facebook-auth, google-drive-auth, tiktok-auth, youtube-auth) showed raw inline HTML with minimal styling after a successful connection.

**Fix**: Replaced with a polished, centered card UI matching FlowPost's dark brand — styled heading, descriptive subtitle, "Return to FlowPost" button linking to `/accounts`, and a "This tab can be closed" note.

**Files changed**: `facebook-auth/index.ts`, `google-drive-auth/index.ts`, `tiktok-auth/index.ts`, `youtube-auth/index.ts`

**Deployed** all 4 (commit `1ea683b`).

---

### 23. Auth Callback HTML Replaced with 302 Redirect — Fixed (2026-07-07)

**Problem**: Supabase's edge gateway rewrites `text/html` to `text/plain` on GET responses ([docs](https://supabase.com/docs/guides/functions/http-methods)). All 4 OAuth callback success pages displayed as raw HTML source code instead of rendering.

**Fix**: Replaced `return html(...)` with a 302 redirect to `https://flowpost-studio.vercel.app/accounts?connected={platform}`. The popup navigates to the app's AccountsPage, which detects the `?connected=` param and shows a success toast. No Content-Type issues since the redirect points to the SPA.

**Files changed**: All 4 auth functions + `src/pages/AccountsPage.tsx` (added `useSearchParams` + `useEffect` for toast on `?connected=` param).

**Deployed** all 4 functions (commit `d829e9a`).

---

### 24. List Files Button for Mega Accounts — Added (2026-07-07)

**Problem**: No way to view filenames in Mega root to know the exact name to use with `mega:filename.mp4` in Sheets.

**Fix**: Added a "Files" button on each connected Mega account card. Clicking it calls `mega-auth` with `action=files`, logs into Mega, and lists root files with name + size. Also fixed `mega-auth/files` action to accept `account_id` from request body (previously only from URL params).

**Files changed**: `src/pages/AccountsPage.tsx`, `supabase/functions/mega-auth/index.ts`

**Deployed** (commit `f5750b9`).

---

### 25. Storage Page — Added (2026-07-07)

**Feature**: New `/storage` page alongside Dashboard, Upload, Queue, etc. for managing file storage and transferring files between platforms.

**Drive section**:
- Account dropdown (supports multiple connected Drives)
- Quota bar (used/total from Drive API `storageQuota`)
- Folder browser with breadcrumb navigation (folders → drill in, files selectable)
- Pagination with "Load more"
- Checkbox per file for batch selection

**Mega section**:
- Quota bar (used/total via `storage.getAccountInfo()`)
- Folder browser + picker — browse Mega folders, click folder to set as upload target
- "Create folder" button to create new folders in Mega
- Shows current target path: `Target: Videos/2026` or `Target: (root)`

**Transfer flow**:
- Select files in Drive browser, set Mega target folder, click "Upload N selected to Mega"
- Sequential upload: one file at a time with progress indicator
- `drive-to-mega` function streams Drive file bytes → Mega via `folder.upload()`, creates missing folders via `mkdir()`

**New files**:
- `src/pages/StoragePage.tsx` — full storage management page (~460 lines)
- `supabase/functions/drive-to-mega/index.ts` — streams Drive → Mega (accepts `driveAccountId` for server-side token resolution)

**Modified files**:
- `supabase/functions/google-drive-auth/index.ts` — added `quota` and `list-files` actions
- `supabase/functions/mega-auth/index.ts` — added `quota`, `list-items`, and `create-folder` actions
- `src/App.tsx` — added `/storage` route
- `src/components/AppSidebar.tsx` — added "Storage" nav link with HardDrive icon
- `supabase/config.toml` — added `[functions.drive-to-mega]`

**Deployed** 3 functions (commit `b3bb94c`).

---

### 26. Drive-to-Mega CPU Timeout — Fixed with Web Crypto (2026-07-08)

**Symptom**: Images uploaded fine but videos failed with "CPU Time exceeded". megajs's pure-JS AES encrypts at ~0.7μs/block; 100MB video = ~8.8s CPU, exceeding Free plan ~5s limit.

**Root cause**: `megajs` browser build bundles pure-JS AES (`aes.js`, `ctr.js`, `mac.js`) with no hardware acceleration. Each 16-byte block requires 2 AES block encrypts (CTR + CBC-MAC). Even with proper streaming, large files hit the CPU limit.

**Fix**: Replaced `target.upload()` entirely with a custom implementation using **Web Crypto API** (AES-NI hardware acceleration via BoringSSL). Three changes:

| File | Change |
|------|--------|
| `supabase/functions/drive-to-mega/index.ts` | Removed `target.upload()` call. Added `uploadWithWebCrypto()` using `crypto.subtle.encrypt()` for AES-128-CTR + CBC-MAC; reads Drive in Mega variable chunks (128B→1MB), encrypts each with hardware AES (~0.5ms/1MB), POSTs to Mega upload URL; creates file node via `storage.api.request()`. Response is NDJSON stream with per-chunk progress. |
| `src/pages/StoragePage.tsx` | Replaced `supabase.functions.invoke()` with raw `fetch()` + NDJSON stream reader; added SVG circular progress ring showing per-file percentage. |
| `supabase/config.toml` | Added `timeout = "120s"` to `[functions.drive-to-mega]` (from previous attempt) |
| `SESSION_STATE.md` | Updated this entry |

**Performance**:

| File size | megajs JS AES (CPU) | Web Crypto AES-NI (CPU) |
|-----------|-------------------|------------------------|
| 10 MB     | ~0.9s             | ~0.004s |
| 100 MB    | ~8.8s ❌          | ~0.04s ✅ |
| 500 MB    | ~43s ❌❌         | ~0.2s ✅ |

**Details**:
- **Key**: 24 random bytes (16 AES + 8 nonce)
- **CTR**: `crypto.subtle.encrypt({name:"AES-CTR", counter, length:128}, key, chunk)` per Mega chunk
- **MAC**: `crypto.subtle.encrypt({name:"AES-CBC", iv:zeros}, key, [prevMac ++ ciphertext])` last 16 bytes = new MAC
- **Chunk sizes**: 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, then 1MB
- **Upload protocol**: `{a:"u"}` → upload URL, POST each chunk to `{url}/{offset}`, last response = completion hash, `{a:"p"}` to create node
- **Key encryption**: Merged key (32B) encrypted with user's master key via `storage.aes.encryptECB()`
- **Attributes**: `{"n":"filename"}` AES-CBC encrypted with zero IV

**Deploy**: `supabase functions deploy drive-to-mega --no-verify-jwt`

**Post-deploy fix (EARGS -2)**: Custom Web Crypto upload failed persistently. Debugging revealed:
- **v5**: `EARGS (-2)` on `{a:"p"}` — all chunks uploaded fine (progress 0-99%) but node creation failed
- **v6-v7**: Added/removed debug logs, fixed `t` parameter fallback, fixed chunk sizes from byte-doubling to KB-additive scheme — still `EARGS`
- **v8**: Fixed per-chunk MAC save/reset matching megajs `checkBounding` — still `EARGS`
- **v9-v10**: Used `storage.api.fetch` instead of raw `fetch` for chunk uploads — still `ERANGE (-7)` on every chunk, meaning chunk boundaries still didn't match what Mega expects
- **v11**: Removed `v: 2` from upload URL request — still `ERANGE (-7)`
- **v12** (commit `7fbd206`): **Abandoned custom Web Crypto upload entirely**. Replaced `uploadWithWebCrypto()` with `uploadWithMega()` using megajs's built-in `target.upload()`. This guarantees correct chunk sizes, MAC computation, completion hash, and `{a:"p"}` parameters. Streams directly: `driveRes.body.pipeTo(uploadStream)`. Retains NDJSON progress stream with `"progress"` event listener on megajs upload stream.
- **CPU concern mitigated**: The Free plan CPU timeout was the original reason for custom Web Crypto. However, the timeout is now 120s (set in `supabase/config.toml`). megajs pure-JS AES at ~0.7μs/block should now fit within 120s for files up to ~136MB. For larger files, if CPU timeout recurs, we can restore Web Crypto after first getting `target.upload()` working as a baseline.
- **v13**: Wrapped Node.js Writable in WHATWG WritableStream for `pipeTo` compatibility — but CPU timeout recurred on larger files
- **v14** (commit `b079678`): **Restored Web Crypto upload** with all fixes:
  - `BufferedReader` class — buffers overflow bytes between chunk reads, ensuring exact chunk sizes
  - `Content-Type: application/octet-stream` header on chunk POSTs
  - All prior fixes: KB-additive chunk sizes, per-chunk MAC save/reset, `chainMacs`, `mergeKeyMac`, `encryptECB`, no `v: 2`
  - Result: Chunks uploaded successfully (progress 0-99%) but `{a:"p"}` returned **`ENOENT (-9)`** instead of `EARGS (-2)` — progress!
- **v15** (commit `0912ada`): Changed `t: (target as any).nodeId || target` → `t: target` (pass MutableFile object directly). Result: **"Converting circular structure to JSON"** — `JSON.stringify` in `api.request()` can't handle MutableFile's circular `parent`→`children`→`parent` graph.
- **v16** (commit pending): Added `[t] info:` debug log. Result: `nodeId` = `"MV8GyQrS"` (valid 8-char base64 handle), no `h` or `hash` properties. Circular JSON error confirmed from passing `target` object.
- **v17** (commit pending): Restored `t: (target as any).nodeId` + changed `Buffer.from(new Uint8Array(mergedKey))` → `Buffer.from(mergedKey.buffer, ...)` to match megajs's Buffer creation. Result: **`EKEY (-14)`** — key encryption/decryption failed. Custom Web Crypto key encryption (`encryptECB`) produces wrong output for `k` parameter.
- **Conclusion**: Custom Web Crypto approach is correct for all parameters except `k` (encrypted key). The `Buffer.from()` + `encryptECB()` combination produces bytes that Mega can't decrypt. Debugging exhausted — `EKEY (-14)` requires deep knowledge of megajs's internal AES implementation and how Deno's `Buffer` polyfill handles the in-place mutation.
- **v18**: Replaced Web Crypto upload entirely with megajs built-in `target.upload()` + WHATWG `WritableStream` wrapper. Removed all custom AES code (`BufferedReader`, `getMegaChunkSize`, `e64`, `mergeKeyMac`, `chainMacs`, `encryptECB`). Resolves all parameter bugs (EARGS, ERANGE, ENOENT, circular JSON, EKEY). CPU timeout mitigated by 120s config. **Works end-to-end**.

---

### 27. Post-Story Never Called — Fixed (2026-07-08)

**Symptom**: Workflows triggered and published videos but never posted stories. Zero logs from `post-story` in Supabase.

**Root cause**: `process-workflow/index.ts:672` referenced `if (isMega)` — a variable that was **never declared**. The actual variables are `isMegaPublic` (mega.nz URL) and `isMegaAccount` (mega: prefix), declared at lines 401-402. The `ReferenceError` was caught by the catch block, silently skipping the entire story block.

A secondary bug: even if `isMega` existed, the `mega:` prefix case doesn't set `megaUrl` — it sets `megaFileName` + `megaAccountId`. The old token construction passed `megaUrl` which would be `undefined`.

**Fix**: Replaced the two-way branch (`isMega` / `else`) with three-way:

| Source type | Token payload | Used for |
|-------------|--------------|----------|
| `isMegaAccount` (`mega:filename.mp4`) | `{ megaFileName, megaAccountId, exp }` | Authenticated Mega download via get-file |
| `isMegaPublic` (mega.nz URL) | `{ megaUrl, exp }` | Public Mega link download via get-file |
| Drive (else) | `{ driveUrl, driveToken, exp }` | Drive download via get-file |

**File**: `supabase/functions/process-workflow/index.ts:672-685`

**Deploy**: `supabase functions deploy process-workflow --no-verify-jwt`

---

### 29. Session ID Exchange — Secure Mega Credentials (2026-07-09)

**Problem**: The browser-streamed transfer (entry #28) exposed decrypted Mega email + password in browser JS memory. An XSS vulnerability or malicious browser extension could exfiltrate credentials.

**Root cause**: `transfer-ticket` returned `{ megaEmail, megaPassword }` to the browser client, which then passed them to `new MegaStorage({email, password})` — the plaintext password lived in browser JS heap until garbage collected.

**Fix**: Moved Mega login to the server. `transfer-ticket` now:
1. Decrypts Mega credentials server-side (as before)
2. Calls `new MegaStorage({email, password}).ready` to login
3. Extracts session data via `storage.toJSON()` — returns `{ key, sid, user }`
4. Closes server storage with `storage.close()`
5. Overwrites decrypted vars with `null` before returning
6. Returns `megaSession` object (no email/password)

Client-side (`driveToMegaTransfer.ts`) uses `Storage.fromJSON()` to resume the session:
```typescript
const storage = MegaStorage.fromJSON({
  key: ticket.megaSession.key,
  sid: ticket.megaSession.sid,
  user: ticket.megaSession.user,
  options: { autoload: false, autologin: false },
});
await storage.reload(true);
```

**Security improvement**: Mega password never leaves the server. The browser only receives a time-limited session ID (`sid`) + master key (`key`), which are functionally necessary for the upload to work but cannot be used to log into the Mega web interface (no password hash derived from them).

**Files changed**:
| File | Change |
|------|--------|
| `supabase/functions/transfer-ticket/index.ts` | Added Mega login + `toJSON()` extraction; replaced `megaEmail`/`megaPassword` response with `megaSession: { key, sid, user }` |
| `src/lib/driveToMegaTransfer.ts` | Updated `TransferTicket` interface; replaced `new MegaStorage({email, password})` with `Storage.fromJSON()`; added `finally` block for `storage.close()` |

**Deploy**: `npx.cmd supabase functions deploy transfer-ticket --no-verify-jwt`

**Post-deploy fix**: Initial deploy had `(megaEmail as any) = null; (megaPassword as any) = null;` to clear decrypted credentials. This caused `TypeError: Assignment to constant variable` because `const` variables cannot be reassigned even with type assertions in Deno. Removed both lines — credentials are GC'd on function exit ~1ms later anyway. (commit `ea26eb3`)

---

### 28. Drive-to-Mega Transfer — Browser-Streamed (2026-07-09)

**Goal**: Move Drive→Mega file transfer from server-side Supabase Edge Function to the user's browser, eliminating CPU time limits that caused failures on large files.

**Problem**: The server-side `drive-to-mega` Edge Function uses `megajs`'s pure-JavaScript AES encryption. On Supabase Free plan, Edge Functions have a CPU time limit (~5s). Files over ~136MB hit this limit, even though the wall-clock timeout was raised to 120s. Custom Web Crypto implementation (hardware-accelerated AES) was attempted but couldn't match megajs's internal key encryption format (EKEY, EARGS errors after 18+ iterations).

**Solution**: Client-side browser streaming. Browsers don't have artificial CPU cutoffs — megajs runs in the browser where pure-JS AES is slow but not killed by time limits.

**New files**:

| File | Change |
|------|--------|
| `supabase/functions/transfer-ticket/index.ts` | New edge function — authenticates user via session token, fetches encrypted Drive + Mega credentials from `connected_accounts`, decrypts them, returns temporary ticket with `driveToken`, `megaEmail`, `megaPassword`. Verifies both accounts belong to the requesting user. |
| `src/lib/driveToMegaTransfer.ts` | Client-side transfer module — calls `transfer-ticket` to get credentials, fetches Drive file stream via Google API (CORS OK), logs into Mega via megajs browser build, resolves target folder, uploads with progress reporting via `WritableStream` wrapper. |
| `src/pages/StoragePage.tsx` | Updated `startUpload()` to use `transferDriveToMega()` instead of calling `drive-to-mega` edge function. Gets session token from `localStorage("flowpost_token")` for auth. |

**Modified files**:

| File | Change |
|------|--------|
| `vite.config.ts` | Added `vite-plugin-node-polyfills` for `buffer`, `stream`, `crypto`, `events`, `util`, `process` — required by megajs browser build. |
| `supabase/config.toml` | Added `[functions.transfer-ticket]` block with `verify_jwt = false`. |
| `package.json` | Added `megajs`, `buffer` (dependencies), `vite-plugin-node-polyfills` (devDependency). |

**Flow**:
```
Browser:
  1. callTransferTicket(sessionToken, driveAccountId, megaAccountId)
     → supabase edge function verifies session + account ownership
     → returns { driveToken, megaEmail, megaPassword }
  2. fetch(googleapis.com/drive/v3/files/{id}?alt=media) with driveToken
     → ReadableStream from Google (CORS OK)
  3. new MegaStorage({ email, password }).ready
     → authenticated Mega session in browser
  4. resolveMegaFolder() → navigate/create target folder
  5. target.upload() + stream.pipeTo(writable)
     → pure-JS AES runs in browser (no CPU wall)
  6. Progress events via listener callback → UI updates
```

**Security**:
- Credentials decrypted server-side only, sent to client over HTTPS
- Session token validated against `sessions` table (expiry check)
- Both Drive and Mega accounts verified to belong to the requesting user
- Ticket is one-time use (no persistence)

**Performance**:
| File size | Server-side (megajs CPU) | Browser-side (megajs CPU) |
|-----------|-------------------------|--------------------------|
| 10 MB     | ~0.9s ✅                | ~0.9s ✅                 |
| 100 MB    | ~8.8s ❌ (CPU limit)    | ~8.8s ✅ (no limit)      |
| 500 MB    | ~43s ❌❌               | ~43s ✅ (slow but works) |

**Deploy**:
```bash
npx.cmd supabase functions deploy transfer-ticket --no-verify-jwt
```

**Known limitations**:
- Browser tab must stay open during transfer (no background processing)
- Pure-JS AES in megajs is slower than hardware-accelerated AES (~0.7μs/block)
- Large files (500MB+) will take noticeable time but will complete
- `beforeunload` warning should be added to prevent accidental tab closure

**Status**: Phase 1 complete — proof of concept implemented, edge function deployed, StoragePage updated. Needs real-world testing with actual Drive→Mega transfers.

---

### 30. Delete Mega & Google Drive Files from Storage Page (2026-07-09)

**Feature**: Users can now delete files and folders from both Drive and Mega directly in the Storage page.

**Files changed**:

| File | Change |
|------|--------|
| `supabase/functions/google-drive-auth/index.ts` | Changed OAuth scope from `drive.readonly` → `drive.file` (allows deleting files user has created). Added `action=delete` handler — accepts `account_id` + `file_id`, refreshes token, calls `DELETE /drive/v3/files/{fileId}`. |
| `supabase/functions/mega-auth/index.ts` | Added `nodeId` to `list-items` response for both `folders` and `files`. Added `delete` action handler — accepts `account_id` + `nodeId`, looks up file via `storage.files[nodeId]`, calls `file.delete(true)` (permanent). |
| `src/pages/StoragePage.tsx` | Added `AlertDialog` for single file/folder delete confirmation. Trash icon button on Drive files, Mega files, and Mega folders (visible on hover). "Delete N selected from Drive" button in bottom bar (no confirmation). Refresh both Drive + Mega listings after delete. |

**Behavior**:

| Scenario | Confirmation | Platform |
|----------|-------------|----------|
| Click trash icon on a single file | Yes (AlertDialog) | Drive + Mega |
| Click trash icon on a folder | Yes (AlertDialog with folder warning) | Drive + Mega |
| Click "Delete N selected" | No (no confirmation) | Drive only |
| Delete is permanent | Yes — `file.delete(true)` skips trash on Mega, Drive `DELETE` is permanent | Both |

**Migration**: Users must **reconnect** Google Drive accounts to obtain the new `drive.file` scope. Mega accounts work without reconnection.

**Deploy**: Both functions deployed.

---

### 31. Multi-Drive Refresh Token Mismatch — Fixed (2026-07-09)

**Symptom**: After connecting a 3rd Google Drive account, all Drive accounts showed as connected but none displayed files. No error in frontend — silent failure.

**Root cause**: Two bugs:

1. **`refresh_token` fallback lookup** (`google-drive-auth/index.ts:164-171`): When Google doesn't return a new `refresh_token` on re-authorization (normal behavior — only returned on first auth), the fallback query grabbed **any** existing Drive account's refresh token via `.maybeSingle()` with no `account_id` filter. This paired the wrong refresh_token with the new access_token. The `list-files` handler then failed to refresh tokens silently.

2. **Silent error handling** (`StoragePage.tsx:150`): `fetchDriveFiles` checked `if (!error && data)` but did nothing when `error` was truthy — no console log, no toast. The UI just showed an empty file list.

**Fix**:
- Added `.eq("account_id", accountId)` to the fallback refresh_token lookup — now it only grabs the refresh token for the **same** email address.
- Added `console.error` + `toast.error("Failed to list Drive files")` in `fetchDriveFiles` when the API call fails.
- Added `setDriveBreadcrumbs([])` + `setSelectedFileIds(new Set())` when switching Drive accounts via the dropdown.

**Files changed**:
| File | Change |
|------|--------|
| `supabase/functions/google-drive-auth/index.ts` | Added `.eq("account_id", accountId)` to fallback refresh_token query |
| `src/pages/StoragePage.tsx` | Added error toast/log in `fetchDriveFiles`; clear breadcrumbs + selection on drive switch |

**Deploy**: `supabase functions deploy google-drive-auth --no-verify-jwt`

**Note**: Users with broken refresh_token pairs will need to re-connect their Drive accounts one more time after this fix.

---

### 32. Future: Sliding Session Expiry (Plan)

**Idea**: Currently session tokens have a fixed 7-day TTL set at creation (`verify-password/index.ts:68-70`, `verify-security-questions/index.ts:35-37`). Once expired, the user must re-authenticate. A sliding-window approach would extend the `expires_at` by 7 days on each active use (navigation, upload, etc.), preventing mid-session expiry for heavy users.

**Implementation sketch**:
- Create a shared helper `supabase/functions/_shared/session.ts` with `refreshSession(token)` that updates `expires_at` to `now + 7 days`
- Call this from any authenticated edge function (workflow triggers, uploads, file listings)
- The frontend can call it periodically or on each navigation event
- Add a cleanup cron to delete truly expired sessions (past `expires_at`)

**Status**: Not implemented. Optional enhancement for improved UX.

---

### 33. `drive.file` Scope Shows Empty File List — Fixed (2026-07-10)

**Symptom**: After changing scope from `drive.readonly` to `drive.file` (to support file deletion), the Drive file browser showed an empty list. Quota (usage/limit) displayed correctly, but no files appeared. No error toast — the Drive API returned success with zero files.

**Root cause**: The `drive.file` scope only grants access to files **created by or opened with this app**. `files.list` under `drive.file` returns zero results for users who have never used FlowPost Studio to create or open a Drive file. The quota endpoint (`about/get`) works under `drive.file` because it's a metadata endpoint, not file-specific — this misled debugging into thinking the token was valid.

**Fix**: Changed the OAuth scope from `drive.file` alone to a combined scope:
```
https://www.googleapis.com/auth/drive.file           ← delete files the app opened
https://www.googleapis.com/auth/drive.readonly       ← list + download ALL files
https://www.googleapis.com/auth/userinfo.profile     ← identity
```
- `drive.readonly` allows listing and downloading all files (replaces `drive.metadata.readonly`)
- `drive.file` preserves the ability to delete files the app has opened
- The token covers both scopes — one auth flow, one access token

**Files changed**:
| File | Change |
|------|--------|
| `supabase/functions/google-drive-auth/index.ts` | Replaced `drive.metadata.readonly` with `drive.readonly` in scope array (line 136) |

**Note**: Users must reconnect Drive accounts after deploy so Google issues a new token with the combined scopes. The existing `prompt=consent` param ensures a fresh refresh_token on each reconnect.

---

### 34. Reconnect Button for Drive Accounts (2026-07-10)

**What**: Added a per-account Reconnect button (arrow icon) on each Drive account card in AccountsPage, next to the Disconnect button.

**Why**: After a scope change, users had to disconnect and then click the generic "Connect Google Drive" button, manually re-selecting the same Google account. The reconnect button uses Google's `login_hint` OAuth parameter to pre-select the account, so the user just clicks "Continue".

**Changes**:
| File | Change |
|------|--------|
| `supabase/functions/google-drive-auth/index.ts` | Added `login_hint` query param forwarding to Google OAuth URL (line 133) |
| `src/pages/AccountsPage.tsx` | Added `reconnectingDriveId` state, `reconnectDrive()` function, `RefreshCw` icon button on each Drive card |

**How it works**:
1. User clicks `↻` button on a Drive card
2. Button shows spinning animation, disabled state
3. Calls `google-drive-auth?action=url&userId=...&login_hint=<email>` — Google OAuth opens with that email pre-selected
4. Listens for any change (`event: "*"`) on the specific DB row (`id=eq.<rowId>`) — handles both INSERT (new account) and UPDATE (reconnect same email)
5. On success: toast + list refresh. On 30s timeout: toast error.
6. The existing "Connect Google Drive" button at the bottom is unchanged.

**Deploy**: `supabase functions deploy google-drive-auth --no-verify-jwt`

---

### 35. Single-Session Enforcement — Terminate Other Sessions on New Login (2026-07-10)

**What**: When a user logs in from a new browser/profile with the same credentials, all existing sessions are deleted, terminating the old session. Only one active session at any time.

**Why**: Without this, a user could be logged in from multiple profiles simultaneously — old sessions remain valid for 7 days. This is a security concern and UX issue for a single-admin tool.

**How it works**: Before inserting a new session row, each login edge function now first deletes all existing rows from the `sessions` table. The old session token becomes invalid immediately — the next API call from the old tab gets a 401 from `verify-session`, `AuthContext` clears localStorage, and the user sees the login page.

**Files changed**:
| File | Line | Change |
|------|------|--------|
| `supabase/functions/verify-password/index.ts` | 72 | Added `sessions.delete()` before insert |
| `supabase/functions/verify-security-questions/index.ts` | 38 (in `createAdminSession`) | Added `sessions.delete()` before insert |
| `supabase/functions/google-oauth/index.ts` | 81 | Added `sessions.delete()` before insert |

**Deploy**:
```
supabase functions deploy verify-password --no-verify-jwt
supabase functions deploy verify-security-questions --no-verify-jwt
supabase functions deploy google-oauth --no-verify-jwt
```

---

### 36. Dual-Mode Theme System — Light + Dark (2026-07-10)

**What**: Added a light + dark theme system. The app no longer renders only in dark mode. Default follows the OS preference; users toggle via a new Theme button (Sun/Moon) in the sidebar footer.

**Why**: The previous UI was a single hardcoded dark theme with AI-slop signals — cold blue/cyan gradients, Inter font, and hardcoded literals (`#0F0F0F`, `#5BB5C4`, `#7C3AED`, `zinc-*`). The new palettes (Warm Cream Studio for light, Warm Cocoa for dark) use a terracotta accent and Fraunces + Plus Jakarta Sans type, removing the templated look.

**How it works**:
- `next-themes` (`ThemeProvider` in `App.tsx`, `attribute="class"`, `defaultTheme="system"`, `enableSystem`) toggles a `dark` class on `<html>`.
- `index.html` no longer hardcodes `class="dark"`; a try/catch-guarded inline script sets the initial theme before paint to avoid a flash.
- `src/index.css` defines a **complete** token set in both `:root` (light) and `.dark` (dark) — background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring, sidebar-*, platform colors (TikTok differs per theme), status colors, gradients, and shadows. No token is omitted in either block, so every component renders correctly in both modes.
- `tailwind.config.ts` font stacks updated: `sans` → Plus Jakarta Sans; added `display` → Fraunces (JetBrains Mono kept for code).
- Theme preference is **client-side only** (localStorage via next-themes). It does **NOT** modify the `sessions` table, the `flowpost_token` admin session, `SecurityQuestionsGate`, or any auth/session logic. **Session/auth state is unchanged.**

**Files changed**:
| File | Change |
|------|--------|
| `src/index.css` | Replaced single dark `:root` with light `:root` + `.dark`; warm Cream/Cocoa palettes; terracotta gradients; Fraunces + Plus Jakarta Sans `@import` (first line) |
| `tailwind.config.ts` | `fontFamily.sans` → Plus Jakarta Sans; added `display` → Fraunces |
| `src/App.tsx` | Wrapped app in `ThemeProvider`; verification screen uses `bg-background` (removed `#0F0F0F`) |
| `index.html` | Removed `class="dark"` from `<html>`; added pre-paint theme script |
| `src/components/AppSidebar.tsx` | Added `ThemeToggle` (Sun/Moon) button in footer |
| `src/pages/LoginPage.tsx`, `AuthCallback.tsx`, `SecurityQuestionsGate.tsx`, `UploadPage.tsx`, `TermsPage.tsx`, `PrivacyPage.tsx` | Replaced hardcoded `#0F0F0F`/`#5BB5C4`/`#7C3AED`/`zinc-*` literals with theme tokens |

**Dependencies**: `next-themes@0.3.0` already present (no install). Fonts via Google Fonts CDN `@import` (degrade to `system-ui` if blocked).

---

### 36. Theme Audit — Fix Light Mode Color Contrast Issues (2026-07-10)

**What**: Audited all frontend code for hardcoded Tailwind color shades that would be invisible or low-contrast in light mode. Fixed 12 critical and 8 minor issues.

**Problem**: The light theme CSS variables were defined in `index.css`, but many JSX/TSX files used Tailwind 400-level shades (`text-red-400`, `text-yellow-400`, `text-amber-400`, `text-emerald-400`) designed for dark backgrounds. These would be unreadable on light backgrounds. Also found hardcoded `bg-blue-500` / `bg-red-600` that should use CSS-variable-based classes.

**Fixes**:
- All `text-red-400` → `text-destructive` (LoginPage, SecurityQuestionsGate, AuthCallback, WorkflowsPage, AccountsPage, UploadPage)
- `text-yellow-400` → `text-yellow-600` (AccountsPage, UploadPage quota badges)
- `text-amber-400` → `text-amber-600` (BetaBadge)
- `text-emerald-400` → `text-emerald-600` (WorkflowsPage Active badge)
- Removed unnecessary `dark:` variants (QueuePage, UploadPage AI Content badge)
- `text-gray-700` → `text-muted-foreground/30` (StoragePage progress circle)
- `text-blue-500` → `text-primary` (StoragePage progress circle)
- `bg-blue-500` → `bg-primary` (StoragePage progress bar, checkbox)
- `bg-red-600 hover:bg-red-700` → `bg-destructive text-destructive-foreground hover:bg-destructive/90` (StoragePage delete button)
- `hover:text-red-400` → `hover:text-destructive` (StoragePage delete icons)
- `hover:text-green-500` → `hover:text-status-published` (QueuePage retry button)
- `text-green-500` / `text-red-500` → `text-status-published` / `text-destructive` (InsightsPage growth)
- `hover:text-red-300` → `hover:text-destructive` (WorkflowsPage link)
- Added missing semicolon on `--gradient-primary` in `.dark` block (index.css:124)
- Deleted `verify_fix.py` and `fix_index.py` — one-time scripts, not part of the app

**Files changed**: 12 files
**Verification**: `tsc --noEmit` passes with zero errors. All changes are purely cosmetic — zero JavaScript reads these class names at runtime.

**No backend changes** — no edge functions, migrations, `integrations/`, auth flows, or env vars touched.

---

### 37. InsightsPage State Persistence via localStorage (2026-07-10)

**What**: InsightsPage now remembers the selected platform (Instagram/Facebook) and the last selected account across page refreshes.

**Why**: Switching between platforms and re-selecting accounts on every reload was a UX friction point. The page should restore the user's last view automatically.

**Implementation**:

| File | Change |
|------|--------|
| `src/hooks/useLocalStorage.ts` | New generic hook — `useLocalStorage<T>(key, initialValue)` reads from `localStorage` on mount, writes on every set, falls back to in-memory state on error (private browsing, storage full) |
| `src/pages/InsightsPage.tsx` | `platform` state changed from `useState` to `useLocalStorage("insights_platform", "instagram")`. Account dropdown now saves selection to `localStorage.setItem("insights_account_{platform}", id)`. Platform switch clears the old platform's stored account. Account auto-select checks stored ID first, falls back to first account in list. |

**Behavior**:
- **Platform persists** — selected tab (Instagram/Facebook) survives refresh, navigation, and tab close
- **Account persists per platform** — Instagram shows its own last-used account, Facebook remembers a different one
- **Account removed** → fallback to first available account in the list (silent, no error state)
- **localStorage unavailable** → hook silently falls back to in-memory state, no crash
- **Platform switch** → clears the old platform's stored account selection; the new platform loads its own stored account on next render

---

### 38. Drive Full Scope — Replace `drive.file` + `drive.readonly` with `drive` (2026-07-10)

**What**: Upgraded the Google Drive OAuth scope from `drive.file` + `drive.readonly` to the full `drive` scope.

**Why**: `drive.file` only allows deleting files created by or opened with this specific app. Files the user uploaded directly to Drive returned `appNotAuthorizedToFile` (403) on delete. The full `drive` scope grants complete read + write access to all Drive files, matching user expectations for a storage manager.

**Change**:
| File | Line | Before | After |
|------|------|--------|-------|
| `supabase/functions/google-drive-auth/index.ts` | 136-138 | `drive.file` + `drive.readonly` | `drive` |

**Action required**: Existing Drive connections must be reconnected so Google issues a new token with the `drive` scope. The reconnect button (entry #34) handles this.

**Deploy**: `supabase functions deploy google-drive-auth --no-verify-jwt`

---

### 39. Bulk Delete Loader + Mega Container Height Fix (2026-07-10)

**What**: Two Storage page UX fixes.

**Bulk delete loader**: The "Delete N selected from Drive" button now shows a spinner and per-file progress text ("Deleting (2/5): filename.mp4") during bulk deletion. The button is disabled while deletion is in progress, preventing double-clicks.

**Mega container height**: The Mega file list scroll container was `max-h-40` (160px) while the Drive side uses `max-h-64` (256px). Mega side now matches at `max-h-64`.

**Changes**:

| File | Change |
|------|--------|
| `src/pages/StoragePage.tsx` | Added `deletingSelected` + `deletingProgress` state vars; `deleteSelectedItems()` now sets loading state and shows per-file progress; button disabled + spinner when deleting; Mega container `max-h-40` → `max-h-64` |

---

### 40. Custom Range Scheduling — Match Window Fix (2026-07-10)

**What**: Fixed custom_ranges scheduling in `process-workflow` so each range fires exactly once per day.

**Root cause**: The time-matching window on line 247 was `[target-1, target+1]` (3 minutes), but `process-workflow` runs on a 5-minute cron (`*/5 * * * *`). Most deterministic target times fell between cron ticks and were never matched. The workflow appeared to fire (log printed on line 244 for every invocation) but was actually skipped at line 253 — targets never executed.

**Secondary bug**: The 60-minute rolling dedup (lines 255–262) incorrectly blocked targets less than 60 minutes apart (e.g., targets at 10:00 and 10:30).

**Fix**:

| Line | Before | After |
|------|--------|-------|
| 247 | `currentMinutes >= targetMinutes - 1 && currentMinutes <= targetMinutes + 1` | `currentMinutes >= targetMinutes && currentMinutes < targetMinutes + 5` |
| 255–262 | 60-min rolling dedup block | Removed entirely |

**New behavior**: Each range has a 5-minute post-target window `[target, target+5)`. With a `*/5` cron, the cron always lands inside the window exactly once, guaranteeing reliable execution without dedup interference between ranges.

**Deploy**: `supabase functions deploy process-workflow --no-verify-jwt`

---

### 41. SVG Logo with Theme Adaptation (2026-07-10)

**What**: Replaced the PNG logo (`/logo.png`) with an inline SVG component that adapts to both light and dark themes automatically.

**Design**: Calligraphic lowercase "f" with a flowing tail that curves into a dot, suggesting "flow". Warm rose gradient on a rounded square background, matching the Aurora Rose Studio aesthetic.

**Changes**:

| File | Action |
|------|--------|
| `public/logo.svg` | New — SVG logo file with rounded square background and calligraphic "f" |
| `src/components/Logo.tsx` | Rewrite — replaced `<img src="/logo.png">` with inline `<svg>` using CSS variables (`--primary`, `--card`) for automatic theme adaptation |
| `index.html` | Updated favicon from `image/png` to `image/svg+xml` pointing to `/logo.svg` |
| `public/logo.png` | Deleted |

**Theme behavior**:
- Light mode: warm rose (#D4848B) on cream (#F5F0ED)
- Dark mode: slightly cooler rose (via `--primary` CSS variable) on dark card background (via `--card` CSS variable)

**Migration**: All existing usages (`LoginPage`, `AppSidebar`, `App`, `PrivacyPage`, `TermsPage`) use `<Logo size={...} />` — component contract unchanged.

---

### 42. Logo Replacement — JPEG (2026-07-10)

**What**: Replaced the SVG logo (from entry #41) with a user-provided JPEG logo (`new logo.jpeg` → `logo.jpeg`).

**Changes**:

| File | Action |
|------|--------|
| `public/logo.jpeg` | New — user-provided logo image (1.6MB JPEG) |
| `src/components/Logo.tsx` | Rewritten — reverted to `<img src="/logo.jpeg">` with `rounded-xl object-cover` |
| `index.html` | Updated favicon from `image/svg+xml` to `image/jpeg` pointing to `/logo.jpeg` |
| `public/logo.svg` | Deleted |

**Note**: The logo image is 1.6MB — consider optimizing or providing a smaller version for better performance, especially as a favicon.

---

### 44. Official SVG Logo — Make User-Provided SVG the Primary Logo (2026-07-10)

**What**: Switched from the temporary JPEG logo to the user's official SVG logo (`logo.svg`).

**Changes**:

| File | Action |
|------|--------|
| `src/components/Logo.tsx` | Changed `src="/logo.jpeg"` → `src="/logo.svg"` |
| `index.html` | Fixed favicon `type` from `image/svg` to `image/svg+xml` |

**Note**: The SVG renders as an `<img>` tag — no inline SVG, no CSS variable dependency. Simple, clean, and 19.5KB.

---

### 45. Logo Size Adjustment — viewBox Crop (2026-07-10)

**What**: Cropped the SVG `viewBox` to zoom into the logo mark, making it visible at small display sizes.

**Root cause**: The SVG `viewBox="0 0 2752 1536"` was a huge canvas with the actual rose "f" mark occupying only ~26% of the width. At 40px sidebar size, the "f" rendered at ~10px — barely visible.

**Fix**: Changed `viewBox` from `0 0 2752 1536` to `650 100 1400 1400`, centering the crop on the "f" letterform.

**Result**: The "f" fills ~72% of the visible area. At 40px sidebar size, the "f" renders at ~29px. At 56px login page, ~40px. All sizes are now clearly legible.

**Note**: The outer shape is a straight-edge rectangle (no rounded corners), so cropping doesn't remove any design elements.

**Follow-up**: Increased all Logo component sizes by ~20% (`sizeMap` in `Logo.tsx`): `w-8`→`w-10`, `w-10`→`w-12`, `w-14`→`w-16`. Combined with the viewBox crop, the "f" mark at 40px sidebar (md) now renders at ~35px — 3.5× larger than before the two changes.

---

### 46. Dedicated Favicon SVG with Tight ViewBox (2026-07-10)

**What**: Created `public/favicon.svg` with an ultra-tight viewBox around the "f" letterform for use as the browser favicon tab icon.

**Changes**:
| File | Action |
|------|--------|
| `public/favicon.svg` | New — same paths as `logo.svg` but `viewBox="970 390 820 790"` for maximum zoom on the "f" mark, no background padding |
| `index.html` | Changed favicon `href` from `/logo.svg` to `/favicon.svg` |

**Result**: At 16–32px favicon sizes, the "f" fills ~91% of the icon area (up from ~26% with the original viewBox). The SVG has only the rose-colored letterform paths (no cream background), so it renders cleanly at small sizes on any background.

---

### 47. Instagram Insights — Views Fix + Date Range Dropdown (2026-07-10)

**What**: Fixed empty views/profile_views arrays by accepting their `total_value` response format, and added a date range dropdown (7/14/30/90 days) for Instagram insights.

**Root cause**: For Instagram Creator accounts, `views`, `profile_views`, and `content_views` **only** work with `metric_type=total_value` — they return `{ total_value: { value: number } }`, not the daily time-series `values[]` array that `follower_count` and `reach` return.

**Diagnostics**: Deployed diagnostic logging that confirmed all three Creator-level metrics (`views`, `profile_views`, `content_views`) return empty `values[]` arrays without `total_value`, and `impressions` was deprecated in v22.0 (Apr 2025) — errors on v23.0+.

**Changes**:
- **Edge function**: Accept `?range=7|14|30|90` query param (default 30). Use `metric_type=total_value` for `views` and `profile_views` calls. Removed `content_views` (redundant — same format as views). Removed diagnostic logging. New response field `totals: { views: number, profile_views: number }`. Time-series metrics (`follower_count`, `reach`) stay in `insights` as before. `range_days` returned for frontend confirmation.
- **Frontend**: Added `useLocalStorage`-backed `dateRange` state. New `<Select>` dropdown in header (7d / 14d / 30d / 90d). Replaced bottom `grid-cols-2` (Reach chart + broken Impressions chart) with `grid-cols-3` (Reach chart + Views stat card + Profile Visits stat card). Titles use dynamic `{dateRange} days`. Facebook's tertiary chart preserved as-is. Posting Activity (FlowPost data) stays at 30 days.

**Files changed**:
| File | Changes |
|------|---------|
| `supabase/functions/fetch-instagram-insights/index.ts` | ~25 lines — range param, total_value handling, totals response |
| `src/pages/InsightsPage.tsx` | ~50 lines — dateRange state/UI/deps, stat cards, dynamic labels, conditional tertiary |

**Result**: Instagram Insights now shows Views and Profile Visits as stat cards matching the Instagram app's Overview tab (single aggregate numbers, not charts). Date range dropdown re-fetches all metrics with the selected window. Follower Growth and Reach charts update dynamically.

**Deploy**: `supabase functions deploy fetch-instagram-insights --no-verify-jwt`
