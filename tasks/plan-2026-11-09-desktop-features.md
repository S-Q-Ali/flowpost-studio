# Implementation Plan: Desktop App Missing Features Parity

**Plan Date:** 2026-11-09  
**Source:** User request to implement all web features missing in desktop (excluding 5: Tools and 6: Profile).  
**Skills used:** `planning-and-task-breakdown`, `test-driven-development`, `frontend-ui-engineering`, `ponytail`.

---

## 1. Overview

Bring full parity for the core operational features from the Web App into the Flutter Desktop App:
1. **Home Dashboard Stats & Recent Activity (`/`)**: 4 aggregate metric cards (Videos Uploaded, Scheduled, Published, Connected Accounts), quick action button ("Upload & Distribute"), and a Recent Activity feed of the 5 latest posts with platform icons, titles, and status badges.
2. **Workflows Screen (`/workflows`)**: Automation list with active toggles, platform destinations, schedule info, last run outcome badge, and manual "Run Now" trigger.
3. **Storage Manager Screen (`/storage`)**: Cloud file explorer for Google Drive and MEGA accounts, quota visualizer, folder navigation breadcrumbs, and file inventory.
4. **Insights & Analytics Screen (`/insights`)**: Multi-platform analytics for Instagram and Facebook with date ranges (7/14/30/90 days), follower/growth/post volume metrics, and performance visualizer.

All backend interactions use existing Supabase edge functions (`posts-api`, `process-workflow`, `google-drive-auth`, `mega-auth`, `fetch-instagram-insights`, `fetch-facebook-insights`) authorized via the desktop session token.

---

## 2. Architecture & Design Decisions

- **Single Gateway Extension for Dashboard & Workflows**: Rather than making separate unauthenticated database queries, extend `posts-api` (`supabase/functions/posts-api/index.ts`) with typed actions:
  - `dashboard-stats`: returns aggregate counts and the 5 most recent posts for the session owner.
  - `workflows-list`: returns the user's workflows with latest run outcomes.
  - `workflow-toggle`: toggles active state for a workflow.
- **Direct Edge Function Calls with Session Token**: For Storage and Insights, desktop uses typed HTTP clients passing `Authorization: Bearer <session_token>` to `google-drive-auth`, `mega-auth`, `fetch-instagram-insights`, and `fetch-facebook-insights`, matching the exact contract proved on web.
- **Navigation Shell Extension**: Update `AppShell` in `desktop-flutter/lib/core/shell/app_shell.dart` to add destinations:
  - `Home` (`/`)
  - `Accounts` (`/accounts`)
  - `Upload` (`/upload`)
  - `Workflows` (`/workflows`)
  - `Queue` (`/queue`)
  - `Calendar` (`/calendar`)
  - `Storage` (`/storage`)
  - `Insights` (`/insights`)
  - `Settings` (`/settings`)
- **Ponytail Rules**: Colocate models, data clients, providers, and presentation. Zero new external dependencies. Standard Flutter widgets, clean accessibility semantics, and error/empty/loading states.

---

## 3. Vertical Implementation Phases

### Phase 1: Dashboard Stats & Recent Activity on Desktop Home (`/`)
- Backend: Add `dashboard-stats` action in `_shared/posts-api.ts` & `posts-api/index.ts` + Vitest tests.
- Desktop Domain & Data: `features/home/data/dashboard_repository.dart` + models.
- Desktop Presentation: Update `home_page.dart` with stats cards, recent posts, and update banner.
- Testing: Unit and widget tests in `test/features/home/home_page_test.dart`.

### Phase 2: Workflows Screen in Desktop App (`/workflows`)
- Backend: Add `workflows-list` and `workflow-toggle` in `posts-api`.
- Desktop Domain & Data: `features/workflows/domain/workflow.dart`, `workflows_repository.dart`, and `workflows_providers.dart`.
- Desktop Presentation: `features/workflows/presentation/workflows_page.dart`.
- Trigger: Support "Run Now" button invoking `process-workflow`.
- Navigation: Add `/workflows` route in `app_router.dart` and `app_shell.dart`.
- Testing: Unit, repository, and widget tests in `test/features/workflows/`.

### Phase 3: Storage Manager Screen (`/storage`)
- Desktop Domain & Data: `features/storage/domain/storage_item.dart`, `storage_client.dart`, `storage_providers.dart`.
- Desktop Presentation: `features/storage/presentation/storage_page.dart` with Drive & MEGA accounts, quota progress bar, breadcrumb folder traversal, and file list.
- Navigation: Add `/storage` route in `app_router.dart` and `app_shell.dart`.
- Testing: Unit and widget tests in `test/features/storage/`.

### Phase 4: Insights & Analytics Screen (`/insights`)
- Desktop Domain & Data: `features/insights/domain/insights_models.dart`, `insights_client.dart`, `insights_providers.dart`.
- Desktop Presentation: `features/insights/presentation/insights_page.dart` with platform selector, date range selector, metrics cards, and visual bar/timeline chart.
- Navigation: Add `/insights` route in `app_router.dart` and `app_shell.dart`.
- Testing: Unit and widget tests in `test/features/insights/`.

### Phase 5: Verification Gate & Knowledge Graph Refresh
- `flutter analyze`: 0 issues.
- `dart format --set-exit-if-changed lib test`: clean.
- `flutter test`: all unit/widget tests passing (1,074+ baseline + new suites).
- `flutter test test/core/theme/screen_walk_test.dart`: all routes verified.
- `npx vitest run supabase/functions`: all backend tests passing.
- `graphify update .`: knowledge graph updated.
