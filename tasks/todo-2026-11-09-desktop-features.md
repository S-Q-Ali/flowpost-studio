# Tasks: Desktop App Missing Features Parity

**Plan:** `tasks/plan-2026-11-09-desktop-features.md`  
**Status:** Complete  

---

## Phase 1 — Dashboard Stats & Recent Activity on Desktop Home (`/`)

- [x] **1.1** Backend `dashboard-stats` action in `posts-api`
  - [x] Add `dashboardStatsQuery` helper in `_shared/posts-api.ts`
  - [x] Implement `dashboard-stats` case in `supabase/functions/posts-api/index.ts`
  - [x] Vitest tests for `dashboard-stats` in `supabase/functions/_shared/posts-api.test.ts`
- [x] **1.2** Desktop data layer for Dashboard
  - [x] Create `lib/features/home/data/dashboard_models.dart` (`DashboardStats`, `RecentActivityPost`)
  - [x] Create `lib/features/home/data/dashboard_repository.dart` (`DashboardRepository`, `PostsApiDashboardRepository`)
  - [x] Create `lib/features/home/home_providers.dart`
- [x] **1.3** Desktop presentation for Dashboard
  - [x] Update `lib/features/home/home_page.dart` with 4 stat cards, quick upload button, recent activity list, and update banner
- [x] **1.4** Dashboard tests & verification
  - [x] Widget and repository tests in `test/features/home/home_page_test.dart`
  - [x] `flutter test test/features/home/` green

---

## Phase 2 — Workflows Screen (`/workflows`)

- [x] **2.1** Backend `workflows-list` & `workflow-toggle` in `posts-api`
  - [x] Add `workflows-list` and `workflow-toggle` in `_shared/posts-api.ts` and `posts-api/index.ts`
  - [x] Vitest tests in `posts-api.test.ts`
- [x] **2.2** Desktop domain & data layer for Workflows
  - [x] Create `lib/features/workflows/domain/workflow.dart`
  - [x] Create `lib/features/workflows/data/workflows_repository.dart` and `workflows_providers.dart`
- [x] **2.3** Desktop presentation for Workflows
  - [x] Create `lib/features/workflows/presentation/workflows_page.dart`
  - [x] Add active switch, schedule interval, platforms list, run history status badge, and "Run Now" trigger button
- [x] **2.4** Workflows routing & navigation
  - [x] Add `/workflows` in `app_router.dart` and `app_shell.dart`
- [x] **2.5** Workflows tests & verification
  - [x] Unit & widget tests in `test/features/workflows/workflows_page_test.dart`
  - [x] `flutter test test/features/workflows/` green

---

## Phase 3 — Storage Manager Screen (`/storage`)

- [x] **3.1** Desktop domain & data layer for Storage
  - [x] Create `lib/features/storage/domain/storage_models.dart` (`StorageItem`, `StorageQuota`)
  - [x] Create `lib/features/storage/data/storage_client.dart` & `storage_providers.dart` (Drive & MEGA clients)
- [x] **3.2** Desktop presentation for Storage
  - [x] Create `lib/features/storage/presentation/storage_page.dart`
  - [x] Quota progress bar, folder breadcrumbs navigation, file listing, refresh action
- [x] **3.3** Storage routing & navigation
  - [x] Add `/storage` in `app_router.dart` and `app_shell.dart`
- [x] **3.4** Storage tests & verification
  - [x] Widget & unit tests in `test/features/storage/storage_page_test.dart`
  - [x] `flutter test test/features/storage/` green

---

## Phase 4 — Insights & Analytics Screen (`/insights`)

- [x] **4.1** Desktop domain & data layer for Insights
  - [x] Create `lib/features/insights/domain/insights_models.dart`
  - [x] Create `lib/features/insights/data/insights_client.dart` & `insights_providers.dart`
- [x] **4.2** Desktop presentation for Insights
  - [x] Create `lib/features/insights/presentation/insights_page.dart`
  - [x] Platform tabs (Instagram/Facebook), date range picker (7/14/30/90 days), metric cards, trend visualizer
- [x] **4.3** Insights routing & navigation
  - [x] Add `/insights` in `app_router.dart` and `app_shell.dart`
- [x] **4.4** Insights tests & verification
  - [x] Widget & unit tests in `test/features/insights/insights_page_test.dart`
  - [x] `flutter test test/features/insights/` green

---

## Phase 5 — Full Gate & Regression Verification

- [x] `flutter analyze` 0 issues across all 230 files
- [x] `dart format --set-exit-if-changed lib test` clean
- [x] `flutter test` all test suites pass (1,092/1,092 passed)
- [x] `flutter test test/core/theme/screen_walk_test.dart` passes for all routes (52/52 passed)
- [x] `npx vitest run supabase/functions` all tests pass (60/60 passed)
- [x] `graphify update .` to update knowledge graph
