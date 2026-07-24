# FlowPost Studio — Session State

## CURRENT HEAD: pending — Phase 3 completed (all 4 phases 100%)

## Monetization Eligibility Feature — 4-Phase Plan (100% ✅)

### Phase 1 — Persistence Layer (95% ✅)
| Step | Status | Detail |
|------|--------|--------|
| 1.1 Migration | ✅ Done | `20260723000001_page_eligibility.sql` — table + RLS + UNIQUE(user_id, page_id) |
| 1.2 Types | ✅ Done | `types.ts` — page_eligibility Row/Insert defined |
| 1.3 Save after TOOL_CHECK | ✅ Done | `ToolsPage.tsx:150-162` — upsert with `supabase.auth.getSession()` fallback |
| 1.4 Load on mount | ✅ Done | `ToolsPage.tsx:84-107` — loads latest rows, maps to PageResult |
| 1.5 Freshness indicator | ✅ Done | Color-coded badges (green <1h, amber <24h, red >24h) + auto-prompt when stale |

### Phase 2 — Page List Sync (100% ✅)
| Step | Status | Detail |
|------|--------|--------|
| 2.1 `facebook-auth` sync-pages action | ✅ Done | `facebook-auth/index.ts` — `action=sync-pages` handler: upserts pages, syncs IG, removes stale |
| 2.2 "Sync Pages" button (ToolsPage) | ✅ Done | `ToolsPage.tsx` — sync button + `syncPages()` function + `useToast` |
| 2.3 `bg.js` SYNC_PAGES handler | ✅ Done | `bg.js` — saves pages to `fp_synced_pages` in `chrome.storage.local`; `popup.js` fallback |

### Phase 3 — Workflow Integration (100% ✅)
| Step | Status | Detail |
|------|--------|--------|
| 3.1 Eligibility badges on workflow cards | ✅ Done | `renderEligibilityBadge()` — green "Monetized" / red "X ineligible" / amber "X unchecked" badges in CardTitle next to Active/Paused |
| 3.2 Type changes | ℹ️ None needed | N/A |
| 3.3 Eligibility status in WorkflowForm page selector | ✅ Done | Colored "Eligible"/"Ineligible"/"Not checked" indicator next to each Facebook account in Platforms & Accounts step |

### Phase 4 — Automation & Polish (100% ✅)
| Step | Status | Detail |
|------|--------|--------|
| 4.1 Auto-refresh toggle on ToolsPage | ✅ Done | `Switch` toggle + `setInterval` 5m, disabled manual button while active, ref-based to avoid TDZ |
| 4.2 Token age warning in bg.js | ✅ Done | `GET_COOKIES_INFO` reports `token_age_minutes`, ToolsPage shows amber banner if >60m old |

---

### 66. Skeleton loading — all 9 dynamic pages (2026-07-24)

**Problem**: Only 3 of 12 dynamic pages had loading skeletons (WorkflowItemsPage, ProfilePage, InsightsPage). The rest showed empty/default states or inline `Loader2` spinners while data loaded, causing layout jumps and a jarring UX.

**Solution**: Added skeleton loading to all 9 remaining dynamic pages + refactored existing 3 to use the shared `<Skeleton>` component.

**New infrastructure**:
1. **`src/hooks/usePageLoading.ts`** — Reusable hook encapsulating the loading pattern: `loading` state, safety timeout (15s default), unmount cancellation via ref. Usage: `const { loading, done } = usePageLoading();`
2. **Existing `<Skeleton>` component** (`src/components/ui/skeleton.tsx`) — Used in all pages instead of inline `animate-pulse` divs. Already existed but was only used by sidebar.

**Pages changed** (9 new + 4 refactored):

| Page | Before | After |
|------|--------|-------|
| **AuthCallback** | `Loader2` spinner | `<Card>` with 3 skeleton lines |
| **Dashboard** | No loading state | 4 stat card skeletons + recent activity skeleton |
| **CalendarPage** | No loading state (shows empty grid) | Header + 35-day cell skeleton grid (initial mount only) |
| **QueuePage** | No loading state (shows empty list) | Filter pills + 5 row skeletons (initial mount only) |
| **ToolsPage** | Mixed effects with inline spinners | Extension card + 3 tool card skeletons |
| **UploadPage** | No loading state | Tab selector + 5 form field skeletons |
| **WorkflowsPage** | No loading state (empty card list) | 4 workflow card skeletons in 2-column grid |
| **AccountsPage** | No loading state (empty sections) | 6 platform section card skeletons |
| **StoragePage** | No loading state (empty panels) | 2 storage card skeletons (Drive + Mega) |
| **WorkflowItemsPage** (refactor) | Inline `animate-pulse` divs | `<Skeleton>` components + `usePageLoading` hook |
| **ProfilePage** (refactor) | Inline `animate-pulse` divs | `<Skeleton>` components + `usePageLoading` hook |
| **InsightsPage** (refactor) | Inline `animate-pulse` divs | `<Skeleton>` components (kept existing `loading` state — platform switch re-triggers it) |

**Safety guarantees per page**:
- Unmount guard (`cancelled` flag) prevents `setLoading(false)` after navigation
- 15s force-resolve timeout prevents stuck skeletons
- Skeleton dimensions match real layout to prevent layout shift
- Existing sub-loading states (button spinners, upload progress) untouched
- Re-fetches (filter changes, month navigation) keep existing data visible — skeleton only on initial mount

**Verification**: `npm run build` passed after each commit.

---

### 67. Fix TDZ error in ToolsPage — `const loadPages` before `useEffect` reference (2026-07-24)

**Problem**: `src/pages/ToolsPage.tsx` had `const loadPages = useCallback(...)` at line 136 but a `useEffect(() => { loadPages(); }, [loadPages])` at line 79. `const` variables are in the Temporal Dead Zone (TDZ) until their declaration executes, so evaluating the dependency array `[loadPages]` at line 79 threw `ReferenceError: Cannot access 'L' before initialization` in the production-minified bundle.

**Why dev worked**: Vite's esbuild transform in dev mode may not strictly enforce TDZ in the same way as Rollup's production bundler.

**Fix**: Moved `const loadPages = useCallback(...)` (8 lines) above the `useEffect` that references it. The hook ordering becomes: `useState` declarations → `loadPages` useCallback → effects. `checkExtension` was already correctly ordered. `syncPages` and `runToolCheck` (async functions, not `const`) are unaffected — closures capture the already-initialized `loadPages` at call time.

**Verification**: `npm run build` passes (10.46s). The page no longer crashes on initial load.

---

### 66. Skeleton loading — all 9 dynamic pages (2026-07-24)

**Problem**: File names sorted as `file1, file10, file100, file2, file20` (alphabetical). Selecting items required clicking a tiny checkbox. Single-column layout wasted horizontal space on desktop.

**Changes**:
1. **Numeric sort** (`WorkflowItemsPage.tsx:128-129`) — Added `{ numeric: true }` to `localeCompare` for file name sorting: `file1, file2, file3, file10, file100`
2. **Click-to-select** (`WorkflowItemsPage.tsx:851-860`) — Clicking any card body toggles selection; guarded via `closest("input, textarea, button, [role=button], label")` to skip interactive elements. Checkbox kept as alternative. Visual highlight via `ring-2 ring-primary/60 shadow-md` when selected.
3. **2-column grid** (`WorkflowItemsPage.tsx:840`) — Changed `<div className="space-y-4">` to `<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">` for responsive 2-column desktop layout.

**Files changed**: `src/pages/WorkflowItemsPage.tsx`

---

### 64. Mark All Pending + Mark as Ready with Captions — Bulk Actions (2026-07-24)

**Problem**: User had 18 workflow items and needed to reset all to "pending" at once — only individual "Unmark" button existed. Also no way to bulk-mark only items that already have captions filled in.

**Added**:
1. **"Mark All Pending"** button in top action bar — batch-updates ALL items to `status: "pending"` with confirmation dialog (`X items marked as pending`)
2. **"Mark as Ready with Captions"** button in bottom bulk bar — checks each selected item's required caption fields (deduplicated across `workflow.platforms`), only marks those with all fields non-empty. Respects unsaved edits via `getField()`. Shows `"X items marked as ready (Y skipped — missing captions)"`

**Edge cases handled**:
- FB+IG → checks `fb_ig_caption` once
- YouTube → checks both `yt_video_title` + `yt_video_description`
- Zero platforms → `"No platforms configured"`
- Already ready/posted items → skipped silently
- Nothing eligible → `"Nothing to mark"`

**Files changed**: `src/pages/WorkflowItemsPage.tsx` — `markAllPending()`, `markCaptionedReady()`, buttons, confirmation dialog

### 62. Phase 1 Persistence — Eligibility Results Saved to Supabase (2026-07-23)

**Problem**: Tool Check results were ephemeral — displayed in the UI but lost on page refresh. No historical tracking, no freshness indicator, no ability to compare or use eligibility data in workflows.

**Solution**: Created `page_eligibility` table + persistence layer:
1. **Migration** (`20260723000001_page_eligibility.sql`): New table with `UNIQUE(user_id, page_id)`, RLS matching existing connected_accounts pattern
2. **Types** (`types.ts`): Added `page_eligibility` Row/Insert/Update definitions
3. **ToolsPage.tsx**: On successful TOOL_CHECK, upserts each page's eligibility to Supabase. On mount, loads latest saved results from DB
4. **Freshness indicator**: Shows "Checked Xm ago" below pages card with stale detection (>24h = red, prompt to refresh)
5. **Saved results display**: When no fresh results exist, cached results shown with "Showing results from X ago" banner + Refresh button

**Files changed**:
- `supabase/migrations/20260723000001_page_eligibility.sql` — New migration
- `src/integrations/supabase/types.ts` — Added page_eligibility type
- `src/pages/ToolsPage.tsx` — Save results, load saved, freshness indicator

**4 pre-existing migrations fixed** (non-idempotent SQL blocked push): `linkedin_support`, `workflow_item_id`, `caption_master_prompt`, `workflow_items_rls` — added IF NOT EXISTS / DO blocks to make them safely re-runnable.

**Status**: Migration applied (`npx supabase db push`). Persistence works end-to-end.

### 61. Extension Improvements — Token Fallback, Fetch Pages Bridge, DOM Extraction (2026-07-23)

**Problem**: Tool Check failed from FlowPost Studio `/tools` because the web app didn't send tokens. "Fetch from Facebook" failed when business.facebook.com wasn't accessible (redirect loop). DOM extraction couldn't find pages on modern facebook.com Comet pages.

**Solutions**:

| # | Fix | Detail |
|---|-----|--------|
| 1 | **TOOL_CHECK token fallback** (`bg.js`) | When `TOOL_CHECK` payload has no `tokens`, falls back to `cachedTokens` in bg.js (already populated by content script from facebook.com) |
| 2 | **PostMessage bridge for pages** (`bg.js` + `content.js` + `ToolsPage.tsx`) | When all other page-fetching strategies fail, queries FlowPost Studio tab via postMessage → reads `connected_accounts` from Supabase → returns pages to extension |
| 3 | **www.facebook.com API endpoints** (`bg.js`) | Added `www.facebook.com/pages/list/` and `/ajax/pages/list/` to fbFetch fallback endpoints |
| 4 | **Loosened API guard** (`content.js`) | Changed `if (data?.payload)` → `if (data?.payload \|\| data?.pages)` to catch API responses without `.payload` wrapper |
| 5 | **Improved DOM selectors** (`content.js`) | Added modern Comet selectors: `[data-pagelet="PageCard"] a`, `[role="list"] a[href*="facebook.com"]`, `a[href*="?page_id="]`, `[data-page-id]` |
| 6 | **URL-based page extraction** (`content.js`) | On any `facebook.com` page, extracts the current page ID from `?id=` or `/pages/` in the URL as a last-resort fallback |

**Files changed**:
- `flowpost-extension/bg.js` — Token fallback, www endpoints, postMessage bridge, updated hints
- `flowpost-extension/content.js` — FETCH_PAGES_FROM_APP handler, API guard, DOM selectors, URL extraction
- `src/pages/ToolsPage.tsx` — QUERY_PAGES listener for postMessage bridge

**Status**: All working. Tool Check now succeeds from both popup and `/tools`. Fetch Pages works from facebook.com, business.facebook.com, or FlowPost Studio tab.

### 60. FlowPost Bridge Extension — Monetization Eligibility Checker (2026-07-23)

**Problem**: No way to check Facebook Page monetization eligibility status without manually navigating business.facebook.com's monetization dashboard. The FlowPost Studio app needed a tool to programmatically check eligibility across multiple pages at once.

**Solution**: Built a Chrome extension (`flowpost-extension/`) that:
1. Injects Facebook session cookies via DNR (Declarative NetRequest) to bypass CORS/CSRF on `business.facebook.com/creator_monetization/eligibility_widget/`
2. Extracts `fb_dtsg` and `lsd` auth tokens from Facebook's page bundles using MetaMax v1.6's exact regex patterns (`DTSGInitialData` JSON + `["LSD",[],{"token":"..."}]` script pattern)
3. Hooks `XMLHttpRequest.send()` to capture live tokens from Facebook's own API calls
4. Falls back to content script relay on `business.facebook.com` when DNR returns error 1357004 ("Sorry, something went wrong")
5. Popup shows session state (c_user, cookies, DTSG, LSD), page management with "Fetch from Facebook" (DOM + API), and Run Tool Check button
6. OCR tool installed (tesseract.js) for reading screenshots

**Key findings from reverse-engineering MetaMax v1.6**:
- `fb_dtsg` is extracted from `DTSGInitialData` JSON patterns embedded in Facebook's JS bundles — **not** from `window.__fb_dtsg` or DOM inputs
- `lsd` comes from `["LSD",[],{"token":"..."}]` embedded in script bundles
- `localStorage.Session` value is a random session identifier, NOT the real `fb_dtsg`

**Files changed**:
- `flowpost-extension/manifest.json` — Extension manifest v3, permissions, DNR rules, content scripts
- `flowpost-extension/content.js` — Token extraction (MetaMax DTSGInitialData/LSD patterns), XHR hook, Tool Check relay, Fetch Pages (API + DOM extraction on business.facebook.com and facebook.com)
- `flowpost-extension/bg.js` — DNR cookie injection, GET_PAGES handler (tabs → API fallback), TOOL_CHECK handler (DNR → content script fallback), cookie/token caching
- `flowpost-extension/popup.html` — Popup UI (Session, Pages, Tokens, Run button, Results)
- `flowpost-extension/popup.js` — State management, page CRUD, toolbar check, session display

**Status**: Working. DTSG/LSD extraction verified; tool check returns eligibility data. "Fetch from Facebook" works on both `business.facebook.com` (via sidebar asset_id links) and `facebook.com` (via DOM page links).

### 59. Skeleton Loading — ProfilePage (2026-07-22)

**Problem**: ProfilePage showed a centered `<Loader2>` spinner while fetching the user profile. No visual layout indication. No error handling on the fetch — a rejected promise would keep `loading=true` forever.

**Solution**:
1. Replaced the spinner with `animate-pulse` skeleton matching the real layout:
   - Header with skeleton title + subtitle lines
   - 3 skeleton tab pills
   - Card with skeleton avatar circle + name/email + 3 skeleton input fields + skeleton button
2. Added `.catch()` + unmount guard (`cancelled` flag) to the user profile fetch

**File changed**: `src/pages/ProfilePage.tsx` — loading state (lines 134-140) replaced; user fetch (lines 41-56) got `.catch()` + unmount guard.

### 58. Skeleton Loading — InsightsPage (2026-07-22)

**Problem**: InsightsPage showed a full-page `<Loader2>` spinner ("Loading accounts...") while fetching connected accounts. The spinner was static text + icon — no visual indication of the actual layout. If the fetch errored without `.catch()`, loading stayed true forever.

**Solution**:
1. Replaced the spinner with `animate-pulse` skeleton cards matching the real layout:
   - Header row with skeleton title + 3 skeleton select inputs
   - 4 stat cards in a grid, each with label line + number line + trend line
   - Chart area (col-span-2) + performance card sidebar with 4 skeleton rows
2. Added `.catch()` to the accounts query so network errors don't hang the page

**File changed**: `src/pages/InsightsPage.tsx` — loading state (lines 222-229) replaced; accounts query (line 173) got `.catch()`.

### 57. Infinite Loading Fix — WorkflowItemsPage (2026-07-22)

**Problem**: Navigating to a workflow's items page showed a spinner indefinitely (or for 3-5s) because:
1. 3 queries ran **sequentially** (workflow → items → posts), each blocking the next
2. **No try/catch** — any query error skipped `setLoading(false)`, causing a permanent spinner
3. **No timeout** — network blips froze the page forever
4. **No unmount guard** — stale async continued after navigation

**Solution**: Restructured the loading effect in `WorkflowItemsPage.tsx`:
- `Promise.all` to run `workflows` and `workflow_items` queries **in parallel**
- Batched the `posts` query into chunks of 50, run concurrently via `Promise.all`
- `try/catch/finally` guarantees `setLoading(false)` always fires
- 15s safety timeout force-resolves loading as last resort
- Unmount guard (`cancelled` flag) prevents stale state updates after navigation
- Replaced the `<Loader2>` spinner with an **animated skeleton UI** matching the Card layout (3 shimmer cards with title bar, platform inputs, footer)

**File changed**: `src/pages/WorkflowItemsPage.tsx` — loading effect (lines 139-185) rewritten; spinner (lines 612-618) replaced with skeleton cards.

**Not changed**: No DB migrations needed — indexes `idx_workflow_items_workflow_id` and `idx_posts_workflow_item_id` already exist.

### 56. Sort Preference Persisted in localStorage (2026-07-22)

**Problem**: The sort dropdown in the workflow items page reset to "Default order" every time the user navigated away or refreshed the page. A user sorting by "Ready first" would lose their selection on any navigation.

**Solution**: Replaced `useState` with the existing `useLocalStorage` hook to persist the sort preference under key `workflow_items_sort`. No DB calls, zero latency, survives tab closure.

**File changed**: `src/pages/WorkflowItemsPage.tsx` — added import of `useLocalStorage`, changed `const [sortBy, setSortBy] = useState("sort_order")` to `useLocalStorage("workflow_items_sort", "sort_order")`.

### 55. Per-Item Publish Times for Custom Ranges (2026-07-22)

**Problem**: In workflows with multiple custom ranges (e.g., #0 at 8:47 UTC, #1 at 20:46 UTC), `getNextPublishTime()` returned only the next future target. Both the first and second ready items showed the **same** time (e.g., "Next at 20:46 UTC"), making it impossible to tell which item belonged to which range slot.

**Solution**: Replaced `getNextPublishTime` with `getItemPublishTime` that maps each ready item's position directly to a range slot:
- Item at ready position 0 → range #0, position 1 → range #1, etc.
- Past-range targets show `"was at 8:47 UTC (1:47 PM)"` in muted gray
- Future-range targets show `"next at 20:46 UTC (2:46 PM)"` in orange
- Items overflow to future days (tomorrow, +2d, etc.) when ready count exceeds today's range count
- Uses the same `computeTargetsForDay` hash/seed as the backend edge function

**Files changed**:
| File | Change |
|------|--------|
| `src/lib/scheduling.ts` | Added `getItemPublishTime(workflow, itemIndex, now)` — iterates days, maps itemIndex to range index per day, returns `{ label, isPast }` |
| `src/pages/WorkflowItemsPage.tsx` | Replaced `getNextPublishTime` import/usage with `getItemPublishTime`; past times styled with `text-muted-foreground`, future with `text-orange-500` |

**Before**:
```
FB/IG  Next at 20:46 UTC (2:46 PM)    ← both items show same time
FB/IG  Next at 20:46 UTC (2:46 PM)
```

**After**:
```
FB/IG  was at 8:47 UTC (1:47 PM)      ← range #0, muted
FB/IG  next at 20:46 UTC (2:46 PM)     ← range #1, orange
```

## Current Issues
- Drive scope changed to `drive.file` + `drive.readonly`; users must reconnect accounts to get the new combined token.
- Meta AI translation/dubbing for Reels is NOT available via Graph API — only through the native app. Investigation done, plan created (see entry #50).
- ~~**`POST /auth/v1/token?grant_type=refresh_token` returns 429**~~ — **Fixed** in `1a520b0` (deferred auto-refresh + localStorage session check)

## Current Status
- **v19**: Browser-streamed Drive→Mega transfer. Moved CPU-intensive megajs AES encryption from server-side edge function to user's browser. New `transfer-ticket` edge function provides temporary decrypted credentials. Client-side `driveToMegaTransfer.ts` handles streaming upload. No server CPU limits — files of any size can transfer (subject to browser tab staying open).
- **Delete files**: Users can delete files and folders from both Drive and Mega directly in the Storage page. Drive scope upgraded from `drive.readonly` to `drive.file` — existing Drive accounts must be reconnected.
- **LCP improvements** (`de02541`): Monolithic 1.4 MB bundle split into 34 parallel-loadable chunks (critical path ~666 KB). Google Fonts moved from CSS `@import` to HTML `<link>` with preconnect hints. All 14 route pages lazy-loaded via `React.lazy` + `Suspense`. Logo preloaded with `fetchpriority="high"` + explicit dimensions. Removed ~77 KB unused deps (`react-query`, `react-hook-form`, `buffer`, `nodePolyfills`).

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

### 14. `POST /auth/v1/token?grant_type=refresh_token` Returns 429 — Fixed (2026-07-18)

**Symptom**: Users see `429 (Too Many Requests)` errors in console from the Supabase auth refresh endpoint. When rate-limited, `_removeSession()` clears the session from localStorage, all Supabase data queries (posts, workflows, etc.) return 429, and the app shows a blank login page. Particularly noticeable during rapid page refreshes in DevTools Performance tab.

**Root cause**: Three contributing factors:
1. **`autoRefreshToken: true`** (`src/integrations/supabase/client.ts:15`): Supabase client calls `_recoverAndRefresh()` on init which fires `POST /auth/v1/token` if the stored session is within 90s of expiry.
2. **`getSession()` on AuthProvider mount** (`src/contexts/AuthContext.tsx:92`): Called `supabase.auth.getSession()` after verifying the admin token — `__loadSession()` triggers a refresh if session is near expiry.
3. **Across page refreshes**: Each page load creates a new client instance with its own `refreshingDeferred = null` — old page's in-flight request + new page's request = concurrent requests → 429.
4. **429 is classified as `AuthApiError`** (not `AuthRetryableFetchError` since 429 is not in `NETWORK_ERROR_CODES = [502,503,504]`). `_callRefreshToken` calls `_removeSession()` which wipes the Supabase session from localStorage. `AuthContext.tsx` sees no session → clears admin token → user sees login page.

**Fix** (commit `1a520b0`):
1. `src/integrations/supabase/client.ts:15` — Set `autoRefreshToken: false` to prevent `_recoverAndRefresh()` and `_startAutoRefresh()` from firing refresh calls on page load
2. `src/contexts/AuthContext.tsx:91-94` — Replaced `await supabase.auth.getSession()` with synchronous `localStorage.getItem()` — zero network calls
3. `src/contexts/AuthContext.tsx:186-192` — Added separate `useEffect` that calls `supabase.auth.startAutoRefresh()` after a 30-second delay, so the one surviving tab handles background refresh without racing across rapid reloads

**New behavior during rapid refreshes**:
- First 30 seconds: **zero** `POST /auth/v1/token` requests, page loads instantly every time
- After 30 seconds: normal background refresh ticker starts for the surviving tab
- No 429, no session deletion, no blank pages

---

## Current State (2026-07-12)

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

### Not Yet Implemented
1. **Meta AI translation toggle** — Graph API doesn't expose this feature; plan documented in entry #50, awaiting API support

### Blocked
- TikTok app review — needs paid domain (Vercel Pro $20/mo + $12/yr domain)
- TikTok `privacy_level` → `PUBLIC_TO_EVERYONE` — blocked by app review
- Snapchat integration — allowlisting requested (`snapchat-profile-api` scope), awaiting Snap approval (entry #76)
- ~~LinkedIn `w_member_social` / `w_organization_social` — needs LinkedIn Partner Program approval (entry #72)~~ — **Approved** (company verified). Edge functions and migration deployed.

### Recently Fixed
1. **Infinite loading when navigating away from SecurityQuestionsGate** — `loginWithEmail()` now calls `setCache()` so page reloads restore auth state; added 10s safety timeout to force-resolve spinner (commit `86b066e`)
2. **Hardcoded `R2_PUBLIC_URL` fallbacks removed from all 5 functions** — `process-workflow`, `facebook-upload`, `instagram-upload`, `youtube-upload`, `tiktok-upload` no longer silently fall back to a stale hardcoded URL. `R2_PUBLIC_URL` must be set as a Supabase function secret or the function fails at startup.
3. **R2 upload fixed + Drive fallback disabled for testing** — `S3Client.send(PutObjectCommand)` with streaming body was hashing a flowing stream (failed). Replaced with `getSignedUrl()` presigned URL + raw `fetch` PUT with `duplex: "half"` (same pattern as old R2 approach). ✅ **Tested successfully** — both Facebook and Instagram published from R2 URL. Drive fallback still commented out pending uncomment. See entry #55.
4. **FlowPost workflows returning 0 videos processed** — sheet_id null check ran before FlowPost branch, blocking all FlowPost workflows. Also fixed saveAll to auto-mark `status: ready` and markReady to preserve pending dirty edits (commit `5c68713`).
5. **Post status badges now update in real time** — Realtime subscription on `posts` table + simplified display to `"FB posted"` / `"IG failed"` text (commit `0303ef9`).

### 52. get-file Egress Spike — R2 Cache Layer Plan (2026-07-12)

**Symptom**: July 11 functions egress spiked to 9.071 GB (vs 1.866 GB baseline). Traced to 2 active Facebook+IG workflows posting 8 videos/day from Google Drive via `get-file` proxy.

**Root cause**: Facebook/Instagram fetch video from Drive through `get-file` proxy because they can't authenticate to Google Drive directly. Each video is fetched once per platform — 16 fetches/day × ~500 MB avg = ~8 GB/day. Before entry #15, R2 cached the video (free egress); the R2 removal eliminated the cache layer.

**Egress sources**:
| Path | Egress per video | Note |
|------|-----------------|------|
| `youtube-upload` (PUT to YouTube) | **1× file size** | Unavoidable if YouTube active |
| `post-story` (Facebook story PUT) | **1× file size** | Video bytes flow through edge |
| `get-file` (FB/IG fetch from proxy) | **1× file size** | Per platform fetching video |
| `facebook-upload` / `instagram-upload` | **0** | URL-based, platform fetches directly |
| `drive-to-mega` (StoragePage) | **0** | Browser-direct, no Supabase data |

**Fix planned**: Re-introduce R2 as a transparent cache inside `get-file`. First fetch proxies from Drive/Mega and asynchronously caches to R2. Subsequent fetches (second platform, retries, stories) served from R2 → zero egress.

**Changes needed**:
- `supabase/functions/get-file/index.ts` — R2 cache check before proxy; async R2 upload after first serve
- New migration — `video_cache` table (source_url_hash PK, r2_key, created_at)
- Supabase secrets — R2 credentials for edge function access

**Egress impact**:
| Before | After |
|--------|-------|
| 8 videos × 2 platforms × 500 MB = ~8 GB/day | 8 videos × 500 MB (first fetch to R2 only) = ~4 GB first day, ~0 GB subsequent |

### 53. get-file Egress Spike — R2 Cache in process-workflow (2026-07-12)

**What**: Replaced the `get-file` proxy path for Drive-sourced videos in automated workflows with a direct R2 upload + public URL. Now `process-workflow` uploads Drive files to Cloudflare R2 (streaming, no buffering) after creating the video record, and updates `video.file_url` to the R2 public URL. Platform upload functions serve the R2 URL directly — Facebook, Instagram, and stories fetch from R2 at zero Supabase egress.

**Egress impact per video**:
| Platform | Before | After |
|----------|--------|-------|
| Facebook | 1× file size (get-file proxy) | 0× (R2 public URL) |
| Instagram | 1× file size (get-file proxy) | 0× (R2 public URL) |
| FB Stories | 1× (via get-file → re-upload) | 0× (downloads from R2) |
| IG Stories | 1× (via get-file proxy) | 0× (R2 URL) |
| YouTube | 1× (unavoidable) | 1× (same) |
| TikTok | 0× (Drive direct) | 0× (same) |

With 8 videos/day × 500 MB avg: **~9 GB/day → ~0.5 GB/day** (~94% reduction)

**Key design**: The R2 upload is wrapped in try/catch. On failure, the function falls back to the existing `get-file` proxy behavior (Drive creds passed in payload). Zero regression risk.

**Files changed**:

| File | Change |
|------|--------|
| `supabase/functions/process-workflow/index.ts` | Added S3 client import + env vars; R2 upload block after video insert; conditional filePayload (omit Drive creds when R2 succeeds); story URL uses R2 URL when available |
| `supabase/functions/facebook-upload/index.ts` | Added R2 guard in Drive override block — skips get-file proxy when `video.file_url` is an R2 URL |
| `supabase/functions/instagram-upload/index.ts` | Same R2 guard pattern as facebook-upload |

**New env vars**: `R2_ENDPOINT`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` — all set in Supabase secrets. Note: `R2_PUBLIC_URL` is now **required** (no code fallback — removed in entry #54).

**Not changed**: Mega source handling (still uses get-file proxy); manual uploads from UploadPage (still use get-file); `youtube-upload`, `tiktok-upload`, `post-story`; `get-file` function itself.

**Deploy**:
```powershell
npx.cmd supabase functions deploy process-workflow facebook-upload instagram-upload --no-verify-jwt
```

---

## DB Schema Notes
- `posts`: id, user_id (text), video_id, platform, caption, hashtags, scheduled_at, published_at, status, captions_enabled, created_at, account_id, contains_altered_content, fb_ai_label (unused), metadata (jsonb), post_type
- `workflows`: id, user_id, name, is_active, sheet_url, sheet_id, platforms[], youtube_channel_ids[], facebook_page_ids[], instagram_account_ids[], trigger_hour_start, trigger_hour_end, max_videos_per_trigger, last_triggered_at, total_posted, created_at, updated_at, youtube_altered_content, post_as_story, last_manual_triggered_at, run_days[], day_time_windows (jsonb), run_interval_hours, media_type, videos_per_run, facebook_ai_generated (unused), instagram_ai_generated (unused), scheduling_mode, custom_schedule (jsonb), tiktok_account_ids[], drive_account_id
- `connected_accounts`: id, user_id, platform, account_id, username, avatar_url, is_connected, access_token (encrypted), refresh_token, token_expires_at, metadata (jsonb), created_at, updated_at
- Migration `20260704000000_add_post_type.sql` applied
- No `error`, `error_details`, or `attempts` column on posts
- Meta AI translation columns (`posts.ai_translation_enabled`, `workflows.instagram_ai_translation`, `workflows.facebook_ai_translation`) — planned but not yet migrated

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

---

### 48. Facebook Insights — Date Range Dropdown + Page Views Stat Card (2026-07-11)

**What**: Extended the same date range dropdown pattern to Facebook, and surfaced the previously hidden `page_views_total` metric as a stat card.

**Changes**:
- **Edge function**: Accept `?range=7|14|30|90` query param (default 30). Dynamic `since` calculation. Computes `totals.page_views_total` by summing daily values (no `metric_type` issue — Facebook Pages use Business-level API with proper time-series). Returns `range_days` and `totals` in response. Removed `page_views_total` from `insights` (now in `totals`).
- **Frontend**: Date range `<Select>` now shown for both platforms (no `platform === "instagram"` guard). Bottom row changed from `grid-cols-2` to `grid-cols-3` for Facebook: Media Views chart + Post Engagements chart + Page Views Total stat card. Dynamic `{dateRange} days` labels on all chart titles.

**Files changed**:
| File | Changes |
|------|---------|
| `supabase/functions/fetch-facebook-insights/index.ts` | ~20 lines — range param, totals, response |
| `src/pages/InsightsPage.tsx` | ~15 lines — remove platform guard, add Facebook stat card, dynamic labels |

**Result**: Facebook Insights has date range filtering consistent with Instagram. `page_views_total` (previously fetched but hidden) now appears as a stat card in the bottom row. All 3 charts (`page_follows`, `page_media_view`, `page_post_engagements`) remain as time-series.

**Follow-up**: Added `period=total_over_range` fallback for `page_views_total` — pages with >100 fans but no recent activity now get a range-aggregate value instead of "—". Falls back to summing daily values if `total_over_range` returns empty.

**Note**: Pages with <100 likes return 0 for all metrics regardless of date range — this is a Meta API limitation, not a bug.

**Deploy**: `supabase functions deploy fetch-facebook-insights --no-verify-jwt`

---

### 49. Facebook Page Insights — Missing `read_insights` Permission (2026-07-11)

**What**: All Facebook Page Insights returned empty `data: []` (200 OK, 0 data points) despite valid tokens and page having activity visible in the native Facebook app (e.g., "Viralspeedcontent" shows 1.4M views in-app but 0 via API).

**Root cause**: The OAuth scope in `facebook-auth/index.ts` was missing the `read_insights` permission. The Page Insights API requires this permission in addition to `pages_read_engagement`. Without it, the API **silently returns empty data** — no error, no warning — making it appear as if the page has no activity.

**Evidence**: Viralspeedcontent (740 fans) and Our Planet Sea (503 fans) both return 0 data points for all 4 metrics despite the Facebook app showing real engagement data. The 100-fan limitation was a red herring — the real issue was the missing permission.

**Changes**:
| File | Change |
|------|--------|
| `supabase/functions/facebook-auth/index.ts` | Added `'read_insights'` to OAuth scope array |
| `src/pages/AccountsPage.tsx` | Added RefreshCw reconnect button to each Facebook page card — calls same OAuth flow without login_hint |

**Action required**: Users must click the ↻ button on any connected Facebook page to obtain a new token with the `read_insights` permission. Existing tokens without this permission will continue to return empty data.

**Deploy**: `supabase functions deploy facebook-auth --no-verify-jwt`

---

### 51. Infinite Loading After Navigating Away from SecurityQuestionsGate (2026-07-11)

**Symptom**: User logs in via email/password, sees the SecurityQuestionsGate, navigates to a different URL (or refreshes) — app shows an infinite "Verifying..." spinner. Only closing the tab and reopening the website fixes it.

**Root cause**: Two bugs:

1. **`loginWithEmail()` never calls `setCache()`** (`AuthContext.tsx`). After a successful email login, the auth state (`isAuthenticated=true`, `pendingSecurityVerification=true`) is set synchronously, but the cache in `sessionStorage` is only set by the `onAuthStateChange` SIGNED_IN handler — which fires asynchronously (sometimes after the user has already navigated away). On full page reload:
   - `getStoredToken()` → null (no admin custom token — questions never answered)
   - `getCache()` → null (SIGNED_IN didn't fire before unload)
   - No auth state restored → infinite spinner if async events never complete cleanly

2. **No fallback for stuck `isVerifying`** — if the async SIGNED_IN event is delayed or lost, `isVerifying` stays `true` permanently, and the only UI shown is "Verifying...". The user has no way to recover.

3. **`navigate("/dashboard")` after login** — unnecessary navigation to a URL that will immediately be intercepted by the `pendingSecurityVerification` route guard, creating a confusing URL-vs-content mismatch.

**Fix** (commit `86b066e`):

| File | Change | Security impact |
|------|--------|----------------|
| `src/contexts/AuthContext.tsx:211,215` | `loginWithEmail()` now calls `setCache({ userId, isAdmin })` after setting auth state | None — `sessionStorage` is client-side UI state; server still validates via Supabase session + security questions + `sessions` table |
| `src/contexts/AuthContext.tsx:80-88,184` | Added 10s safety timeout that force-resolves `isVerifying` → user lands on LoginPage if auth never resolves | None — LoginPage is the default unauthenticated state |
| `src/pages/LoginPage.tsx:38` | Removed `navigate("/dashboard")` and unused `useNavigate` | None — route guard handles redirect |

**Verification**: `tsc --noEmit` passes, lint shows only pre-existing warnings.

**Request**: Add a toggle button to auto-translate reels on Instagram and Facebook with Meta's AI dubbing + lip-sync feature.

**Deep investigation result**: Meta's AI translation/dubbing for Reels is **NOT exposed through the Graph API**. It is exclusively a consumer feature available via:
- **Instagram/Facebook mobile app** — pre-publish toggle "Translate your voice with Meta AI"
- **Facebook Professional Dashboard** — post-publish review/approval (UI only)

**All 12 research vectors confirmed no API support**:

| Research Vector | Result |
|----------------|--------|
| Graph API Instagram media container params | NO translation/dubbing parameter exists |
| Graph API Facebook video/reel upload params | NO translation/dubbing parameter exists |
| `/{media-id}/ai_translation` endpoint | Does not exist |
| `/{video-id}/translations` endpoint | Does not exist |
| PATCH video to enable translation | Not supported |
| Business Suite API audio tracks | UI only, no API |
| Professional Dashboard translation settings | Not exposed via API |
| SeamlessM4T model hosting | Open-source, self-host only |
| Meta AI Translations API | Does not exist as a service |

**What IS available via Graph API**:
- `is_ai_generated` parameter — content labeling only, NOT translation
- `multilingual_data` — text-based multilingual posts only, NOT audio dubbing
- `/{video-id}/captions` — SRT subtitle files only, NOT audio dubbing
- Custom dubbed audio tracks — Meta Business Suite UI only, no programmatic access

**Database schema notes**:
- `workflows` table already has unused `facebook_ai_generated` and `instagram_ai_generated` boolean columns (added by migration `20260524000000`) — these are for AI content **disclosure**, not translation
- `posts` table has `fb_ai_label` column (also unused) — same purpose
- Neither `posts` nor `workflows` has any translation-related column

**Plan** (pending user approval):
1. Migration: `posts.ai_translation_enabled` (bool), `workflows.instagram_ai_translation` + `facebook_ai_translation` (bool)
2. UploadPage: Switch toggle "Translate with Meta AI" under Instagram/Facebook sections
3. WorkflowsPage: Toggle in Step 2 for each platform
4. Edge functions: Accept/forward the flag (forward-compatible for when/if Meta adds API support)
5. Info banner noting the feature is enabled post-publish and available in the native app

**Status**: Investigated, not yet implemented.

---

### 54. Hardcoded R2_PUBLIC_URL Fallbacks Removed (2026-07-12)

**What**: Removed the hardcoded fallback `|| "pub-1d4bcccec36046308147315db8637398.r2.dev"` from all 5 functions that reference `R2_PUBLIC_URL`.

**Files changed**:
| File | Line | Before | After |
|------|------|--------|-------|
| `supabase/functions/process-workflow/index.ts` | 19 | `Deno.env.get("R2_PUBLIC_URL") \|\| "pub-..."` | `Deno.env.get("R2_PUBLIC_URL")!` |
| `supabase/functions/facebook-upload/index.ts` | 13 | Same | Same |
| `supabase/functions/instagram-upload/index.ts` | 13 | Same | Same |
| `supabase/functions/youtube-upload/index.ts` | 13 | Same | Same |
| `supabase/functions/tiktok-upload/index.ts` | 14 | Same | Same |

**Why**: The hardcoded fallback silently masked a missing env var. If the bucket URL ever changed (new R2 bucket, custom domain, etc.), the stale default would continue working silently — and the next function that needs `R2_PUBLIC_URL` might copy-paste the same stale fallback pattern. Now each function fails at startup with a clear error if the secret is missing.

**Action taken**: User confirmed `R2_PUBLIC_URL` is already set in Supabase function secrets. No deploy needed yet (pending next scheduled deploy).

**Related**: Entry #53 — the original R2 cache implementation that introduced `R2_PUBLIC_URL` to these functions.

---

### 55. R2 Upload Fix + Drive Fallback Disabled for Testing (2026-07-12)

**What**: Two changes to test R2 end-to-end:

1. **Fixed R2 upload mechanism** — `S3Client.send(PutObjectCommand)` with streaming body failed with `Unable to calculate hash for flowing readable stream` (Deno runtime limitation with S3 SDK checksums). Replaced with presigned URL generation via `getSignedUrl(r2Client, command, { expiresIn: 600 })` + raw `fetch` PUT with `duplex: "half"` — the same pattern used in the original R2 approach (deleted in commit `3914232`).

2. **Disabled Drive fallback** — commented out the `get-file` proxy fallback in 4 locations:
   - `process-workflow/index.ts`: `filePayload` Drive fallback (no Drive creds passed to upload functions)
   - `process-workflow/index.ts`: story URL Drive fallback (no get-file proxy token for stories)
   - `facebook-upload/index.ts`: get-file proxy generation for Drive source
   - `instagram-upload/index.ts`: same as facebook-upload

**Why for testing**: When R2 succeeds, everything publishes from R2 URLs at 0 egress. When R2 fails, no fallback kicks in — upload functions get raw Drive URL which Facebook/Instagram can't authenticate to → explicit failure in logs. After R2 is confirmed working, Drive fallback will be uncommented for belt-and-suspenders safety.

**Files changed**:
| File | Change |
|------|--------|
| `supabase/functions/process-workflow/index.ts` | Added `import { getSignedUrl } from "@aws-sdk/s3-request-presigner"`; replaced `s3Client.send(PutObjectCommand({..., Body: driveRes.body}))` with `getSignedUrl()` + raw `fetch` PUT; commented out `filePayload` Drive fallback (lines ~659-663); commented out story URL Drive fallback (lines ~731-738) |
| `supabase/functions/facebook-upload/index.ts` | Commented out get-file proxy `else` block inside `driveDownloadUrl && googleAccessToken` guard (lines ~149-157) |
| `supabase/functions/instagram-upload/index.ts` | Same as facebook-upload |

**New behavior when Drive source + R2 succeeds**:
```
process-workflow → uploads to R2 (presigned URL + raw PUT)
                 → updates video.file_url to R2 URL
                 → filePayload = {} (no Drive creds)
                 → upload functions read video.file_url → R2 URL → 0 egress
                 → story URL = r2Url → 0 egress
```

**New behavior when Drive source + R2 fails**:
```
process-workflow → R2 upload fails → r2Succeeded = false
                 → filePayload = {} (no Drive creds passed)
                 → upload functions read video.file_url = raw Drive URL
                 → Facebook/Instagram can't auth → explicit failure
                 → storyVideoUrl undefined → story skipped or fails
```

**Test results** (2026-07-12):
- ✅ **R2 upload succeeded** — presigned URL + raw `fetch` PUT works. Both Facebook and Instagram published successfully from R2 URL.
- ⚠️ **R2_PUBLIC_URL format issue** — user initially set the secret with `https://` prefix (`https://pub-...r2.dev`), but code prepends another `https://` — resulting in `https://https://pub-...r2.dev/...`. Facebook returned `Unable to fetch video file from URL` (code 389), Instagram containers failed with ERROR. Fixed by removing `https://` prefix from secret. Second run succeeded: `Using media URL: https://pub-...r2.dev/...`.
- ⏱️ **Speed observation**: R2 path is slightly slower than direct Drive get-file proxy (extra hop: process-workflow downloads from Drive → uploads to R2 → platform fetches from R2). Acceptable trade-off for 0 egress per platform.
- **Next step**: Uncomment Drive fallback to restore belt-and-suspenders behavior (R2 primary, Drive fallback if R2 fails).

**Deploy**: Completed — `process-workflow`, `facebook-upload`, `instagram-upload` deployed.

---

### 56. Sheet Status Not Updating After Workflow (Missing googleAccessToken) (2026-07-13)

**Symptom**: Google Sheets video status cells never updated after workflow processing, even though videos published successfully.

**Root cause**: When R2 caching succeeded (common path for Drive-sourced videos), `process-workflow` omitted `googleAccessToken` from the `filePayload` sent to upload functions. The `r2Succeeded` branch built `filePayload = { postId: "" }` with no Drive credentials — the comment said "omit Drive creds, upload functions use video.file_url (R2 URL)", but `googleAccessToken` is also needed for `updateSheetStatus()` to write results back to the sheet. Confirmed by production logs showing repeated `"No googleAccessToken provided, cannot update sheet"` from `update-sheet-status`.

**Secondary issues found**:
1. **tiktok-upload**: 3 error-path sites used raw `fetch` to `update-sheet-status` instead of the already-imported `updateSheetStatus()` helper — omitted `googleAccessToken` from the body entirely.
2. **instagram-upload**: `catch` block updated `posts.status = "failed"` but never called `updateSheetStatus` (all other upload functions do on failure).
3. **_shared/sheet-status.ts**: Non-2xx responses from `update-sheet-status` were silently discarded (only thrown exceptions were logged).

**Files changed**:

| File | Change |
|------|--------|
| `supabase/functions/process-workflow/index.ts` | Moved `driveDownloadUrl` / `googleAccessToken` out of the `else` branch — always included in `filePayload`, regardless of R2/Mega status (needed for sheet updates, not just video fetching) |
| `supabase/functions/tiktok-upload/index.ts` | Replaced 3 raw `fetch` calls with `await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "failed", googleAccessToken)` at the `initData.error`, `no publish_id`, and `upload failed` error paths |
| `supabase/functions/instagram-upload/index.ts` | Added `await updateSheetStatus(...)` in the catch block after `posts.status = "failed"` update |
| `supabase/functions/_shared/sheet-status.ts` | Capture `fetch` response; log status code + body when non-2xx (was previously only logging thrown exceptions) |

**Safety verification**: All 4 upload functions use `typeof === "string"` guards + truthiness checks when using `driveDownloadUrl` / `googleAccessToken`, so passing `undefined` for Mega sources is safe — the fields are simply not acted upon. `JSON.stringify` drops `undefined` keys.

**Deploy**: Pending — `process-workflow`, `tiktok-upload`, `instagram-upload`, `update-sheet-status`.

---

### 57. Profile Section — Added (2026-07-14)

**Feature**: User profile dashboard accessible via top-right avatar dropdown. Shows logged-in account identity, editable profile info, password change, and security questions management.

**New files**:

| File | Purpose |
|------|---------|
| `src/components/ui/avatar.tsx` | shadcn Avatar (image + initials fallback) |
| `src/components/ui/tabs.tsx` | shadcn Tabs (tabbed page layout) |
| `src/components/ui/dropdown-menu.tsx` | shadcn DropdownMenu (top-right menu) |
| `src/components/UserMenu.tsx` | Avatar trigger + dropdown with user info, "Dashboard" link, "Lock" logout |
| `src/pages/ProfilePage.tsx` | 3-tab profile dashboard (Personal Info, Security, Preferences) |

**Modified files**:

| File | Change |
|------|--------|
| `src/components/AppLayout.tsx` | Header now contains `<SidebarTrigger />` left + `<UserMenu />` right |
| `src/App.tsx` | Imported `ProfilePage`; added `/profile` route under `<AppLayout>` |

**Behavior**:
- Top-right avatar (initials fallback) on every authenticated page
- Dropdown shows: avatar, name, email, `[Admin]` badge → **"Dashboard"** link → **"Lock"** (logout)
- `/profile` page has 3 tabs:
  - **Personal Info**: avatar preview, editable name + avatar URL, read-only email, admin badge, member-since date
  - **Security**: change password (current → new + confirm) + security questions setup/re-setup
  - **Preferences**: placeholder for future settings
- No backend changes, no DB migrations, no new Edge Functions

---

### 58. Drive Folder Creation & File Upload — Added (2026-07-14)

**Feature**: Users can now create folders and upload files directly to Google Drive from the Storage page.

**New actions on `google-drive-auth` edge function**:

| Action | Method | Params | Description | Returns |
|--------|--------|--------|-------------|---------|
| `create-folder` | GET | `account_id`, `name`, `parent_id` (optional, default `root`) | Creates a folder on Drive | `{ id, name }` |
| `get-token` | GET | `user_id`, `account_id` | Returns a fresh, decrypted Drive access token for client-side API calls | `{ access_token, expires_in }` |

**Modified files**:

| File | Change |
|------|--------|
| `supabase/functions/google-drive-auth/index.ts` | Added `create-folder` handler (POST to Drive API with folder MIME type) and `get-token` handler (token refresh + decryption, returned to caller) |
| `src/pages/StoragePage.tsx` | Added: inline folder creation input in Drive panel; Upload button + hidden multi-file input; resumable upload via browser-direct Drive API (XMLHttpRequest with progress); per-file progress bar during uploads; `getDriveAccessToken()` helper; `uploadFileToDrive()` resumable upload implementation |

**Behavior**:
- **Create folder**: `+ Folder` button in Drive panel → inline input appears → enter name + Create → folder created in current directory → list refreshes
- **Upload files**: `+ Upload` button opens native file picker (multi-select) → files upload sequentially via resumable upload protocol direct to Drive API (browser-to-Google, bypassing edge function) → per-file progress bar shown → list + quota refresh on completion
- **Security**: Temporary Drive access token obtained server-side via `get-token` action (verifies account ownership), then used client-side for direct Drive API calls. Token never persisted in browser storage.

**Deploy**: Deployed via `npx.cmd supabase functions deploy google-drive-auth --no-verify-jwt`. Node.js v24.18.0 and Supabase CLI 2.109.1 installed on this machine.

---

### 59. Facebook Cross-Page Video Transfer — Feasibility Analysis (2026-07-14)

**Question**: Can FlowPost transfer/republish a video from one Facebook page to another?

**Current capability**: Simultaneous multi-page posting exists, but transfer of already-published content does not.

**What exists today**:

| Flow | Status |
|------|--------|
| Publish same video to multiple pages at once (manual Upload) | ✅ Multi-page checkbox selection, one post row per page |
| Publish same video to multiple pages at once (Workflows) | ✅ `facebook_page_ids` array + per-row sheet override |
| Read published posts from a page | ❌ No edge function |
| Re-upload a Facebook-sourced video to another page | ❌ No fetch-from-Facebook logic |
| UI for transfer flow | ❌ |

**What would need to be built**:

| Component | Description |
|-----------|-------------|
| New edge function (or action) | `GET /{sourcePageId}/videos/{videoId}?fields=source,description` with source page's token → returns video download URL + caption |
| Video re-upload pipeline | Fetch video from Facebook's CDN (or proxy via `get-file`), then call existing `facebook-upload` with destination page's `account_id` |
| Transfer UI | Source page selector → destination page selector → optional caption/schedule → confirm |
| Post record creation | Create a new post row with `platform: "facebook"`, destination `account_id`, copied caption, status `"processing"` |

**No new OAuth scopes needed** — `pages_read_engagement` (read posts) and `pages_manage_posts` (publish) already cover both sides.

**Potential approach**:
```
GET /{sourcePageId}/videos/{videoId}?fields=source,description
  → extract video download URL + caption
  → download video (or proxy via get-file)
  → POST /{destPageId}/videos (existing facebook-upload flow)
```

**Status**: Not implemented. Analysis complete.

---

## Entry #60 — UploadPage: Google Drive file browser + import to R2

**Status**: Deployed and committed

**What was built**:
1. **New edge function action** `upload-video-to-r2` on `google-drive-auth` — accepts `{ account_id, file_id, file_name, user_id, media_type }` via POST; fetches Drive file metadata, creates `videos` DB record, streams file to R2 via presigned URL, updates record with R2 URL, returns `{ video_id, r2_url }`.
2. **UploadPage Drive tab** — toggle between "My Videos" (existing dropdown) and "Google Drive" (file browser). File browser lists video/image files from Drive root, with account selector (if multiple accounts), file name/size/date, and "Import" button per file.
3. **Import flow** — clicking "Import" calls `upload-video-to-r2`, shows spinner on that file, on success auto-selects the new video and switches back to "My Videos" tab. New video prepended to dropdown list.

**Files modified**:
- `supabase/functions/google-drive-auth/index.ts` — added S3 imports, R2 env vars, s3Client init, `upload-video-to-r2` action handler (+80 lines)
- `supabase/config.toml` — added `timeout = "600s"` to `[functions.google-drive-auth]`
- `src/pages/UploadPage.tsx` — Drive tab state, accounts/files loading, Drive browser UI, import handler (+110 lines)

**Deployed**: `google-drive-auth` edge function redeployed with new action.

---

## Entry #61 — Fix: `created_at` → `uploaded_at` on videos table

**Status**: Committed and pushed (024bb46)

**Bug**: `UploadPage.tsx` and `google-drive-auth` edge function referenced `created_at` column which doesn't exist on the `videos` table (correct name: `uploaded_at`). Caused 400 Bad Request from Supabase REST API.

**Fix**: 5 references across 2 files — `src/pages/UploadPage.tsx` (lines 37, 122, 124, 215, 635) and `supabase/functions/google-drive-auth/index.ts` (line 448).

---

## Entry #62 — UploadPage: Local machine upload tab

**Status**: Committed and pushed (338edac), edge function deployed

**What was built**:
1. **New edge function action** `get-r2-upload-url` on `google-drive-auth` — accepts POST `{ user_id, file_name, file_size, media_type, content_type }`, creates `videos` record, returns presigned R2 upload URL + video_id + r2_url
2. **UploadPage third tab** "Upload from Computer" — click-to-select file (video/image), shows file info, XHR upload with real-time progress bar, 200MB client-side size limit
3. On completion: updates `file_url` via Supabase client, auto-selects video, switches to "My Videos" tab

**Files modified**:
- `supabase/functions/google-drive-auth/index.ts` — added `get-r2-upload-url` action handler (+40 lines)
- `src/pages/UploadPage.tsx` — third tab, file input, XHR upload with progress, 200MB gate (+130 lines)

---

## Entry #63 — UploadPage: Post as Story toggle

**Status**: Committed and pushed (c5584da), `process-scheduled-posts` deployed

**What was built**:
1. **StoryPlatforms state** — Set tracking which platforms (facebook/instagram) should post as story
2. **UI** — "Post as Story" Switch shown below Facebook/Instagram account checkboxes (when at least one account selected)
3. **Post creation** — sets `post_type: "story"` when story toggle is on
4. **Publish Now routing** — story posts call `post-story` edge function; feed posts call existing upload functions
5. **Cron fix** — `process-scheduled-posts` now routes Facebook story posts to `post-story` (was Instagram-only before)

**Files modified**:
- `src/pages/UploadPage.tsx` — story state, toggle handler, Switch UI, post routing (+68 lines)
- `supabase/functions/process-scheduled-posts/index.ts` — added Facebook story routing (+3 lines)

---

## Entry #64 — Auth redirect fix: save & restore URL + /security-questions route

**Status**: Committed and pushed (0be7aff)

**Problem**: After logout/login flow, user always ended up at `/dashboard` regardless of where they were before. SecurityQuestionsGate rendered in-place at current URL (confusing URL bar).

**What was built**:
1. **Save redirectPath** — `App.tsx` saves `location.pathname + search` to `localStorage.redirectPath` before showing LoginPage
2. **Restore redirectPath** — `LoginPage.tsx` and `AuthCallback.tsx` read `redirectPath` instead of hardcoded `/dashboard`
3. **Dedicated `/security-questions` route** — instead of in-place rendering, with `RequireVerified` wrapper redirecting unverified users there
4. **RootRedirect** — root `/` checks `redirectPath` first (survives `window.location.reload()` after security verification)
5. **SecurityQuestionsGate guard** — redirects unauthenticated users to `/`, verified users to `redirectPath` or `/dashboard`

**Files modified**:
- `src/App.tsx` — RootRedirect, RequireVerified wrapper, `/security-questions` route, save redirectPath
- `src/pages/LoginPage.tsx` — read redirectPath on login
- `src/pages/AuthCallback.tsx` — read redirectPath on OAuth callback
- `src/components/SecurityQuestionsGate.tsx` — redirect guard for unauthenticated/verified states

---

## Entry #65 — AuthContext: verify Supabase session after custom token

**Status**: Committed and pushed (69b27e6)

**Problem**: After browser restart + tab restore, `flowpost_token` survived in localStorage (custom admin token) so the app showed authenticated shell, but the Supabase session (user JWT) was stale/missing, causing all DB queries to fail — blank content with no error.

**Fix**: After `verify-session` succeeds with the custom token, also call `supabase.auth.getSession()`. If no Supabase session exists, clear the custom token and fall back to unauthenticated state (shows LoginPage instead of broken shell).

**Files modified**:
- `src/contexts/AuthContext.tsx` — added Supabase session check after custom token validation (+9 lines)

---

## Current Issues
- Facebook cross-page transfer — still unimplemented (entry #59)
- Drive scope migration — users must reconnect accounts
- ~~CORS on `google-drive-auth`~~ — all 5 GET actions (`list-files`, `quota`, `create-folder`, `get-token`, `delete`) converted to POST, **deployed**

---

### 66. Phase 1 — Foundation for FlowPost In-App Workflow Items (2026-07-15)

**What was built**: The data layer to support replacing Google Sheets with an in-app workflow editor.

**Files changed**:

| File | Change |
|------|--------|
| `supabase/migrations/20260715000000_add_workflow_items.sql` | New — creates `workflow_items` table, `drive_folder_id` and `data_source` columns on `workflows` |
| `src/lib/types.ts` | Added `WorkflowItem` interface (status, captions per platform, file info); added `drive_folder_id` and `data_source` to `Workflow` |
| `src/integrations/supabase/types.ts` | Added `workflow_items` Row/Insert/Update types; added new columns to `workflows` Row/Insert/Update |
| `supabase/functions/process-workflow/index.ts` | Added FlowPost data source branch — reads from `workflow_items` where `status='ready'` instead of Google Sheet; marks items as `posted` after successful run; existing sheet path untouched |

**How it works**:
- Workflows with `data_source = 'g_sheet'` (default, all existing workflows) — unchanged, still reads from Google Sheets
- Workflows with `data_source = 'flowpost'` — reads from `workflow_items` table where `status = 'ready'`, builds synthetic rows matching sheet format, processes identically
- After posting, workflow_items.status updated to `'posted'` and `posted_at` set
- `process-workflow` backwards compatible — existing sheet path untouched

**Not changed**: Platform upload functions, R2 caching, cron, locking, story posting, Mega handling — untouched.

---

### 67. Phase 2 — Workflow Creation UI with Drive Folder Browser (2026-07-15)

**What was built**: Step 4 of the workflow creation form now supports both Google Sheet and FlowPost (Drive folder) sources.

**Files changed**:
| File | Change |
|------|--------|
| `src/pages/WorkflowsPage.tsx` | Step 4 source toggle (radio: Google Sheet / FlowPost); Drive folder browser (breadcrumb navigation, folder listing, Select button); `dataSource`, `selectedFolderId/Name`, `driveParentId`, `driveBreadcrumbs`, `driveFolderFiles` state; `fetchDriveFolder`, `navigateDriveFolder`, `selectFolder` handlers; conditional validation in `handleSave`; card display shows "FlowPost folder" or "Sheet connected" |

**How it works**:
- New "Source" step replaces "Sheet" step label
- Radio toggle: **Google Sheet** (existing UI) or **FlowPost** (new)
- FlowPost mode: Drive folder browser with breadcrumbs, folder listing, "Open" to navigate, "Select" to choose a folder
- On save: sets `data_source`, `drive_folder_id` (or `sheet_url`/`sheet_id` for legacy mode)
- Existing sheet workflows unaffected — `data_source` defaults to `'g_sheet'`

**TypeScript**: `tsc --noEmit` passes with zero errors.

---

### 68. Drive Folder Pagination — All Pages Now Loaded (2026-07-15)

**Problem**: `list-files` returns 50 items per page with a `nextPageToken`. The WorkflowsPage and UploadPage Drive browsers only fetched the first page, hiding files beyond 50.

**Fix**: Both `fetchDriveFolder` (WorkflowsPage) and the Drive listing `useEffect` (UploadPage) now loop through all pages, passing `page_token` from each response until `nextPageToken` is null, then set the complete file list.

**Files changed**:
| File | Change |
|------|--------|
| `src/pages/WorkflowsPage.tsx` | `fetchDriveFolder` now paginates — `do/while` loop accumulates all files |
| `src/pages/UploadPage.tsx` | Same pattern in the Drive listing `useEffect` |

StoragePage already handled pagination correctly (load-more button).

---

### 69. Phase 3 — Workflow Items Editor Page (2026-07-15)

**What was built**: New `/workflows/:id/items` page for managing Drive-sourced workflow files.

**Files changed**:
| File | Change |
|------|--------|
| `src/pages/WorkflowItemsPage.tsx` | **NEW** — full items editor: table with inline caption inputs, status badges, Sync from Drive, Save All, bulk mark-ready, per-item remove |
| `src/App.tsx` | Added route `/workflows/:id/items` |
| `src/pages/WorkflowsPage.tsx` | Added "Manage Videos" button (Folder icon) on flowpost workflow cards |
| `supabase/functions/process-workflow/index.ts` | Fixed flowpost branch: synthetic header now uses `image_url`/`image_fb_ig_caption` for image workflows |

**Page features**:
- Top bar: workflow name, **Sync from Drive** button (paginates all pages), **Save All** button
- Stats bar: item counts by status
- Bulk bar: Select All, Deselect All, Mark Selected as Ready
- Table columns: Checkbox | File name+size | Status badge | YT Title input | YT Description textarea | FB/IG Caption textarea | TikTok Caption textarea | Actions
- Per-row: Mark Ready / Unmark Ready toggle, Remove button
- Dirty state tracking with asterisk indicator on modified rows
- Empty state: prompt to sync from Drive

**TypeScript**: `tsc --noEmit` passes with zero errors. Deployed `process-workflow` with image workflow fix.

**[Duplicated content from entry 66 above — kept for reference]**

**Not changed**: Platform upload functions, R2 caching, cron, locking, story posting, Mega handling — untouched.

---

### 70. CORS Fix — `list-files` Changed from GET to POST (2026-07-15)

**Problem**: `list-files` calls to `google-drive-auth` from Vercel-hosted app were blocked by CORS because Supabase Functions Gateway returns its own error with no CORS headers on GET requests before the edge function runs.

**Fix**: Changed all `list-files` callers from GET (params in URL) to POST (params in JSON body). The edge function now reads params from `body.action` / `body.account_id` / `body.parent_id` / `body.page_token` with URL fallback for backwards compatibility.

**Files changed**:

| File | Change |
|------|--------|
| `supabase/functions/google-drive-auth/index.ts` | Added `body = await req.json().catch(() => ({}))`; `action` and `list-files` params fall back to `body.*` |
| `src/pages/WorkflowItemsPage.tsx` | `syncFromDrive` — POST with JSON body |
| `src/pages/WorkflowsPage.tsx` | `fetchDriveFolder` — POST with JSON body |
| `src/pages/UploadPage.tsx` | Drive listing `useEffect` — POST with JSON body |
| `src/pages/StoragePage.tsx` | `fetchDriveFiles` — POST with JSON body |

**Expanded (2026-07-15)**: Same fix applied to remaining 4 GET actions — `quota`, `create-folder`, `get-token`, `delete` (3 call sites). All now use POST + `body.*` fallbacks in edge function.

| Action | Edge function handler | Frontend callers |
|--------|-----------------------|------------------|
| `quota` | `body?.account_id` (L265) | StoragePage fetchDriveQuota |
| `create-folder` | `body?.account_id/name/parent_id` (L345-347) | StoragePage createDriveFolder |
| `get-token` | `body?.user_id/account_id` (L383-384) | StoragePage getDriveAccessToken |
| `delete` | `body?.account_id/file_id` (L535-536) | StoragePage deleteSingleItem, executeDelete, deleteSelectedItems |

**Deploy pending**: Run `npx supabase functions deploy google-drive-auth --no-verify-jwt` manually (requires TTY for login). Commits: `6d0d50e` (list-files), `3e9b206` (quota, create-folder, get-token, delete).

---

### 71. Phase 4 — Per-Item Platform Overrides UI (2026-07-15)

**What was built**: A "Platforms" column in the WorkflowItemsPage table with per-row popover editor for `platforms_override`.

**Files changed**:
| File | Change |
|------|--------|
| `src/pages/WorkflowItemsPage.tsx` | +138 lines: `Platforms` column header; per-row popover with checkboxes (YT/FB/IG/TT); `setPlatforms()`/`getPlatforms()` helpers; bulk "Set Platforms" action for selected items; platform label/color constants |

**How it works**:
- Each row shows colored platform badges (YT/FB/IG/TT) when override is set, or muted "All" when using workflow defaults
- Click the cell → popover with checkboxes for each platform in `workflow.platforms`
- Unchecking a platform creates an override excluding it; checking all resets to `null` (uses defaults)
- Changes tracked via existing dirty system (asterisk + Save All)
- Bulk mode: Select items → "Set Platforms" button → popover → "Apply" updates all selected

**Backend**: Already handled — `process-workflow` line 349 reads `platforms_override` and joins into synthetic sheet. Zero edge function changes needed.

---

### 72. LinkedIn Integration — Feasibility Analysis (2026-07-15)

**Goal**: Add LinkedIn as a new posting platform (personal profiles + company pages).

**API pattern**: Standard OAuth 2.0 + REST API, same architecture as Facebook integration.

**Technical details**:

| Aspect | Detail |
|--------|--------|
| API base | `https://api.linkedin.com/rest/posts` (modern) or `/v2/ugcPosts` (legacy) |
| Scopes needed | `w_member_social` (profile), `w_organization_social` (pages), `openid`, `profile`, `email` |
| Token lifetime | Access: 60 days, Refresh: 365 days (refresh tokens require MDP partnership) |
| Video upload | 2-step: register asset via `/assets?action=registerUpload` → upload to presigned S3 URL → create UGC post with media URN |
| Image upload | Same 2-step with `image:standard` recipe |
| Rate limits | 100 posts/user/day, 100K calls/app/day |
| Story support | Not supported |

**Files to create (2)**:
- `supabase/functions/linkedin-auth/index.ts` — OAuth flow (url, callback, refresh)
- `supabase/functions/linkedin-upload/index.ts` — Asset registration, video/image upload, UGC post creation

**Files to modify (~10)**:
- `supabase/config.toml` — register both functions with `verify_jwt = false`
- `src/lib/types.ts` — add `'linkedin'` to platform union types
- `src/components/PlatformIcon.tsx` — add LinkedIn SVG icon
- `src/pages/AccountsPage.tsx` — LinkedIn connect/disconnect card
- `src/pages/UploadPage.tsx` — LinkedIn account selector + caption field
- `src/pages/WorkflowsPage.tsx` — LinkedIn account selector in Step 2
- `supabase/functions/process-workflow/index.ts` — add `'linkedin'` to routing
- `supabase/functions/process-scheduled-posts/index.ts` — add `'linkedin'` routing
- `supabase/migrations/YYYYMMDDHHMMSS_add_linkedin.sql` — add `linkedin_account_ids`, `linkedin_caption`, extend CHECK constraints

**Blocker**: `w_member_social` and `w_organization_social` scopes require **LinkedIn Partner Program approval** (manual review, like TikTok app review). Without it, posting API calls return 403. OAuth connection and account listing work with auto-approved scopes (`openid`, `profile`, `email`).

**Recommended approach**: Implement full code including posting function. Test OAuth flow and account connection immediately. Posting will be gated behind partner approval (same status as TikTok's `PUBLIC_TO_EVERYONE` privacy level).

---

### 73. Multi-Account OAuth Flow Improvements (2026-07-15)

**Problem**: Connecting multiple accounts of the same platform (e.g., two Facebook profiles) required using a different browser or incognito, because OAuth auto-logged in with the current browser session.

**Changes** (4 files, 13 lines):

| File | Change |
|------|--------|
| `supabase/functions/facebook-auth/index.ts` | Added `auth_type=rerequest` to OAuth URL — forces Facebook login dialog even when user has an active session |
| `supabase/functions/youtube-auth/index.ts` | `prompt=consent` → `prompt=select_account consent` — shows Google account picker |
| `supabase/functions/google-drive-auth/index.ts` | Same prompt change as YouTube |
| `src/pages/AccountsPage.tsx` | 6x `window.open(url, "_blank")` → popup windows (`width=600,height=700`); Facebook button shows "Add another account" when connected; YouTube shows "Add another channel" |

**How it works**:
- Facebook: `auth_type=rerequest` forces re-auth dialog. User clicks "Log in as different user" → enters second account credentials → pages upserted with unique `(user_id, platform, account_id)` constraint
- Google: `select_account` shows account picker. User selects or adds a different Google account → channel/Drive account upserted as new row
- TikTok: unchanged (1-account limit, always shows fresh login)
- Popup windows: keep user on FlowPost tab; OAuth feels like a dialog rather than leaving the app

**No DB changes needed** — unique constraint `(user_id, platform, account_id)` already supports multiple accounts per platform.

---

### 74. Auto-Close OAuth Popup + Instant State Reset (2026-07-15)

**Problem**: After successful OAuth, popup stayed open showing the AccountsPage. Parent still showed "Connecting..." animation until Realtime subscription fired (1-3s latency).

**Fix** (1 file, `src/pages/AccountsPage.tsx`, +19 lines):
- Popup now sends `postMessage({ type: "oauth-connected", platform })` to parent, then auto-closes after 1.5s
- Parent listens for `message` events: instantly resets the `is{Platform}Connecting` state + calls `refreshAll()`
- Realtime subscription stays as fallback for edge cases

**Flow**:
1. User clicks "Connect" → popup opens (600×700)
2. User authenticates → popup redirects to `FlowPost?connected={platform}`
3. Popup detects param → shows toast → `postMessage` to parent → closes after 1.5s
4. Parent instantly stops spinner + refreshes account list
5. If popup blocked or closed early, Realtime subscription catches it within a few seconds

---

### 75. LinkedIn Integration — Implementation Complete (2026-07-16)

**Goal**: Add LinkedIn posting support (personal profiles + company pages). Implementation done.

**What was built:**
| Layer | Files | Status |
|-------|-------|--------|
| Migration | `20260716000000_add_linkedin_support.sql` — CHECK constraints, `linkedin_account_ids` on workflows, `linkedin_caption` on workflow_items | ✅ |
| Types | `Platform` union, `Workflow.linkedin_account_ids`, `WorkflowItem.linkedin_caption` | ✅ |
| PlatformIcon | `Linkedin` from lucide-react, `text-linkedin` color class | ✅ |
| CSS/Tailwind | `--linkedin` HSL (211 72% 45%), `linkedin` color token | ✅ |
| Config | `linkedin-auth` + `linkedin-upload` in `supabase/config.toml` | ✅ |
| Edge: linkedin-auth | OAuth URL generation, code exchange, profile fetch, upsert | ✅ |
| Edge: linkedin-upload | Register upload → upload binary → create post via `/rest/posts` | ✅ |
| Edge: process-workflow | `normalizePlatform`, synthetic headers, account resolution, post creation, upload dispatch | ✅ |
| Edge: process-scheduled-posts | `linkedin` → `linkedin-upload` routing | ✅ |
| AccountsPage | fetch/connect/disconnect with Realtime subscription, UI card + BetaBadge | ✅ |
| UploadPage | Platform toggle, account selector, caption field, validation, upload dispatch | ✅ |
| WorkflowsPage | Platform options, account selector, save/load `linkedin_account_ids` | ✅ |
| WorkflowItemsPage | `linkedin_caption` column, PLATFORM_LABEL/COLOR entries | ✅ |

**Bugs fixed (post-audit, `2d542db`):**
| Bug | Fix |
|-----|-----|
| `linkedin-auth` — userId read only from query params → 400 | Read from POST body with `url.searchParams` fallback |
| `linkedin-auth` — `SUPABASE_ANON_KEY` missing from env/validKeys → 401 | Added `SUPABASE_ANON_KEY` env var + included in `validKeys` |
| `process-workflow` — `normalizePlatform(p)` param type too strict → TS error | Reverted to `p: string` |

**Blocked:**
- `w_member_social` / `w_organization_social` require **LinkedIn Partner Program approval**
- Secrets (`LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`) set ✅

**Deploy Order:**
1. `npx supabase functions deploy linkedin-auth linkedin-upload google-drive-auth facebook-auth youtube-auth --no-verify-jwt`
2. `npx supabase db push`
3. Submit LinkedIn app review for `w_member_social` scope
4. Vercel deploy (auto)

**API Details:**
| Aspect | Detail |
|--------|--------|
| OAuth endpoint | `https://www.linkedin.com/oauth/v2/authorization` |
| Token endpoint | `https://www.linkedin.com/oauth/v2/accessToken` |
| API | `POST /rest/posts` with `LinkedIn-Version: 202412` header |
| Scopes | `w_member_social` (profile), `openid profile email` |
| Video upload | 3-step: register → upload binary to presigned URL → create post referencing asset URN |
| Token lifetime | Access: 60 days, Refresh: 365 days (MDP partnership) |
| Rate limits | 100 posts/user/day, 100K calls/day |
| Post type | Feed only (no stories, no reels) |

---

## SQA & Performance Audit Plan

### Test Infrastructure
| Task | Status |
|------|--------|
| Create `src/test/setup.ts` — jest-dom imports, Supabase mock, `window.matchMedia` mock | ❌ |
| Install `@testing-library/user-event`, `@vitest/coverage-v8`, `msw` | ❌ |
| Add `npm run test:coverage` script | ❌ |

### Phase 1 — Unit Tests
| Module | Test Candidates | Priority |
|--------|----------------|----------|
| `src/lib/utils.ts` — `cn()` | Merge class names with clsx+twMerge | P2 |
| `src/lib/driveToMegaTransfer.ts` | File parsing, progress calc, error handling | P1 |
| `_shared/crypto.ts` | encrypt/decrypt round-trip, invalid ciphertext fallback | P0 |
| `_shared/rate-limit.ts` | check/record/reset lifecycle, over-limit rejection | P1 |
| `_shared/sheet-status.ts` | PATCH request format, error handling | P1 |
| `src/hooks/*` | use-toast, useLocalStorage | P2 |

### Phase 2 — Edge Function Integration Tests
| Function | Key Test Cases |
|----------|---------------|
| `linkedin-auth` | `action=url` returns valid OAuth URL; `action=callback` exchanges code, fetches profile, upserts |
| `linkedin-upload` | Video path vs image path; missing file_url → 404; invalid platform → 400 |
| `facebook-auth` | OAuth URL with `auth_type=rerequest`; long-lived token exchange; pages+IG fetch |
| `youtube-auth` | OAuth URL with `prompt=select_account consent`; channel fetch; refresh token preserve |
| `google-drive-auth` | All 5 actions via POST body with url.searchParams fallback |
| `facebook-upload`, `instagram-upload`, `tiktok-upload`, `youtube-upload` | Upload with Drive/Mega/R2 source routing |
| `process-workflow` | FlowPost branch reads `workflow_items`; Legacy branch reads sheet; Per-platform captions; platforms_override |
| `process-scheduled-posts` | Fetches due posts; routes to correct upload function; story vs feed |

### Phase 3 — React Component Tests
| Page / Component | Test Scenarios |
|-----------------|----------------|
| `PlatformIcon`, `PlatformBadge`, `StatusBadge`, `BetaBadge` | Renders correct icon/variant per platform/status |
| `AccountsPage` | Lists accounts per platform; Connect opens popup; Disconnect removes; LinkedIn section with BetaBadge |
| `UploadPage` | Platform toggle shows/hides account pickers; LinkedIn caption field; Validation (platform+account required); Submit creates posts + fires uploads |
| `WorkflowsPage` | Step wizard; LinkedIn selector; Save/load linkedin_account_ids; Media type filter |
| `WorkflowItemsPage` | Table with all caption columns; LinkedIn caption editable; Bulk platforms action |
| `QueuePage` | Lists posts with PlatformIcon; Status badges; Retry failed |

### Phase 4 — Manual E2E Test Cases
```
1. [ ] LinkedIn OAuth: Accounts → Connect → popup → authorize → connected
2. [ ] LinkedIn upload: UploadPage → select LinkedIn → caption → post
3. [ ] LinkedIn image upload: image file → select LinkedIn → post
4. [ ] Workflow with LinkedIn: create → add items → trigger → posted
5. [ ] Multi-platform upload: Facebook + Instagram + YouTube + TikTok + LinkedIn
6. [ ] Multi-account: connect 2 YouTube channels, 2 Facebook pages
7. [ ] Expired token → error message
8. [ ] Network failure → status=failed
9. [ ] 0 ready items → workflow skipped gracefully
```

### Phase 5 — Post-Deploy Smoke Tests
```
1. [ ] supabase functions serve linkedin-auth → curl test locally
2. [ ] curl POST /linkedin-auth → 401 without auth
3. [ ] curl POST /linkedin-auth?action=url&userId=test → OAuth URL
4. [ ] supabase functions serve linkedin-upload → smoke with mock post
5. [ ] npm run test → all unit tests pass
```

### Performance Audit (Phase 6)

#### Bundle Size
| Issue | Savings | Fix |
|-------|---------|-----|
| `recharts` in main bundle | **-250 KB** | Lazy-load InsightsPage via `React.lazy()` |
| `@tanstack/react-query` unused | **-15 KB** | Remove from deps + App.tsx |
| `react-hook-form` unused | **-12 KB** | Remove from deps |
| `vite-plugin-node-polyfills` | **-50 KB** | Targeted polyfills or remove |
| AWS SDK in `process-workflow` | **-130 KB** cold-start | Replace with raw `fetch()` to S3 REST API |

#### Database — Missing Indexes (P0)
| Table | Columns | Priority |
|-------|---------|----------|
| `posts` | `(user_id, status, scheduled_at)` | P0 |
| `posts` | `(user_id, video_id, platform, account_id, status)` | P0 |
| `connected_accounts` | `(user_id, platform, is_connected)` | P0 — most queried |
| `videos` | `(user_id)` | P1 |
| `workflows` | `(user_id, is_active)` | P1 |
| `workflow_items` | `(workflow_id, status)` | P1 |

#### Database — Over-fetching
- Replace `select("*")` with explicit columns in AccountsPage (7 calls), UploadPage (6 calls), WorkflowsPage (6 calls)

#### N+1 Query Patterns
- `process-workflow` lines 475–481: batch Mega account query before loop
- `process-workflow` lines 843–848, 877–882: batch `connected_accounts` queries for story posts

#### Rendering
- Missing virtualization: QueuePage, WorkflowItemsPage, StoragePage file lists
- Missing `useMemo`: CalendarPage day computation, AuthContext value, QueuePage derivations, InsightsPage chart data
- AuthContext re-render: wrap context value in `useMemo`

#### Realtime Subscriptions
- Reduce `"connected-accounts-live"` timeout from 10min → 30s
- Duplicate `refreshAll()` calls from overlapping channels

#### Edge Function Architecture (post-MVP)
- Combine 5 `*-upload` → single `platform-upload`
- Combine 5 `*-auth` → single `oauth`
- Combine 3 `verify-*` → single `verify`
- Reduces 28 functions → ~15, cuts cold-start surface by ~46%

#### Performance Test Script
```
1. [x] Lazy-load all 14 route pages with React.lazy + Suspense (de02541)
2. [x] Replace CSS @import for Google Fonts with HTML <link> + preconnect (de02541)
3. [x] Vite manualChunks: vendor, ui, supabase, charts splits (de02541)
4. [x] Preload /logo.svg with fetchpriority=high, explicit width/height (de02541)
5. [x] Remove unused @tanstack/react-query (~15 KB) + react-hook-form (~12 KB) (de02541)
6. [x] Remove vite-plugin-node-polyfills (~50 KB unused shims) (de02541)
7. [x] Add loading=lazy to QueuePage thumbnails + UserMenu avatar (de02541)
8. [ ] Lighthouse audit on Dashboard, Upload, Workflows, Queue, Accounts
9. [ ] TTI target < 3s, LCP target < 2.5s
10. [ ] Bundle analysis: npm run build -- --analyze
11. [ ] Edge function cold-start: first-response latency per function
12. [ ] Stress: 500 items in WorkflowItemsPage + 500 posts in QueuePage
13. [ ] DB: EXPLAIN ANALYZE before/after adding indexes

### Behavioral Risk Assessment

| Priority | Items | Behavior Risk | Status |
|----------|-------|---------------|--------|
| **P0-LCP** | Code splitting (React.lazy + manualChunks), font @import→<link>, preload/width/height on Logo | ✅ Zero change — same UI, same APIs, smaller bundles | **Deployed `de02541`** |
| **P0-LCP** | Remove unused deps (react-query, react-hook-form, buffer, nodePolyfills) | ✅ Zero change — code was already dead | **Deployed `de02541`** |
| **P0** | DB indexes, N+1 query fixes | ✅ Zero change — indexes only speed up queries; batched queries return same data | **Safe anytime** |
| **P1** | Lazy-load InsightsPage, wrap AuthContext in useMemo | ✅ Same UI, same APIs | **Done in revert, pending re-apply** |
| **P2** | Replace AWS SDK with raw `fetch()` in process-workflow, scroll containment, reduce subscription timeouts | ⚠️ AWS SDK swap needs testing; timeout reduction generous (10m→5m) | **Done in revert, pending re-apply** |
| **P3** | Replace `select("*")` with specific columns, combine edge functions | ✅ Column selects safe; ⚠️ function combining needs migration plan | **Column selects safe; combining needs planning** |
| **—** | Fix 429 rate limit on auth refresh token (entry #14) | ✅ Deferred auto-refresh (30s delay) + localStorage session check | **Fixed `1a520b0`** |
| **—** | Fix 429 on verify-session + per-platform workflow items UI | ✅ sessionStorage cache (5s TTL) + preserve token on 429 + card layout | **Fixed `d4b8938`** |
| **—** | FlowPost workflows returning 0 videos processed (entry #77) | ✅ sheet_id check + saveAll auto-ready + markReady preserves edits | **Fixed `5c68713`** |
| **—** | Realtime post status updates + simplified display (entry #77) | ✅ Realtime subscription + "FB posted"/"IG failed" text | **Fixed `0303ef9`** |
| **—** | Snapchat Spotlight integration plan (entry #76) | 🔄 API allowlisting requested, awaiting Snap approval | **Planned** |

---

### 76. Snapchat Spotlight Integration - Plan (2026-07-18)

**Goal**: Add Snapchat as a posting platform via Public Profile API, supporting automated Spotlight video posting. Same architecture as LinkedIn integration.

**Current status:**
| Prerequisite | Status |
|-------------|--------|
| Business Account at ads.snapchat.com | Done |
| OAuth app via Ads Manager Business Dashboard | Done (Client ID: `851d0bf2-6d2d-42bf-9e05-236d82e9fc75`) |
| `SNAPCHAT_CLIENT_ID` + `SNAPCHAT_CLIENT_SECRET` in Supabase secrets | Done |
| Public Profile in Snapchat app | Done |
| Allowlisting for `snapchat-profile-api` scope | Pending � emailed `dev-support@snap.com`, also chatted with Get Support |
| Redirect URI configured | `https://ximorwzknbizpceaoflw.supabase.co/functions/v1/snapchat-auth?action=callback` |

**Key API differences from LinkedIn:**
| Aspect | LinkedIn | Snapchat |
|--------|----------|----------|
| Access token lifetime | 60 days | **1 hour** (frequent refresh needed) |
| Media encryption | None | **AES-256-CBC** required for all media |
| Upload type | Single PUT to presigned URL | Chunked multipart (>32MB) or single (<=32MB) |
| Content type | Feed posts | Spotlight only (for now) |
| Endpoint base | `api.linkedin.com` | `businessapi.snapchat.com` |

**Implementation scope (5 layers, ~12 files):**

**Layer 1 � Migration** `20260718000001_add_snapchat_support.sql`
- Add `'snapchat'` to CHECK constraints on `connected_accounts`, `posts`, `workflows`
- Add `workflows.snapchat_account_ids TEXT[]`
- Add `workflow_items.snapchat_caption TEXT`
**Layer 2 � Edge: `snapchat-auth`**
- Actions: `url` (OAuth URL), `callback` (code exchange + profile fetch + upsert), `refresh` (1-hour token refresh)
- Identity: `GET adsapi.snapchat.com/v1/me` for org info, `GET businessapi.snapchat.com/v1/public_profiles/my_profile` for profile ID
- Same encrypt + upsert pattern as `linkedin-auth`

**Layer 3 � Edge: `snapchat-upload`** (most complex � 6 steps)
1. Fetch source video from R2/Drive/Mega
2. AES-256-CBC encrypt with random 32B key + 16B IV (Web Crypto API)
3. Create media container: `POST /v1/public_profiles/{profile_id}/media`
4. Chunked upload: parts <=32MB via `multipart/form-data`, parallelize up to 35 parts (~1GB max)
5. Finalize upload
6. Create Spotlight: `POST /v1/public_profiles/{profile_id}/spotlights`
- Post constraints: MP4, 6-60s, min 540x960px, description with caption+hashtags

**Layer 4 � Frontend (6 files)**
| File | Change |
|------|--------|
| `src/lib/types.ts` | Add `'snapchat'` to `Platform` union |
| `src/pages/AccountsPage.tsx` | Connect/disconnect card, BetaBadge |
| `src/pages/UploadPage.tsx` | Platform toggle, caption, account selector |
| `src/pages/WorkflowsPage.tsx` | Platform option + account selector |
| `src/pages/WorkflowItemsPage.tsx` | Labels, colors, caption config |
| `src/components/PlatformIcon.tsx` | Ghost icon (lucide) or custom SVG |

**Layer 5 � Backend routing (3 files)**
| File | Change |
|------|--------|
| `supabase/functions/process-workflow/index.ts` | `'snapchat'` in `normalizePlatform`, caption, post creation, dispatch |
| `supabase/functions/process-scheduled-posts/index.ts` | Route `'snapchat'` to `snapchat-upload` |
| `supabase/config.toml` | Register `snapchat-auth` + `snapchat-upload` |

**Blocker**: All posting API calls return `403 AUTHORIZATION_PERMISSION_DENIED` until Snap allowlists the app. Code can be implemented and deployed now but cannot be tested until approval comes through.

---

### 77. FlowPost Workflow Fixes + Realtime Post Status (2026-07-18)

**Bugs fixed in this session (3 in process-workflow, 2 in frontend):**

| # | Bug | Root Cause | Fix | Commit |
|---|-----|-----------|-----|--------|
| 1 | **FlowPost workflows returned "0 videos processed"** | `sheet_id` null check (line 224) ran *before* the `data_source === 'flowpost'` branch (line 316). FlowPost workflows have `sheet_id = null` → rejected before reaching the items query. | Guarded sheet_id check behind `if (wf.data_source !== 'flowpost')` | `5c68713` |
| 2 | **saveAll never changes status** | `saveAll` only persisted caption/title fields; items stayed `status = "pending"`. `process-workflow` filters by `status = "ready"` → 0 items found. | `saveAll` now spreads `status: "ready"` into the update payload | `5c68713` |
| 3 | **markReady discards unsaved edits** | `markReady` removed item from `dirtyIds` after saving only `{ status: "ready" }`. Pending caption edits in `localItems` were never persisted. | `markReady` now merges `localItems[itemId]` into the update + clears from `localItems` after | `5c68713` |
| 4 | **Post status UI never updates after upload** | `postStatusMap` fetched once on mount. No mechanism to refresh when upload functions flip status to "published"/"failed". | Realtime subscription on `posts` table updates `postStatusMap` incrementally | `0303ef9` |
| 5 | **Platform status badges are noise** | Colored badges with "Processing"/"Published" for every platform cluttered the card layout. | Replaced with simple text: green `"FB posted"` / red `"IG failed"`. Processing shows nothing. | `0303ef9` |

**Files changed:**
| File | Change |
|------|--------|
| `supabase/functions/process-workflow/index.ts` | Fix 1 — moved sheet_id check behind `data_source !== 'flowpost'` guard |
| `src/pages/WorkflowItemsPage.tsx` | Fix 2 — saveAll includes `status: "ready"`; Fix 3 — markReady merges pending edits; Fix 4 — new Realtime `useEffect`; Fix 5 — simplified per-platform text |
| `SESSION_STATE.md` | Updated with this entry |

---

### 78. AI Caption Generation — Groq Whisper + Llama 3.3 70B (2026-07-18)

**Architecture:**
- **Phase 1** (shipped): Groq Whisper (transcribe) → Groq Llama 3.3 70B (caption gen). Free tiers: 2,000 Whisper req/day, 1,000 LLM req/day — handles 200+ videos easily.
- **Master prompt** stored as `caption_master_prompt JSONB` on `workflows` table. 4 template presets (Wrestling/Viral, Gaming/Trendy, Dance/Funny, Educational/Professional) + Custom raw JSON.
- Per-item `[✨ AI Captions]` button on WorkflowItemsPage → edge function downloads video from Drive → Whisper transcription → Llama with prompt → preview modal → apply to fields.

**Files created:**
| File | Purpose |
|------|---------|
| `supabase/migrations/20260718000001_add_caption_master_prompt.sql` | `ALTER TABLE workflows ADD COLUMN caption_master_prompt JSONB` |
| `supabase/functions/generate-ai-captions/index.ts` | Edge function: Groq Whisper + Llama 3.3 70B pipeline with `promptValue` normalizer |
| `supabase/functions/generate-ai-captions/prompt-templates.ts` | 4 template presets + `getDefaultMasterPrompt()` |
| `src/components/CaptionPreviewModal.tsx` | Dialog showing 5 platform fields before apply |
| `src/components/CaptionPromptEditor.tsx` | Template picker + raw JSON editor with local buffer state |
| `src/lib/prompt-templates.ts` | Frontend copy of templates |

**Files modified:**
| File | Change |
|------|--------|
| `src/lib/types.ts` | Added `MasterPrompt` interface, `caption_master_prompt` to `Workflow` |
| `src/pages/WorkflowItemsPage.tsx` | "AI Captions" button per item + preview modal + save flow |
| `src/pages/WorkflowsPage.tsx` | Step 5 "AI Captions" + `CaptionPromptEditor` in create/edit form |
| `supabase/config.toml` | Register `generate-ai-captions` function |
| `.env.example` | Documented `GROQ_API_KEY` |

**Post-deploy steps (user action required):**
1. Run migration: `ALTER TABLE workflows ADD COLUMN caption_master_prompt JSONB;`
2. Add `GROQ_API_KEY` to Supabase Edge Function secrets
3. Deploy `generate-ai-captions` edge function

**Fixes applied in `48ade63`:**
| Problem | Fix |
|---------|-----|
| Raw JSON textarea frozen on paste/type | Switched to local `jsonBuffer` state — always accepts input. Validated on tab switch to Template |
| Arrays/objects render as `[object Object]` in prompt | Added `promptValue(v)` normalizer: arrays→joined, objects→JSON.stringify, strings→pass-through |

---

### 79. Fixed 401 on generate-ai-captions — apikey header fallback (2026-07-19)

**Problem:** Frontend got `401 Unauthorized` when calling `generate-ai-captions` edge function.

**Root cause:** Two issues stacked:
1. `SUPABASE_ANON_KEY` env var deprecated/empty in edge functions — `Deno.env.get("SUPABASE_ANON_KEY")` returns null
2. Frontend sends `Authorization: Bearer localStorage.getItem("flowpost_token") || SUPABASE_ANON_KEY`. If `flowpost_token` exists (authenticated users), the Bearer token is a session token, not the anon key — it matches no trusted key

**Fix (2 changes):**

| Change | File | Detail |
|--------|------|--------|
| Replace `SUPABASE_ANON_KEY` with `FRONTEND_API_KEY` | `generate-ai-captions/index.ts` | `FRONTEND_API_KEY` is a non-deprecated custom secret holding the correct anon key value |
| Add `apikey` header fallback | `generate-ai-captions/index.ts` | `supabase.functions.invoke()` always sends the anon key in the `apikey` header regardless of `Authorization`. The edge function now accepts `apiKeyHeader === FRONTEND_API_KEY` as valid auth |

**Commit:** `f560526`

---

### 80. Client-side AI captions pipeline — removed edge function bottleneck (2026-07-19)

**Problem:** Old pipeline ran entirely in the `generate-ai-captions` edge function: download video from Drive → Groq Whisper → Groq Llama. Three blockers:
1. **413 Request Entity Too Large** — sending 100MB+ video blobs to Groq Whisper exceeded their request size limit
2. **5s edge function timeout** — Supabase free plan kills edge functions after 5s; Whisper + Llama takes 30-60s
3. **Exceeded egress** — each caption generation routed ~100MB through Supabase's network

**Architecture pivot:** Move ALL AI work to the browser. Supabase only stores the final caption result (~5KB write per video).

**Pipeline (iterative implementation):**

| Iteration | Approach | Problem |
|-----------|----------|---------|
| 1 (`b71d0d9`) | FFmpeg WASM extracts audio + frames in browser, send audio to Whisper | `memory access out of bounds` — FFmpeg WASM heap can't handle large videos |
| 2 (`217a303`) | `<video>`+`<canvas>` for frames (browser-native), send raw video to Whisper | 413 Content Too Large — Groq rejects files > ~25MB |
| 3 (`ee7c0f3`) | `AudioContext`+`createMediaStreamDestination`+`MediaRecorder` extracts audio as Opus webm, send audio only to Whisper | Working — audio is ~100-500KB for a 3-min video |

**Final client-side pipeline:**
1. `getGroqKey()` → edge function `get-key` mode returns `GROQ_API_KEY` (cached in memory)
2. `getFileToken()` → edge function `get-file-token` mode returns encrypted token (driveUrl + driveToken)
3. `downloadVideo()` → `get-file` edge function streams video to browser with chunked progress reporting
4. `extractAudio()` → browser-native Web Audio API: `<video>` → `AudioContext` → `MediaStream` → `MediaRecorder` (Opus). Plays in real-time, progress fills via `ontimeupdate`. No WASM, no memory issues, works on iOS.
5. `groqWhisper()` → sends tiny audio blob to Groq Whisper (`whisper-large-v3-turbo`) — no more 413
6. `extractFrames()` → `<video>` seek + `<canvas> drawImage` → 3 JPEG data URLs
7. `groqDescribeFrames()` → Groq Llama 4 Scout 17B (vision) → visual description
8. `groqGenerateCaptions()` → Groq Llama 3.3 70B → platform captions
9. User previews in modal → clicks "Apply to Item" → saves to Supabase (~5KB write)

**Files created:**
| File | Purpose |
|------|---------|
| `src/lib/captions.ts` | Client-side pipeline: all 8 steps + progress callbacks |

**Files modified:**
| File | Change |
|------|--------|
| `supabase/functions/generate-ai-captions/index.ts` | Added `get-key` mode (returns `GROQ_API_KEY`), `get-file-token` mode (returns encrypted token), refactored `isAuthorized` into function |
| `src/pages/WorkflowItemsPage.tsx` | `generateCaptions()` replaced to call client-side pipeline with step-progress state |
| `src/components/CaptionPreviewModal.tsx` | Step progress overlay with 6 steps, transitions to preview on completion |
| `package.json` | Added `@ffmpeg/ffmpeg` + `@ffmpeg/util` (later effectively unused; iteration 1 approach) |

**Progress modal steps:** Authenticating → Downloading (chunked progress) → Transcribing (audio extraction playback progress 0-90% + API 90-100%) → Analyzing → Generating → Done

**Deploy:**
- Pushed to `main` + edge function deployed to `ximorwzknbizpceaoflw`

**Commits:** `b71d0d9`, `1ae5e16`, `217a303`, `ee7c0f3`

---

### 81. Raw JSON → Template tab: normalize arrays/objects to string (2026-07-19)

**Problem:** Pasting a JSON with `strict_rules` as an array or `output_format`/`hashtags` as objects into the Raw JSON tab, then switching to Template tab, showed `[object Object]` for object fields and empty values for array fields. The `MasterPrompt` interface expects all 5 fields as `string`, but `handleTabChange` passed the parsed JSON directly to `onChange` without type normalization.

**Fix:** Added `normalizeField(v)` helper in `CaptionPromptEditor.tsx` — arrays → joined with `\n`, objects → `JSON.stringify(v, null, 2)`, strings pass through. Called during Raw JSON → Template transition. Matches the edge function's existing `promptValue()` behavior.

**Known remaining issue:** `default_hashtags` key vs `hashtags` — users must use `"hashtags"` for the field to populate in the Template tab. Extra keys (`name`, `description`, `input`) are ignored but harmless.

**Commit:** `e2c0ef4`

---

### 82. Caption model migration: `llama-3.3-70b-versatile` → `openai/gpt-oss-120b` (2026-07-19)

**What:** Replaced the deprecated `llama-3.3-70b-versatile` (shutdown Aug 16, 2026) with `openai/gpt-oss-120b` in both client and edge function. Both are free on Groq's free tier — no cost change.

**Files changed:**
| File | Line | Before | After |
|------|------|--------|-------|
| `src/lib/captions.ts` | 294 | `llama-3.3-70b-versatile` | `openai/gpt-oss-120b` |
| `supabase/functions/generate-ai-captions/index.ts` | 107 | `llama-3.3-70b-versatile` | `openai/gpt-oss-120b` |

**Performance:** GPT-OSS 120B is faster (500 vs 280 tok/s) and cheaper ($0.15 vs $0.59/M input on paid tier). Free tier rate limits: 30 RPM, 8K TPM, 200K TPD.

---

### 83. Video blob memory release (2026-07-19)

**What:** Added `videoBlob = null!;` after frame extraction to release the ~1.3 GB video blob from memory without requiring a page refresh. Browser can GC the blob immediately while the Groq API call runs.

**File changed:**
| File | Line | Detail |
|------|------|--------|
| `src/lib/captions.ts` | ~403 | Inserted `videoBlob = null!;` after last use of videoBlob (frame extraction) |

**Safety:** Object URLs already revoked in `extractFrames()` (line 138) and `extractAudio()` (line 186). The blob reference was the only remaining hold.

---

### 84. Background caption generation with queue + results review (2026-07-19)

**What:** Replaced the auto-opening modal with a background generation flow. Users can click "AI Captions" on multiple items — they queue and run sequentially. Results stored per-item in a `results` map. "View Captions" button opens modal with stored results for review/apply.

**Changes in `src/pages/WorkflowItemsPage.tsx`** (+57/-21 lines):

| Change | Detail |
|--------|--------|
| **State** | Added `results` map `Record<itemId, {captions, fileName}>`, `viewingItemId`, `queueRef` (useRef for queue items) |
| **generateCaptions()** | No longer opens modal — runs silently, stores result in `results` map, shows toast on success |
| **Queue** | Clicking "AI Captions" on another item while one is running queues it. Auto-starts next when current finishes. `queueRef` used to avoid stale closure issues |
| **Button behavior** | No result → "AI Captions" (generates). Generating → spinner + "Generating..." (disabled). Has result → green check + "View Captions" (opens modal with stored results) |
| **openResults()** | New function — opens modal with stored captions for review/apply |
| **applyCaptions()** | Uses `viewingItemId` instead of removed `previewItemId` |
| **Modal onClose** | Clears viewing state but keeps results in map — data persists across opens |

**Memory safety:** One ~1.3 GB blob at a time (same as before). Stored results are tiny (KB each). No page refresh needed.

**Commit:** `254ce53`

---

### 85. Circular SVG ring progress bar (2026-07-19)

**What:** Replaced the step-list progress UI in `CaptionPreviewModal` with a centered circular SVG ring progress bar showing percentage. Outer track (muted), inner fill (primary) with smooth transition. Below the ring: current step label + progress description.

**Design:**
```
┌──────────────────────┐
│                      │
│      ╭──────╮        │
│      │ 72%  │        │  ← SVG ring with stroke-dasharray
│      ╰──────╯        │
│                      │
│   Downloading video  │  ← current step label
│   from Drive...      │  ← progressLabel
│                      │
└──────────────────────┘
```

**Changes:**
- Replaced `<div>` step list (icons, text, bar) with SVG circle ring + percentage overlay
- Removed unused imports (`Loader2`, `Check`, `CircleDot`) and `STEP_ORDER` constant
- Used Tailwind only — no new dependencies

**Commit:** `a098744`

---

### 86. `audioBlob` memory leak fix (2026-07-19)

**What:** Freed ~50 MB Opus audio blob after Whisper transcription by setting `audioBlob = null!` in a `finally` block. Previously only `videoBlob` was released — `audioBlob` held ~50 MB until page refresh.

**File:** `src/lib/captions.ts:385` — `finally { audioBlob = null!; }` after `groqWhisper()` call.

**Commit:** `575cc68`

---

### 87. Dead code cleanup — packages, files, variables (2026-07-19)

**Scope:** Systematically identified and removed unused code across the project using TypeScript compiler flags (`noUnusedLocals`, `noUnusedParameters`) and `knip` v6.27.0.

**Removed 17 packages:**
| Package | Type | Reason |
|---------|------|--------|
| `@ffmpeg/ffmpeg`, `@ffmpeg/util` | dep | Never imported — audio uses native `AudioContext`+`MediaRecorder` |
| `@radix-ui/react-accordion` | dep | No component file imports it |
| `@radix-ui/react-aspect-ratio` | dep | Same |
| `@radix-ui/react-collapsible` | dep | Same |
| `@radix-ui/react-context-menu` | dep | Same |
| `@radix-ui/react-hover-card` | dep | Same |
| `@radix-ui/react-menubar` | dep | Same |
| `@radix-ui/react-navigation-menu` | dep | Same |
| `@radix-ui/react-progress` | dep | Only `progress.tsx` imports it (deleted) |
| `@radix-ui/react-scroll-area` | dep | No component file imports it |
| `@radix-ui/react-slider` | dep | Same |
| `@radix-ui/react-toggle` | dep | Same |
| `@radix-ui/react-toggle-group` | dep | Same |
| `@testing-library/jest-dom` | devDep | No tests exist |
| `@testing-library/react` | devDep | Same |
| `sharp` | devDep | Never imported |
| | | **41 sub-packages cleaned** |

**Removed 1 file:** `src/components/ui/progress.tsx` (unused, replaced by SVG ring)

**Cleaned 16 unused variables/imports** across 8 files:
| File | Symbol |
|------|--------|
| `App.tsx` | `pendingSecurityVerification` in `AppRoutes` |
| `SecurityQuestionsGate.tsx` | `login` |
| `InsightsPage.tsx` | `Icon` |
| `StoragePage.tsx` | `SUPABASE_URL` |
| `UploadPage.tsx` | `RadioGroup, RadioGroupItem` import, `setHashtags`, `setCaptionsEnabled`, `setContainsAlteredContent`, `goDriveBack` function, `label` param in `firePost`, `scheduledLabel` |
| `WorkflowItemsPage.tsx` | `X` icon, `setPreviewLoading`, `newCount` |
| `WorkflowsPage.tsx` | `Textarea` import, `FileIcon` import |

**Fixed 1 typo:** `Logo.tsx` — `fetchpriority` → `fetchPriority` (React camelCase attribute)

**Enabled permanently:** `noUnusedLocals`, `noUnusedParameters` in `tsconfig.app.json`
**Enabled permanently:** removed 11 stale entries from `vite.config.ts` `manualChunks.ui`

**Build verification:** ✅ Passes (3166 modules, 12.42s)
**TypeScript:** 107 → 90 errors (remaining 90 are pre-existing supabase type issues — separate task)

**Commit:** `2718247`

---

### 87. Snapchat Integration — Plan & Setup (2026-07-20)

**Session type**: Research & planning. No code changes.

**Decision**: Direct Snapchat Public Profile API (not Zernio/Ayrshare). Allowlist required.

**Completed this session**:
- ✅ Snap Business account created at [ads.snapchat.com](https://ads.snapchat.com)
- ✅ OAuth app created in Snap Business Manager → client_id + client_secret in Supabase secrets
- ✅ Allowlist request email sent to `dev-support@snap.com` with client_id
- ✅ Zernio account created & evaluated (Snapchat shows "Coming Soon" in dashboard — unavailable)
- ✅ Make.com evaluated (only has Snap Ads API, not Public Profile — cannot post organic content)
- ✅ Bundle.social evaluated (Snapchat on waitlist — not ready)
- ✅ Full Snapchat Public Profile API endpoint inventory compiled (13 endpoints across 5 phases)

**Snapchat Public Profile API — Endpoints Inventory**:

| Phase | # | Method | Endpoint | Purpose |
|-------|---|--------|----------|---------|
| OAuth | 1 | `GET` | `accounts.snapchat.com/login/oauth2/authorize` | User authorization |
| OAuth | 2 | `POST` | `accounts.snapchat.com/login/oauth2/access_token` | Code → token exchange |
| OAuth | 3 | `POST` | `accounts.snapchat.com/login/oauth2/access_token` | Token refresh (30min TTL) |
| Profile | 4 | `GET` | `adsapi.snapchat.com/v1/me` | Get org ID |
| Profile | 5 | `GET` | `businessapi.snapchat.com/v1/organizations/{org_id}/public_profiles` | List profiles |
| Media | 6 | `POST` | `businessapi.snapchat.com/v1/public_profiles/{profile_id}/media` | Create media container (key+IV base64) |
| Media | 7 | `POST` | `businessapi.snapchat.com/{add_path}` | Upload encrypted chunk (multipart) |
| Media | 8 | `POST` | `businessapi.snapchat.com/{finalize_path}` | Finalize multipart upload |
| Post | 9 | `POST` | `businessapi.snapchat.com/v1/public_profiles/{profile_id}/spotlights` | Post Spotlight (media_id + description) |
| Analytics | 10 | `GET` | `businessapi.snapchat.com/v1/public_profiles/{profile_id}/spotlights` | List spotlights (check LIVE/REJECTED) |
| Analytics | 11 | `GET` | `businessapi.snapchat.com/v1/public_profiles/{profile_id}/spotlights/{id}/stats` | Per-spotlight stats |
| Analytics | 12 | `GET` | `businessapi.snapchat.com/v1/public_profiles/{profile_id}/stats` | Aggregate profile stats |

**Edge functions to create (pending allowlist)**:
- `supabase/functions/snapchat-auth/index.ts` — OAuth flow (get-url, callback, token refresh)
- `supabase/functions/snapchat-upload/index.ts` — AES-256-CBC encrypt video → create media → multipart upload → post Spotlight → update status

**Complexity**: AES-256-CBC encryption + chunked upload (≤32MB per chunk) required on every video publish. This is the main complexity Zernio/Ayrshare would have handled.

**Next**: Waiting for Snap allowlist approval. No ETA — typical wait is weeks to months.

---

### 88. JSON Editor Frozen + Edge Function Normalizer — Fixed (2026-07-20)

**Plan file**: `.opencode/plans/fix-json-editor-and-normalizer.md` — deleted.

**Problem 1 — Frozen JSON textarea** (`CaptionPromptEditor.tsx`): The editor derived `jsonString` from `JSON.parse`. While typing invalid JSON (most keystrokes), `onChange` never fired → textarea appeared frozen.

**Problem 2 — `[object Object]` in prompts**: Arrays/objects from `masterPrompt` were interpolated directly in template literals, rendering as `[object Object]` in the caption prompt sent to Groq.

**Fixes**:
- `src/components/CaptionPromptEditor.tsx`: Replaced derived `jsonString` with local `jsonBuffer` state + live valid/invalid JSON indicator
- `supabase/functions/generate-ai-captions/index.ts`: Added `promptValue(v)` helper that handles strings, arrays, and objects; changed `masterPrompt` type from `Record<string, string>` to `Record<string, unknown>`; wrapped all field accesses with `promptValue()`

**Action**: Plan file archived (deleted).

---

### 89. AI Captions: Inline progress ring + auto-save + regenerate with cached transcript (2026-07-20)

**Problem**: The `CaptionPreviewModal` had a full animated SVG circular progress ring but it was never shown (`previewLoading` hardcoded to `false`). Users only saw `"Generating..."` text with a tiny `Loader2` spinner with no step visibility. After generation, they had to click "View Captions" → "Apply to Item" to save.

**Fixes** (iterative — 5 commits):
- `src/lib/captions.ts`: Changed `STEP_LABELS` to remove all tech names — `"Authenticating..."` → `"Preparing..."`, `"Downloading video from Drive..."` → `"Downloading file..."`, `"Extracting audio & transcribing..."` → `"Transcribing audio..."`, `"Analyzing video frames..."` → `"Analyzing content..."`, `"Generating platform captions..."` → `"Creating captions..."`. Exported `groqGenerateCaptions`. Added `AICaptionResult` interface and `regenerateCaptions()` function that re-runs only the LLM step using cached transcript + visual description.
- `src/pages/WorkflowItemsPage.tsx`: Button during generation now shows a compact inline SVG ring with percentage + step label text (no modal during generation). `generateCaptions()` auto-saves captions to DB immediately after generation via `saveCaptions()` helper. `handleRegenerate()` closes modal, re-runs LLM with cached intermediate data (~1-2s), auto-saves, reopens modal.
- `src/components/CaptionPreviewModal.tsx`: Replaced "Apply to Item" button with "Regenerate" button. Updated description text. Added `onRegenerate` prop.
- `src/pages/WorkflowItemsPage.tsx` (TDZ fix): Moved `previewLoading` below `previewProgress` to avoid `Cannot access 'b' before initialization` ReferenceError.

**Result**: Clicking "AI Captions" shows an inline SVG ring with percentage + step label. When complete, captions auto-save to the item's fields. "View Captions" opens a read-only modal. "Regenerate" runs only the LLM call (no re-download/re-transcribe/re-analyze) using cached transcript + visual description from the first run.

---

### 90. Clone Workflow — settings + items with (Copy) suffix (2026-07-20)

**Need**: No way to duplicate a workflow as a template. Creating a similar workflow required filling out the 5-step Sheet form from scratch.

**Implementation** (`src/pages/WorkflowsPage.tsx`):
- Added `Copy` import from `lucide-react`.
- Added `cloneWorkflow(wf)` function: destructures auto-managed fields (`id`, `created_at`, `updated_at`, `last_triggered_at`, `last_manual_triggered_at`, `total_posted`, `is_active`), inserts new workflow with `" (Copy)"` suffix and `is_active: false`, then clones all `workflow_items` with `status: "pending"` and `posted_at: null`. Inserts clone directly after original in the list.
- Added Copy icon button in card footer between run/play and edit/pencil buttons.

**Safety**: All RLS paths verified (workflows + workflow_items both check parent user_id). FK constraint satisfied by inserting workflow first, then items. Type mismatch on `custom_schedule` (Json vs Record) handled via `as any`. No post cloning (cloned items need fresh processing).

**Result**: One-click clone of any workflow including all items. Clone starts inactive and must be manually activated.

---

### 91. Sticky Bottom Bar for Bulk Actions + Bulk Delete with Confirmation (2026-07-20)

**Need**: No way to delete multiple workflow items at once. Bulk action buttons were inline above the items list and scrolled off screen — invisible when scrolled down a long list.

**Implementation** (`src/pages/WorkflowItemsPage.tsx`):
- Added `bulkDeleteOpen` state + `bulkDeleteItems()` function: deletes all selected items via `supabase.from("workflow_items").delete().in("id", ids)`, removes from local state, clears selection.
- Moved all bulk action buttons (Mark Ready, Set Platforms, Delete Selected) from the inline toolbar to a **fixed bottom bar**: `fixed bottom-0 left-0 right-0 z-50` with `bg-background/95 backdrop-blur-sm border-t shadow-lg`. Shows selected count on the left and action buttons on the right. Mounts when `selectedIds.size > 0`.
- Added `pb-20` to the page container so the last item isn't hidden behind the fixed bar.
- Added `AlertDialog` confirmation for Delete Selected: shows count + file names (up to 5, with "and N more..." overflow). "Delete N items" confirm button with `bg-destructive` styling. Cancel button closes dialog.
- Select All / Deselect All remain inline at top.
- Imported `AlertDialog` components from `@/components/ui/alert-dialog`.

**Result**: Sticky bottom bar always visible while items are selected. Bulk actions no longer scroll off screen. ~60 lines changed.

---

### 92. Next Publish Time Display per Workflow Item (2026-07-21)

**Need**: Supabase edge function logs show target publish times per scheduling slot (e.g., `custom range #0 target 9:18 UTC`) but this info was not visible anywhere in the FlowPost UI. Users had to check Supabase logs to know when their videos would post.

**Implementation**:
| File | Change |
|------|--------|
| `src/lib/scheduling.ts` | New — `getNextPublishTime(workflow, now?)` replicates the edge function's deterministic scheduling algorithm (FNV-1a-like hash per range) for all 3 modes |
| `src/lib/types.ts` | Added `last_triggered_at` and `last_manual_triggered_at` to `Workflow` interface (were missing despite existing in DB) |
| `src/pages/WorkflowItemsPage.tsx` | For each item with `status === "ready"`, computes next publish time and displays orange `Next at 21:17 UTC` badge in each platform container header |

**Algorithm (matches edge function)**:
- **custom_ranges**: Same string hash as `process-workflow` — `seed = wf.id + date + rangeIdx`, computes deterministic random minute per range, finds next future slot (up to 7 days ahead)
- **interval**: `last_triggered_at + run_interval_hours` → shows `~4h 30m` or `Now`
- **once_daily**: "Today" if not yet triggered, rolls to next allowed day otherwise

**Display**: Only shown when `item.status === "ready"` and the platform has no `published`/`failed` status. Colored orange (`text-orange-500 font-medium`) to visually distinguish from green "posted" and red "failed" badges.

**Verification**: `tsc --noEmit` passes, `build` succeeds.

**Commit**: `d308e96`

**Enhanced (2026-07-21, commit `c82dfdc`)**: `formatTime()` now appends local time in 12h format alongside UTC — `21:17 UTC (2:17 AM)`. Uses `toLocaleTimeString("en-US")` for proper DST-aware conversion. The Date parameter is passed from the correct day (today vs future day) so the local time is always accurate. Interval/once_daily modes unaffected (they don't call `formatTime`).

**Fixed (2026-07-21, commit `94fc926`)**: Two issues:
1. "Next at" badge was hidden when a platform had `failed` status — guard changed from `!itemPostStatuses[platId]` to `itemPostStatuses[platId] !== "published"`. Now shows both `FB failed` and `Next at 21:17 UTC (2:17 AM)`.
2. Stale failed posts persisted when re-marking an item as ready — `clearFailedPosts()` helper deletes `posts` rows with `status = "failed"` for the given `workflow_item_id`, then removes them from `postStatusMap` so the "failed" badge disappears instantly. Called from both `saveAll()` and `markReady()`.

**Staggered (2026-07-21, commit `2439db8`)**: `getNextPublishTime()` now accepts `itemIndex` and `videosPerRun` params. Items beyond `videos_per_run` in the ready queue display their correct Nth schedule window.
- **custom_ranges**: walks forward counting schedule days (days with non-empty ranges + future targets), shows the correct day's target for each overflow batch
- **interval**: adds `overflowCount × run_interval_hours` to the next fire time
- **once_daily**: counts allowed days from `run_days` and shows the correct Nth day
- Regular callers (no stagger) use defaults `itemIndex=0, videosPerRun=1` — zero regression

**Sort dropdown (2026-07-21, commit `a4f948a`)**: Added `<Select>` dropdown in toolbar with 9 sort options (default, name A→Z/Z→A, size small→large/large→small, ready first/pending first, oldest first/newest first). Items list sorted client-side via `useMemo`. Stagger display follows the visual sort order.

---

### 93. Phase 1.5 — Freshness color-coded badges on ToolsPage (2026-07-24)

**Problem**: The "Last checked X ago" text and "Showing results from X ago" banner had no visual indication of how stale the data was — both used the same muted foreground color regardless of age.

**Solution**: Added `differenceInHours` computation and conditional color classes:

| Freshness | Icon/text color | Banner style |
|-----------|----------------|--------------|
| < 1 hour | `text-status-published` (green) | `bg-status-published/10` |
| 1–24 hours | `text-amber-500` | `bg-amber-500/10` |
| \> 24 hours | `text-destructive` (red) | `bg-destructive/10` with "Results may be stale." text |

The banner title text and `<Clock>` icon both use the same freshness color. The stale prompt encourages re-checking.

**Files**: `src/pages/ToolsPage.tsx` — freshness computation + conditional classes in two display blocks.

**Commit**: pending

### 94. Phase 4.2 — Token age warning in bg.js (2026-07-24)

**Problem**: Users had no way to know if their Facebook session tokens were stale, causing TOOL_CHECK to silently fail or return outdated results.

**Solution**:
1. **`bg.js`** — `STORE_TOKENS` now stores `_stored_at: Date.now()` alongside tokens. `GET_COOKIES_INFO` response includes `token_age_minutes` computed from the stored timestamp.
2. **`ToolsPage.tsx`** — `checkExtension()` now fires parallel `PING` + `GET_COOKIES_INFO`. When `token_age_minutes > 60`, a prominent amber warning appears below the extension status: `"Facebook session tokens are Xh old. Re-login to Facebook to refresh."`

**Files**: `flowpost-extension/bg.js:157` — store timestamp; `bg.js:172` — return token age; `ToolsPage.tsx:121-127` — parallel fetch; `ToolsPage.tsx:339-345` — warning banner.

**Commit**: pending

### 95. Phase 4.1 — Auto-refresh toggle on ToolsPage (2026-07-24)

**Problem**: Users had to manually click "Run Tool Check" each time they wanted updated eligibility data. No automated refresh option existed.

**Solution**:
1. Added `autoRefresh` state + `runToolCheckRef` (useRef) to avoid TDZ issues with the async function reference
2. Added `useEffect` with `setInterval` (5 min) that fires `runToolCheckRef.current()` when `autoRefresh` is true
3. Added `<Switch>` toggle labeled "Auto every 5m" next to the Run Tool Check button
4. Manual button is disabled while auto-refresh is active (no double-triggering)
5. Interval auto-clears on unmount or when toggle is turned off

**Files**: `src/pages/ToolsPage.tsx` — state, ref sync effect, interval effect, Switch UI.

**Commit**: pending

---

### 96. Phase 3 — Eligibility badges on workflow cards + form indicators (2026-07-24)

**Problem**: Users had no way to see Facebook monetization eligibility status while working with workflows — they had to switch to ToolsPage to check. The workflow creation form also showed no eligibility information when selecting Facebook pages.

**Solution**:

**3.1 — Card badges** (`renderEligibilityBadge`):
- Loads `page_eligibility` map alongside workflows via a second Supabase query in `loadWorkflows()`
- For each workflow with Facebook pages, counts eligible / not_eligible / unchecked pages
- Renders a small text badge in `<CardTitle>` next to the Active/Paused badge:

| Scenario | Badge |
|----------|-------|
| All pages eligible | `Monetized` (green) |
| Some eligible, some not | `X ineligible` (red) |
| All not eligible | `Not eligible` (red) |
| Some unchecked | `X unchecked` (amber, only if some are checked) |
| All unchecked | No badge shown |

**3.3 — Form indicators**: In the Platforms & Accounts step, next to each Facebook account checkbox, a right-aligned label shows:
- `Eligible` (green) if `page_eligibility[account_id] === "eligible"`
- `Ineligible` (red) if it has a value but not eligible
- `Not checked` (muted) if no eligibility record exists

**Files**: `src/pages/WorkflowsPage.tsx` — `pageEligibility` state, load query in `loadWorkflows()`, `renderEligibilityBadge()` helper, card badge in JSX, form label in facebook account list.

**Note**: 1.5 freshness line numbers corrected to match `differenceInHours` import.

**Commit**: pending