> **SUPERSEDED — 2026-10-22.** Archived, not executed to completion.
> Replaced by `tasks/plan.md` (Pake-based packaging). The hand-written `src-tauri/` fork
> described below was left non-building (empty Rust command layer, `src/preload.ts` never
> committed, Tailwind v4 migration half-applied). The scaffold and the three Tauri commits
> are preserved on branch `feature/desktop-tauri-fork`. Retained for reference only.

# Implementation Plan: FlowPost Desktop Application (Windows)

## Overview

Build a fully functional FlowPost desktop application for Windows with feature parity to the current web app (17 pages/features), using Tauri 2.0 as a lightweight .exe wrapper around the existing React + TypeScript + Vite + Tailwind + Supabase codebase. Windows-only initial release.

**Project Scope:** 17 web pages adapted to desktop Tauri window. No Electron - using Tauri with WebView2 for lighter .exe binary.

**Key Decisions:**
- Tauri 2.0 + WebView2 (not Electron) - smaller binary, native Windows integration
- Windows-only v1.0 (macOS/Linux deferred)
- Feature parity: all 17 web features must work in desktop .exe
- Auto-update mechanism from website
- Existing Supabase auth preserved (Google OAuth + admin sessions)

---

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Tauri over Electron** | ~10MB binary vs Electron's ~100MB+; uses WebView2 (already on most Windows 10/11); native Windows APIs accessible; leverages existing React setup |
| **Windows-only v1.0** | Focus scope; macOS/Linux can be v2.0; reduces Tauri configuration complexity |
| **Feature parity with web** | All 17 pages must render and function; no "subset" desktop app; users expect full capability |
| **Auto-update from website** | Check HTTPS endpoint for new .exe version; prompt on launch if newer available; simple version comparison |
| **Existing codebase preserved** | No database schema changes, no new API endpoints; Tauri wrapper around existing React + Supabase |
| **2-column grid layout** | Already in web app (lg:grid-cols-2); adapt to Tauri window sizing not responsive breaking point |

---

## Task List

### Phase 1: Foundation (Weeks 1-2)

**Task 1: Set up Tauri 2.0 project structure**
- Description: Initialize Tauri project alongside existing Vite React setup; configure `tauri.conf.json`; add `@tauri-apps/api` and `@tauri-apps/plugin-store` dependencies; create `src/preload.ts` bridge script
- Acceptance criteria:
  - [ ] `npm run tauri` works without errors
  - [ ] Tauri window opens with React app mounted
  - [ ] `preload.ts` exposes minimal Tauri APIs to React
  - [ ] Existing `npm run dev` and `npm run build` still work
- Verification:
  - [ ] `npm run dev` launches Tauri dev mode
  - [ ] `npm run build` produces `.exe` in `src-tauri/target/`
  - [ ] No TypeScript errors in preload or Tauri configs
- Files touched:
  - `tauri.conf.json` (NEW)
  - `src/preload.ts` (NEW)
  - `package.json` (modified: add Tauri deps)
  - `vite.config.ts` (may need minor adjustments)
- Dependencies: None
- Scope: XS (1 file core + 3 config adjustments)

**Task 2: Verify existing web app renders in Tauri window**
- Description: Get the existing React app to mount inside Tauri window without modifications; confirm all 17 routes work
- Acceptance criteria:
  - [ ] Tauri window shows the React app at `http://localhost:5173` (or vite dev server)
  - [ ] Navigation to `/dashboard`, `/upload`, `/calendar`, `/workflows`, `/accounts`, `/queue`, `/insights`, `/tools`, `/profile` all load
  - [ ] No console errors preventing page render
  - [ ] Tailwind styles apply correctly in Tauri context
- Verification:
  - [ ] Open Tauri window, navigate all 9 listed routes, verify content renders
  - [ ] Run `npm run test` - all pass
  - [ ] Run `npm run lint` - no new errors
- Files touched:
  - `src/main.tsx` (minor: Tauri window setup)
  - `tauri.conf.json` (window config added)
- Dependencies: Task 1
- Scope: S (2 files: main.tsx + tauri config)

**Checkpoint 1: Foundation**
- [ ] Tauri .exe builds and runs
- [ ] All basic routes functional in Tauri window
- [ ] `npm run test` passes
- [ ] `npm run lint` passes
- [ ] Ready to proceed with feature implementation

---

### Phase 2: Core Features (Weeks 3-6)

**Task 3: Implement Auth flow in Tauri context**
- Description: Preserve Supabase Google OAuth + admin email/password auth within Tauri window; ensure session persists across app launches; add Tauri tray icon for auth notifications
- Acceptance criteria:
  - [ ] Google OAuth opens and completes successfully in Tauri window
  - [ ] Admin email/password login works
  - [ ] Session persists when app is closed and reopened (localStorage or Tauri persistence)
  - [ ] User can logout and back in
  - [ ] Tray icon shows when authenticated (optional: post status notifications)
- Verification:
  - [ ] Login flow end-to-end: click Google Auth → Supabase redirect → session stored → dashboard accessible
  - [ ] Logout clears session, returns to login screen
  - [ ] Re-opening app retains session
- Files touched:
  - `src/contexts/AuthContext.tsx` (modify for Tauri persistence if needed)
  - `src/preload.ts` (add session restore API if needed)
  - `tauri.conf.json` (tray icon config)
- Dependencies: Task 2
- Scope: M (3 files: auth context, preload, tray config)

**Task 4: Upload & media selection**
- Description: Enable file upload from desktop file system (not just browser); integrate with existing Supabase storage; support video/image selection from Windows file picker
- Acceptance criteria:
  - [ ] "Upload file" button opens Windows file picker (Tauri fs API)
  - [ ] Selected video/image preview displays in upload component
  - [ ] File uploads to Supabase Storage with progress tracking
  - [ ] Supported formats: MP4, MOV, JPEG, PNG, WebM (same as web app)
  - [ ] Max 200MB file limit enforced (existing constraint)
- Verification:
  - [ ] Click upload → Windows file picker opens → select media → preview shows
  - [ ] Upload to Supabase completes; progress bar animates
  - [ ] Large files (>200MB) rejected with appropriate message
  - [ ] File types outside supported list rejected
- Files touched:
  - `src/pages/UploadPage.tsx` (modify file input to use Tauri fs)
  - `src/preload.ts` (add `selectFile` Tauri API)
  - `src/lib/upload.ts` (may need Tauri integration)
- Dependencies: Task 3 (auth must work first for session uploads)
- Scope: M (3 files: upload page, preload API, upload lib)

**Task 5: Platform connections (YouTube, Instagram, Facebook, TikTok, LinkedIn)**
- Description: Preserve existing Supabase platform connection flow; each platform's OAuth flow works within Tauri window; manage tokens and account selection
- Acceptance criteria:
  - [ ] Connect buttons for all 5 platforms functional in Tauri window
  - [ ] OAuth flows complete (platform-specific redirects handled by Tauri/shell)
  - [ ] Connected accounts display in UI with disconnect option
  - [ ] Token storage remains encrypted at rest (AES-GCM as existing)
  - [ ] All 5 platforms selectable when scheduling a post
- Verification:
  - [ ] Click "Connect YouTube" → OAuth completes → account appears in connections list
  - [ ] Same for Instagram, Facebook, TikTok, LinkedIn
  - [ ] Disconnect removes account and revokes tokens
  - [ ] Scheduling a post shows all connected platforms as options
- Files touched:
  - `src/pages/AccountsPage.tsx` (platform connections UI)
  - `src/integrations/supabase.ts` (if platform API configs needed)
  - `src/preload.ts` (shell API for platform OAuth redirects)
- Dependencies: Task 4 (upload needs authenticated session)
- Scope: L (4-5 files: accounts page + integration configs)

**Task 6: Dashboard & calendar view**
- Description: Render DashboardOverview and CalendarPage within Tauri window; ensure 2-column grid layout adapts to window size; real-time status updates via Supabase realtime
- Acceptance criteria:
  - [ ] Dashboard overview renders with stats cards (videos, scheduled, published)
  - [ ] Calendar view displays by month with scheduled posts positioned
  - [ ] 2-column grid layout (lg:grid-cols-2) functional in Tauri window
  - [ ] Real-time subscriptions for post status updates work
  - [ ] Navigation between dashboard and calendar works smooth
- Verification:
  - [ ] Dashboard stats load from Supabase; numbers match expected counts
  - [ ] Calendar shows current month; drag/resize if applicable
  - [ ] Switch between dashboard/calendar tabs navigation works
  - [ ] Real-time updates: post status changes reflect without refresh
- Files touched:
  - `src/pages/Dashboard.tsx` (verify Tauri compatibility)
  - `src/pages/CalendarPage.tsx` (verify rendering)
  - `src/main.tsx` (realtime subscription setup if needed)
- Dependencies: Tasks 3, 4 (auth + upload foundation)
- Scope: M (2-3 files: dashboard + calendar)

**Checkpoint 2: Core Features**
- [ ] Auth flow works in Tauri
- [ ] Upload + file selection functional
- [ ] All 5 platform connections established
- [ ] Dashboard + calendar rendering
- [ ] Real-time updates working
- [ ] Ready for remaining page features

---

### Phase 3: Remaining Pages (Weeks 7-9)

**Task 7: Workflow management**
- Description: Create/manage workflows with custom ranges, intervals, and per-platform settings; bulk actions select all/deselect, mark as ready/posted, delete
- Acceptance criteria:
  - [ ] "Create Workflow" form functional; set date range, interval, per-platform toggles
  - [ ] Workflow items appear in list with checkboxes
  - [ ] Select all / deselect all bulk operations work
  - [ ] Mark as ready bulk action functional
  - [ ] Delete workflow/item moves to trash/removes from list
  - [ ] Bulk caption generation with stop button functional
- Verification:
  - [ ] Create new workflow with specific schedule range
  - [ ] Select all checkbox selects every item in list
  - [ ] Click "Mark as Ready" on bulk selection
  - [ ] AI caption generation starts with stop capability
  - [ ] Delete removes item from list
- Files touched:
  - `src/pages/WorkflowItemsPage.tsx`
  - `src/components/bulk-actions-toolbar.tsx` (if exists) or new component
  - `src/lib/workflows.ts` (workflow scheduling logic)
- Dependencies: Tasks 3-6 (auth, upload, platforms, dashboard/calendar)
- Scope: L (3-4 files: workflow page + components + lib)

**Task 8: Publishing queue management**
- Description: Manage publishing queue with retry controls; show post status (pending, scheduled, posted, failed); per-platform retry logic
- Acceptance criteria:
  - [ ] Queue page lists all scheduled posts with status badges
  - [ ] Retry button functional for failed posts
  - [ ] Posts move from "scheduled" → "posted" status when published
  - [ ] Failed posts show error details; retry recovers if possible
  - [ ] Bulk queue operations (select all, delete from queue) work
- Verification:
  - [ ] Schedule a post → appears in queue with "scheduled" status
  - [ ] After publish time, status auto-updates to "posted"
  - [ ] Failed post shows error; retry button attempts again
  - [ ] Select all in queue works
- Files touched:
  - `src/pages/QueuePage.tsx`
  - `src/components/queue-status-badge.tsx` (if needed)
  - `src/lib/queue.ts` (queue management logic)
- Dependencies: Tasks 3-7 (all core features foundation)
- Scope: M (2-3 files: queue page + logic)

**Task 9: Insights/Analytics dashboard**
- Description: Render Facebook/Instagram insights (follows, media views, engagements) and Instagram metrics (follower count, reach, profile views) within Tauri window
- Acceptance criteria:
  - [ ] Insights page loads data from Supabase (pre-fetched or realtime)
  - [ ] Facebook insights displayed: follows, media views, post engagements, profile views
  - [ ] Instagram insights displayed: follower count, reach, profile views, views
  - [ ] Date range picker functional for insights
  - [ ] Charts rendered via Recharts library
- Verification:
  - [ ] Insights page navigates without error
  - [ ] Charts render with mock/data sample data
  - [ ] Date range change filters insights correctly
  - [ ] All metric categories display (10+ metrics across FB/IG)
- Files touched:
  - `src/pages/InsightsPage.tsx`
  - `src/components/charts/` (recharts integration if needed)
  - `src/lib/insights.ts` (data fetching from Supabase)
- Dependencies: Tasks 3-8 (foundation + core features + queue)
- Scope: M (2-3 files: insights page + charts + lib)

**Task 10: Tools page (Facebook monetization)**
- Description: Preserve Facebook monetization tools page; token extraction, eligibility checks, page/Instagram account fetching
- Acceptance criteria:
  - [ ] Tools page loads without errors
  - [ ] Facebook token extraction functional (fb_dtsg, lsd patterns)
  - [ ] Monetization eligibility check works
  - [ ] Page selection and Instagram account fetching functional
  - [ ] Tool checks run with stop button capability
- Verification:
  - [ ] Navigate to Tools page
  - [ ] Click "Check Monetization Eligibility" → result displays
  - [ ] Fetch Pages/Instagram accounts loads list
  - [ ] Stop button works during any running checks
- Files touched:
  - `src/pages/ToolsPage.tsx`
  - `src/lib/facebook-tools.ts` (if API logic needs adjustment)
  - `src/preload.ts` (any additional Tauri APIs needed)
- Dependencies: Tasks 3-9 (full foundation)
- Scope: S (1-2 files: tools page preservation)

**Checkpoint 3: All Pages**
- [ ] All 17 web pages functional in Tauri window
- [ ] Navigation between all routes works
- [ ] Bulk operations functional across pages
- [ ] AI caption generation with stop button works
- [ ] Ready for polish & auto-updates

---

### Phase 4: Polish & Deployment (Weeks 10-11)

**Task 11: Auto-update mechanism**
- Description: Implement Tauri store plugin or custom HTTP-based update check; on launch, compare current version with website hosted .exe version; prompt user to download/update if newer available
- Acceptance criteria:
  - [ ] App checks for updates on launch (or via menu command)
  - [ ] If newer .exe available, shows update prompt dialog
  - [ ] Downloads new .exe to temporary location
  - [ ] User clicks "Update" → new .exe replaces current (or launches installer)
  - [ ] Current version displayed in about screen
- Verification:
  - [ ] Set current version to "1.0.0"; simulate website having "1.0.1"; prompt appears
  - [ ] Clicking "Update" initiates download (mock)
  - [ ] About screen shows correct version string
- Files touched:
  - `src/preload.ts` (add update check API)
  - `tauri.conf.json` (store plugin config or custom update endpoint)
  - `src/pages/About.tsx` (or add to profile/Tools) - version display
- Dependencies: All previous tasks (foundation + all features)
- Scope: S (2-3 files: preload update check + tauri config + about version)

**Task 12: System tray & desktop notifications**
- Description: Add system tray icon; minimize to tray; toast notifications for post status changes (scheduled, published, failed); click tray icon to restore window
- Acceptance criteria:
  - [ ] App minimizes to system tray (not just taskbar)
  - [ ] Tray icon right-click: "Restore", "Exit"
  - [ ] Toast notifications for: post scheduled, post published, post failed
  - [ ] Clicking notification restores Tauri window to foreground
  - [ ] Notifications respect Windows Focus Assist/DND settings
- Verification:
  - [ ] Window minimizes to tray (not taskbar)
  - [ ] Right-click tray shows Restore/Exit options
  - [ ] Post published → toast notification appears
  - [ ] Post failed → toast with error message
  - [ ] Click notification → window restores
- Files touched:
  - `src/preload.ts` (add tray + notification Tauri APIs)
  - `src/main.tsx` (tray setup on app startup)
  - `src/components/ui/toast.tsx` (sonner integration already exists, just needs Tauri trigger)
- Dependencies: Task 11 (auto-update should work before tray, but can parallelize)
- Scope: S (2-3 files: preload tray APIs + main.tsx tray setup + existing toast components)

**Task 13: Keyboard shortcuts & accessibility**
- Description: Add global Windows keyboard shortcuts (Ctrl+S, Ctrl+P, Esc); ensure Tailwind `forced-colors` high contrast support; focus management in dialogs
- Acceptance criteria:
  - [ ] Ctrl+S triggers save (where applicable)
  - [ ] Ctrl+P triggers print/schedule dialog open
  - [ ] Esc closes open dialogs/modals
  - [ ] High contrast mode (Windows forced-colors) doesn't break UI
  - [ ] Focus trap in modals works with keyboard only
- Verification:
  - [ ] Keyboard shortcuts fire without conflicts
  - [ ] Esc closes open modals/dialogs
  - [ ] Toggle Windows high contrast (Win+Ctrl+F9 or via settings) → UI adapts
  - [ ] Tab navigation through all interactive elements logical
- Files touched:
  - `src/main.tsx` (keyboard shortcut registration)
  - `src/lib/shortcuts.ts` (new file: global shortcut mappings)
  - Tailwind config forced-colors (verify no breakage)
- Dependencies: Tasks 1-12 (all features should have shortcuts where applicable)
- Scope: S (2-3 files: shortcuts lib + main.tsx registration + Tailwind verify)

**Checkpoint 4: Complete**
- [ ] All 17 features functional in Tauri .exe
- [ ] Auto-update mechanism working
- [ ] System tray + notifications functional
- [ ] Keyboard shortcuts configured
- [ ] High contrast accessible
- [ ] `npm run build` produces working .exe
- [ ] `npm run test` passes ≥80% coverage on changed files
- [ ] `npm run lint` passes clean
- [ ] Documentation updated (this plan + intent doc)
- [ ] Ready for user review and testing

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Tauri WebView2 not installed on user Windows** | App fails to launch; user needs WebView2 runtime | Include WebView2 detection/upgrade prompt in onboarding; document requirement |
| **Tauri API limitations vs Electron** | Some native features may not be accessible; scope may need adjustment | Early prototyping (Task 1-2) validates required APIs; if missing, document as v2 feature |
| **OAuth redirects in Tauri window** | Platform OAuth may open external browser instead of in-window | Use Tauri `shell.openExternal` as fallback; test each platform's flow early (Tasks 5, 10) |
| **Supabase realtime over Tauri** | WebSocket realtime may behave differently in WebView2 | Fallback to polling interval if realtime fails; test in Tasks 6, 7 |
| **Auto-update endpoint hosting** | Need HTTPS endpoint to host .exe updates; may require Vercel/Netlify setup | Use existing Vercel deployment (flowpost-studio.vercel.app) to host .exe assets; simple version JSON |
| **Tray icon not appearing on some Windows versions** | Windows 10 vs 11 compatibility; DPI awareness issues | Test on Windows 10/11; set DPI awareness in tauri.conf.json; use system default icon |

---

## Open Questions (For Human Resolution)

1. **Auto-update endpoint** - Where will .exe updates be hosted? Existing Vercel app? Separate asset bucket? Need HTTPS endpoint URL format.
2. **Tray behavior** - Minimize to system tray or just taskbar? Does user expect tray notifications for post status? (Affects Tasks 12 design)
3. **Offline capability** - Should desktop app work offline with cached data, or always require internet to Supabase? (Affects auth persistence in Task 3)
4. **WebView2 requirement** - Should app detect and prompt WebView2 install if missing, or assume Windows 11/updated 10? (Affects Task 1 onboarding)
5. **About screen location** - Dedicated About page, or version in profile/Tools page? (Affects Task 11 design)
6. **Custom file associations** - Should .exe open .flowpost project files? (Out of scope v1, but worth noting)
7. **Update frequency** - Check on every launch? Daily? First launch only? (Affects Task 11 preload logic)
8. **Tauri vs alternative** - Confirm Tauri 2.0 + WebView2 is acceptable; if no, need Electron reconsideration (but user said "not Electron")

---

## Success Criteria (Final)

**Functional:**
- [ ] `.exe` installs and launches on Windows 10/11
- [ ] All 17 web pages render and are functional
- [ ] Auth (Google OAuth + admin login) works end-to-end
- [ ] Upload + media selection from desktop file system
- [ ] All 5 platform connections (YouTube, Instagram, Facebook, TikTok, LinkedIn)
- [ ] AI caption generation with stop button
- [ ] Bulk operations (select all, deselect, mark ready, delete)
- [ ] Real-time post status updates
- [ ] Calendar view and scheduling
- [ ] Queue management with retry
- [ ] Insights/analytics charts
- [ ] Tools page (Facebook monetization)
- [ ] Auto-update checks and prompts for newer version
- [ ] System tray + toast notifications
- [ ] Keyboard shortcuts (Ctrl+S, Ctrl+P, Esc)
- [ ] High contrast accessibility support

**Technical:**
- [ ] `npm run build` produces working `.exe`
- [ ] `npm run test` passes ≥80% coverage
- [ ] `npm run lint` passes with zero errors
- [ ] No TypeScript strict-mode errors
- [ ] Binary size reasonable (Tauri target: <50MB, ideally <20MB)
- [ ] Tauri window respects Windows taskbar, minimize, maximize
- [ ] No console errors preventing functionality

**Distribution:**
- [ ] `.exe` can be distributed to end users via website
- [ ] Auto-update mechanism functions from hosted endpoint
- [ ] Installer or direct .exe copy both viable

---

## Task Dependency Summary

```
Phase 1 Foundation:
  Task 1 → Task 2 → Checkpoint 1

Phase 2 Core Features:
  Task 3 → Task 4 → Task 5 → Task 6 → Checkpoint 2

Phase 3 Remaining Pages:
  Task 7 → Task 8 → Task 9 → Task 10 → Checkpoint 3

Phase 4 Polish & Deployment:
  Task 11 → Task 12 → Task 13 → Checkpoint 4 (DONE)
```

**Critical Path:** Tasks 1→2→3→4→5→6 (foundation + auth + upload + platforms + dashboard/calendar) must complete before remaining pages can be verified.

**Parallelization Opportunities:** 
- Tasks 9 (Insights) and 10 (Tools) can run in parallel after Task 8
- Task 13 (shortcuts/accessibility) can run after most UI is in place
- Tasks 11 (auto-update) and 12 (tray) can parallelize after Task 7

---
*Plan saved to `tasks/plan.md`. Task list recorded in `tasks/todo.md` (default convention).*