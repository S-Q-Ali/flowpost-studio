> **SUPERSEDED — 2026-10-22.** Archived, not executed to completion.
> The authoritative task list is `tasks/todo.md` (Pake-based plan).
> Note: checkboxes below were never updated to reflect the actual commits — trust the plan, not this list.

# Todo List: FlowPost Desktop Application

## Phase 1: Foundation

- [ ] **Task 1:** Set up Tauri 2.0 project structure
  - Initialize Tauri project alongside existing Vite React setup
  - Configure `tauri.conf.json`
  - Add `@tauri-apps/api` and `@tauri-apps/plugin-store` dependencies
  - Create `src/preload.ts` bridge script
  - Verify `npm run tauri` works without errors
  - Verify existing `npm run dev` and `npm run build` still work

- [ ] **Task 2:** Verify existing web app renders in Tauri window
  - Get React app to mount inside Tauri window
  - Confirm all 17 routes work in Tauri
  - No console errors preventing page render
  - Tailwind styles apply correctly in Tauri context

- [x] **Checkpoint 1:** Foundation
  - [ ] Tauri .exe builds and runs
  - [ ] All basic routes functional in Tauri window
  - [ ] `npm run test` passes
  - [ ] `npm run lint` passes
  - [ ] Ready to proceed with feature implementation

## Phase 2: Core Features

- [ ] **Task 3:** Implement Auth flow in Tauri context
  - Preserve Supabase Google OAuth + admin email/password auth
  - Session persists across app launches
  - Add Tauri tray icon for auth notifications

- [ ] **Task 4:** Upload & media selection
  - Enable file upload from desktop file system
  - Integrate with existing Supabase storage
  - Support video/image selection from Windows file picker
  - Preview selected media in upload component

- [ ] **Task 5:** Platform connections (YouTube, Instagram, Facebook, TikTok, LinkedIn)
  - All 5 platform OAuth flows functional in Tauri window
  - Connected accounts display in UI with disconnect option
  - Token storage remains encrypted at rest (AES-GCM)
  - All 5 platforms selectable when scheduling a post

- [ ] **Task 6:** Dashboard & calendar view
  - Dashboard overview renders with stats cards
  - Calendar view displays by month with scheduled posts
  - 2-column grid layout (lg:grid-cols-2) functional
  - Real-time subscriptions for post status updates work

- [x] **Checkpoint 2:** Core Features
  - [ ] Auth flow works in Tauri
  - [ ] Upload + file selection functional
  - [ ] All 5 platform connections established
  - [ ] Dashboard + calendar rendering
  - [ ] Real-time updates working
  - [ ] Ready for remaining page features

## Phase 3: Remaining Pages

- [ ] **Task 7:** Workflow management
  - Create/manage workflows with custom ranges, intervals
  - Per-platform settings functional
  - Bulk actions: select all/deselect, mark as ready/posted, delete
  - Bulk caption generation with stop button

- [ ] **Task 8:** Publishing queue management
  - Queue lists scheduled posts with status badges
  - Retry button functional for failed posts
  - Posts move from scheduled → posted when published
  - Failed posts show error details; retry recovers if possible

- [ ] **Task 9:** Insights/Analytics dashboard
  - Facebook insights: follows, media views, post engagements, profile views
  - Instagram insights: follower count, reach, profile views, views
  - Date range picker functional
  - Recharts charts rendered

- [ ] **Task 10:** Tools page (Facebook monetization)
  - Facebook token extraction functional (fb_dtsg, lsd patterns)
  - Monetization eligibility check works
  - Page selection and Instagram account fetching
  - Tool checks run with stop button capability

- [x] **Checkpoint 3:** All Pages
  - [ ] All 17 web pages functional in Tauri window
  - [ ] Navigation between all routes works
  - [ ] Bulk operations functional across pages
  - [ ] AI caption generation with stop button works
  - [ ] Ready for polish & auto-updates

## Phase 4: Polish & Deployment

- [ ] **Task 11:** Auto-update mechanism
  - App checks for updates on launch (or menu command)
  - If newer .exe available, shows update prompt dialog
  - Downloads new .exe to temporary location
  - User clicks "Update" → new .exe replaces or launches installer
  - About screen shows correct version string

- [ ] **Task 12:** System tray & desktop notifications
  - App minimizes to system tray (not just taskbar)
  - Tray icon right-click: "Restore", "Exit"
  - Toast notifications for: post scheduled, published, failed
  - Clicking notification restores Tauri window to foreground

- [ ] **Task 13:** Keyboard shortcuts & accessibility
  - Ctrl+S triggers save (where applicable)
  - Ctrl+P triggers print/schedule dialog open
  - Esc closes open dialogs/modals
  - High contrast mode (Windows forced-colors) doesn't break UI
  - Focus trap in modals works with keyboard only

- [x] **Checkpoint 4:** Complete
  - [ ] All 17 features functional in Tauri .exe
  - [ ] Auto-update mechanism working
  - [ ] System tray + notifications functional
  - [ ] Keyboard shortcuts configured
  - [ ] High contrast accessible
  - [ ] `npm run build` produces working .exe
  - [ ] `npm run test` passes ≥80% coverage on changed files
  - [ ] `npm run lint` passes clean
  - [ ] Documentation updated (plan + intent doc)
  - [ ] Ready for user review and testing