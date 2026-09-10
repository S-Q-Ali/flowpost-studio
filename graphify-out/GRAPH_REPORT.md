# Graph Report - flowpost-studio  (2026-09-10)

## Corpus Check
- 192 files · ~178,903 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1725 nodes · 2635 edges · 176 communities (107 shown, 46 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9564881d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- QueuePage.tsx
- App.tsx
- StoragePage
- WorkflowItemsPage.tsx
- Runtime Dependencies
- package.json
- use-toast.ts
- sidebar.tsx
- Dev Dependencies
- Admin Auth & Rate Limits
- cn
- captions.ts
- generate-ai-captions/index.ts
- TypeScript App Config
- UserMenu.tsx
- utils.ts
- Components Config
- CaptionPreviewModal.tsx
- Google Drive OAuth
- encrypt
- crypto.ts
- TypeScript Node Config
- process-workflow/index.ts
- TikTok OAuth
- Facebook OAuth
- Instagram OAuth
- Auth Context
- LinkedIn OAuth
- YouTube OAuth
- Supabase Types
- Drive-to-Mega OAuth
- tiktok-upload/index.ts
- YouTube Upload
- Admin Users
- Migration: Initial Schema
- Package Scripts
- Scheduling Utilities
- LinkedIn Upload
- Post Story Upload
- Sheet Status Function
- Root TypeScript Config
- ESLint Config
- Test Setup
- Google OAuth
- Session Verification
- Build Tools
- Worked example: Agent Teams for competing-hypothesis debugging
- Scheduled Posts Cron
- Migration: Workflows Sheets
- Quota Usage
- Migration: Carousel Support
- Graphify OpenCode Plugin
- FB Insights Deno
- IG Insights Deno
- Migration: RLS & Sessions
- Migration: Workflow Items
- Tailwind Config
- Migration: Sessions
- Migration: Workflow Locks
- Migration: Security Enhancements
- Migration: TikTok Support
- Migration: Page Eligibility
- Vercel Config
- Connected Accounts Table
- Users Table
- Workflow Locks Table
- Migration: Posts Account ID
- Migration: Altered Content
- Migration: Publishing Status
- Migration: Posts Security
- Migration: Workflows Security
- Migration: Cleanup Cron
- Migration: Media Type
- Migration: Workflow Columns
- Migration: Scheduling Modes
- Migration: TikTok Videos
- Migration: Drop Public View
- Migration: Post Type
- Migration: LinkedIn Support
- Migration: LinkedIn Workflows
- Migration: Workflow Item ID
- Migration: Caption Prompt
- public.posts
- workflows
- posts
- workflows
- posts
- workflows
- public.connected_accounts
- public.workflows
- Security and Hardening
- Code Review and Quality
- Test-Driven Development
- Performance Checklist
- Git Workflow and Versioning
- react
- Shipping and Launch
- What You Must Do When Invoked
- Performance Optimization
- Frontend UI Engineering
- Debugging and Error Recovery
- Documentation and ADRs
- WorkflowsPage.tsx
- FlowPost Studio
- Monetization Eligibility Feature — 4-Phase Plan (100% ✅)
- CalendarPage.tsx
- Security Checklist
- Accessibility Checklist
- PipelineLandingPage.tsx
- Web Performance Auditor
- Performance Audit (Phase 6)
- Using Agent Skills
- Problems & Solutions Log
- Testing Patterns Reference (JavaScript/TypeScript)
- Review Scope
- useAuth
- Google Sheets & FlowPost Workflows
- Review Framework
- SESSION_STATE.md
- Approach
- Security Audit — FlowPost Studio (2026-09-10)
- The Standing Checklist
- Observability Checklist
- Current Issues
- FlowPost Studio — User Guide
- Troubleshooting
- CaptionPromptEditor.tsx
- Logo.tsx
- graphify reference: extra exports and benchmark
- FlowPost Studio — Agent Operating Rules
- FlowPost Studio — Full Audit Report
- Unified Edge-Function Auth Helper — Implementation Plan (2026-09-10)
- Current State (2026-07-12)
- Step-by-Step Guide
- Test Coverage Analysis — FlowPost Studio (2026-09-10)
- Connected Accounts
- graphify reference: query, path, explain
- auth.test.ts
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- CURRENT HEAD: `(pending commit)` — Bulk AI caption generation + Stop button (serial queue)
- Managing Your Queue
- Storage Manager
- opencode.json
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- Dashboard
- extraction-spec.md
- google-drive.test.ts
- groq.ts
- SQA & Performance Audit Plan
- mega-auth/index.ts

## God Nodes (most connected - your core abstractions)
1. `cn()` - 125 edges
2. `react` - 48 edges
3. `Admin Users` - 44 edges
4. `useAuth()` - 36 edges
5. `lucide-react` - 30 edges
6. `StoragePage()` - 24 edges
7. `usePageLoading()` - 21 edges
8. `Monetization Eligibility Feature — 4-Phase Plan (100% ✅)` - 20 edges
9. `Button` - 19 edges
10. `decrypt()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `CaptionPromptEditorProps` --references--> `MasterPrompt`  [EXTRACTED]
  src/components/CaptionPromptEditor.tsx → src/lib/prompt-templates.ts
- `AlertDialogOverlay` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/alert-dialog.tsx → src/lib/utils.ts
- `DialogOverlay` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/dialog.tsx → src/lib/utils.ts
- `DropdownMenuSubTrigger` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/dropdown-menu.tsx → src/lib/utils.ts
- `DropdownMenuSubContent` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/dropdown-menu.tsx → src/lib/utils.ts

## Import Cycles
- None detected.

## Communities (176 total, 46 thin omitted)

### Community 0 - "QueuePage.tsx"
Cohesion: 0.18
Nodes (19): AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay, AlertDialogTitle (+11 more)

### Community 1 - "App.tsx"
Cohesion: 0.14
Nodes (12): AccountsPage, App(), AuthCallback, Dashboard, NotFound, ProfilePage, PUBLIC_PATHS, QueuePage (+4 more)

### Community 2 - "StoragePage"
Cohesion: 0.09
Nodes (32): megajs, callTransferTicket(), DriveFileInfo, fetchDriveStream(), getDriveFileInfo(), resolveMegaFolder(), transferDriveToMega(), TransferListener (+24 more)

### Community 3 - "WorkflowItemsPage.tsx"
Cohesion: 0.11
Nodes (20): recharts, InsightsPage, CaptionPreviewModal(), Skeleton(), useLocalStorage(), ConnectedAccount, DateRange, InsightsPage() (+12 more)

### Community 4 - "Runtime Dependencies"
Cohesion: 0.06
Nodes (31): dependencies, class-variance-authority, clsx, date-fns, lucide-react, megajs, next-themes, @radix-ui/react-alert-dialog (+23 more)

### Community 5 - "package.json"
Cohesion: 0.07
Nodes (28): name, private, type, version, autoprefixer, clsx, eslint, jsdom (+20 more)

### Community 6 - "use-toast.ts"
Cohesion: 0.12
Nodes (24): Toast, ToastAction, ToastActionElement, ToastClose, ToastDescription, ToastProps, ToastTitle, toastVariants (+16 more)

### Community 7 - "sidebar.tsx"
Cohesion: 0.07
Nodes (35): @radix-ui/react-slot, AppLayout(), AppSidebar(), navItems, NavLink, NavLinkCompatProps, Separator, Sidebar (+27 more)

### Community 8 - "Dev Dependencies"
Cohesion: 0.09
Nodes (22): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, jsdom (+14 more)

### Community 9 - "Admin Auth & Rate Limits"
Cohesion: 0.14
Nodes (16): checkRateLimit(), LOCKOUT_DURATION_MINUTES, MAX_ATTEMPTS, recordFailedAttempt(), resetRateLimit(), APP_PASSWORD, corsHeaders, supabase (+8 more)

### Community 10 - "cn"
Cohesion: 0.14
Nodes (21): @radix-ui/react-radio-group, @radix-ui/react-select, CardFooter, RadioGroup, RadioGroupItem, SelectContent, SelectItem, SelectLabel (+13 more)

### Community 11 - "captions.ts"
Cohesion: 0.18
Nodes (22): AICaptionResult, downloadVideo(), emit(), extractAudio(), extractFrames(), generateAICaptions(), GenerateCaptionsOptions, getFileToken() (+14 more)

### Community 12 - "generate-ai-captions/index.ts"
Cohesion: 0.13
Nodes (15): corsHeaders, driveTokenCtx, FRONTEND_API_KEY, generateCaptions(), GROQ_API_KEY, json(), PLATFORM_ALLOWED_KEYS, supabase (+7 more)

### Community 13 - "TypeScript App Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+11 more)

### Community 14 - "UserMenu.tsx"
Cohesion: 0.16
Nodes (15): @radix-ui/react-avatar, @radix-ui/react-dropdown-menu, Avatar, AvatarFallback, AvatarImage, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem (+7 more)

### Community 16 - "Components Config"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, rsc, $schema (+8 more)

### Community 17 - "CaptionPreviewModal.tsx"
Cohesion: 0.22
Nodes (11): @radix-ui/react-dialog, CAPTION_LABELS, CaptionPreviewModalProps, STEP_LABELS, StepId, DialogContent, DialogDescription, DialogFooter() (+3 more)

### Community 18 - "Google Drive OAuth"
Cohesion: 0.14
Nodes (15): corsHeaders, exchangeCodeForTokens(), fetchDriveUserInfo(), GD_CLIENT_ID, GD_CLIENT_SECRET, json(), R2_ACCESS_KEY, R2_BUCKET (+7 more)

### Community 19 - "encrypt"
Cohesion: 0.25
Nodes (7): corsHeaders, resolveMediaUrl(), supabase, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, encrypt()

### Community 20 - "crypto.ts"
Cohesion: 0.12
Nodes (14): corsHeaders, fetchMeta(), fetchSingleMetric(), corsHeaders, corsHeaders, supabase, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL (+6 more)

### Community 21 - "TypeScript Node Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+7 more)

### Community 22 - "process-workflow/index.ts"
Cohesion: 0.12
Nodes (11): corsHeaders, CRON_API_KEY, driveTokenCtx, R2_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT, R2_SECRET_KEY, SheetValuesResponse (+3 more)

### Community 23 - "TikTok OAuth"
Cohesion: 0.16
Nodes (12): corsHeaders, encodeStateParam(), exchangeCodeForToken(), generateState(), json(), refreshAccessToken(), SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (+4 more)

### Community 24 - "Facebook OAuth"
Cohesion: 0.19
Nodes (11): corsHeaders, exchangeCodeForUserToken(), FB_APP_ID, FB_APP_SECRET, fetchFacebookPages(), getLongLivedUserToken(), json(), SUPABASE_ANON_KEY (+3 more)

### Community 25 - "Instagram OAuth"
Cohesion: 0.19
Nodes (11): APP_ID, APP_SECRET, corsHeaders, exchangeCodeForShortLivedToken(), fetchIgProfile(), getLongLivedToken(), json(), SUPABASE_ANON_KEY (+3 more)

### Community 26 - "Auth Context"
Cohesion: 0.29
Nodes (11): AuthContext, AuthContextValue, AuthProvider(), clearCache(), clearVerifyCache(), getCache(), getStoredToken(), getVerifyCache() (+3 more)

### Community 27 - "LinkedIn OAuth"
Cohesion: 0.20
Nodes (10): corsHeaders, exchangeCodeForToken(), fetchLinkedInProfile(), json(), LI_CLIENT_ID, LI_CLIENT_SECRET, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (+2 more)

### Community 28 - "YouTube OAuth"
Cohesion: 0.21
Nodes (10): corsHeaders, exchangeCodeForTokens(), fetchChannelInfo(), json(), refreshAccessToken(), SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, supabaseAdmin (+2 more)

### Community 29 - "Supabase Types"
Cohesion: 0.18
Nodes (10): CompositeTypes, Constants, Database, DatabaseWithoutInternals, DefaultSchema, Enums, Json, Tables (+2 more)

### Community 30 - "Drive-to-Mega OAuth"
Cohesion: 0.22
Nodes (8): corsHeaders, GD_CLIENT_ID, GD_CLIENT_SECRET, start(), SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, supabaseAdmin, uploadWithMega()

### Community 31 - "tiktok-upload/index.ts"
Cohesion: 0.12
Nodes (12): corsHeaders, supabase, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, updateSheetStatus(), ALLOWED_DOMAINS, corsHeaders (+4 more)

### Community 32 - "YouTube Upload"
Cohesion: 0.22
Nodes (7): ALLOWED_DOMAINS, corsHeaders, json(), refreshYouTubeToken(), supabase, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

### Community 33 - "Admin Users"
Cohesion: 0.05
Nodes (44): 14. Facebook Page Insights — Added (2026-07-06), 15. Google Drive OAuth — Added; Cloudflare R2 — Removed (2026-07-07), 16. Multi-Drive Per Workflow — Added (2026-07-07), 17. Mega as Alternate File Source — Implemented (2026-07-07), 18. Mega Account Integration — Refined Plan (2026-07-07), 19. Mega Account Integration — Implemented (2026-07-07), 20. Mega Connection 400 Bug — Fixed (2026-07-07), 21. storage.api.logout is not a function — Fixed (2026-07-07) (+36 more)

### Community 34 - "Migration: Initial Schema"
Cohesion: 0.33
Nodes (7): public.connected_accounts, public.posts, public.videos, public.workflows, auth.users, public.update_updated_at_column, update_workflows_updated_at

### Community 35 - "Package Scripts"
Cohesion: 0.25
Nodes (8): scripts, build, build:dev, dev, lint, preview, test, test:watch

### Community 36 - "Scheduling Utilities"
Cohesion: 0.46
Nodes (7): computeTargetsForDay(), formatTime(), getDayLabel(), getItemPublishTime(), getNextPublishTime(), simpleHash(), Workflow

### Community 37 - "LinkedIn Upload"
Cohesion: 0.29
Nodes (5): corsHeaders, supabase, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

### Community 38 - "Post Story Upload"
Cohesion: 0.29
Nodes (5): corsHeaders, PostStoryPayload, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, SupportedPlatform

### Community 39 - "Sheet Status Function"
Cohesion: 0.29
Nodes (4): corsHeaders, supabase, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

### Community 40 - "Root TypeScript Config"
Cohesion: 0.29
Nodes (6): compilerOptions, allowJs, paths, skipLibCheck, files, references

### Community 41 - "ESLint Config"
Cohesion: 0.33
Nodes (5): @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, typescript-eslint

### Community 43 - "Google OAuth"
Cohesion: 0.33
Nodes (4): corsHeaders, supabase, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

### Community 44 - "Session Verification"
Cohesion: 0.33
Nodes (4): corsHeaders, supabase, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

### Community 45 - "Build Tools"
Cohesion: 0.40
Nodes (3): lovable-tagger, vite, @vitejs/plugin-react-swc

### Community 46 - "Worked example: Agent Teams for competing-hypothesis debugging"
Cohesion: 0.06
Nodes (31): 1. Direct invocation (no orchestration), 2. Single-persona slash command, 3. Parallel fan-out with merge, 4. Sequential pipeline as user-driven slash commands, 5. Research isolation (context preservation), A. Router persona ("meta-orchestrator"), Anti-pattern in this scenario, Anti-patterns (+23 more)

### Community 47 - "Scheduled Posts Cron"
Cohesion: 0.40
Nodes (4): corsHeaders, supabase, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

### Community 48 - "Migration: Workflows Sheets"
Cohesion: 0.40
Nodes (4): public.workflows, auth.users, public.update_updated_at_column, update_workflows_updated_at

### Community 50 - "Migration: Carousel Support"
Cohesion: 0.50
Nodes (3): public.carousel_items, public.posts, public.videos

### Community 113 - "Security and Hardening"
Cohesion: 0.06
Nodes (31): Always Do (No Exceptions), Ask First (Requires Human Approval), Broken Access Control, Broken Authentication, Common Rationalizations, Cross-Site Scripting (XSS), Data Privacy & Compliance, Destructive Operations on Derived Paths (+23 more)

### Community 114 - "Code Review and Quality"
Cohesion: 0.07
Nodes (29): 1. Correctness, 2. Readability & Simplicity, 3. Architecture, 4. Security, 5. Performance, Change Descriptions, Change Sizing, Code Review and Quality (+21 more)

### Community 115 - "Test-Driven Development"
Cohesion: 0.07
Nodes (29): Browser Testing with DevTools, Common Rationalizations, DAMP Over DRY in Tests, Decision Guide, Discover the Stack First, Name Tests Descriptively, One Assertion Per Concept, Overview (+21 more)

### Community 116 - "Performance Checklist"
Cohesion: 0.07
Nodes (26): API, Backend Checklist, Cache checklist, Caching Strategies, Common Anti-Patterns, Connection pooling, Core Web Vitals Targets, CSS (+18 more)

### Community 117 - "Git Workflow and Versioning"
Cohesion: 0.07
Nodes (26): 1. Commit Early, Commit Often, 2. Atomic Commits, 3. Descriptive Messages, 4. Keep Concerns Separate, 5. Size Your Changes, Branch Naming, Branching Strategy, Change Summaries (+18 more)

### Community 118 - "react"
Cohesion: 0.23
Nodes (14): class-variance-authority, react, react-router-dom, extractError(), SecurityQuestionsGate(), setStoredToken(), Card, CardContent (+6 more)

### Community 119 - "Shipping and Launch"
Cohesion: 0.08
Nodes (25): Accessibility, Code Quality, Common Rationalizations, Documentation, Error Budget Release Gate, Error Reporting, Feature Flag Strategy, Infrastructure (+17 more)

### Community 120 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 121 - "Performance Optimization"
Cohesion: 0.08
Nodes (24): Common Rationalizations, Connection Pool Exhaustion, Core Web Vitals Targets, Large Bundle Size, Log every attempt, including the reverted ones, Missing Caching (Backend), Missing Image Optimization (Frontend), N+1 Queries (Backend) (+16 more)

### Community 122 - "Frontend UI Engineering"
Cohesion: 0.08
Nodes (23): Accessibility (WCAG 2.1 AA), ARIA Labels, Avoid the AI Aesthetic, Color, Common Rationalizations, Component Architecture, Component Patterns, Design System Adherence (+15 more)

### Community 123 - "Debugging and Error Recovery"
Cohesion: 0.09
Nodes (21): Build Failure Triage, Common Rationalizations, Debugging and Error Recovery, Error-Specific Patterns, Instrumentation Guidelines, Overview, Red Flags, Runtime Error Triage (+13 more)

### Community 124 - "Documentation and ADRs"
Cohesion: 0.09
Nodes (21): ADR Lifecycle, ADR Template, API Documentation, Architecture Decision Records (ADRs), Changelog Maintenance, Common Rationalizations, Document Known Gotchas, Documentation and ADRs (+13 more)

### Community 125 - "WorkflowsPage.tsx"
Cohesion: 0.15
Nodes (17): BetaBadge(), Badge(), BadgeProps, badgeVariants, Checkbox, PopoverContent, Switch, supabase (+9 more)

### Community 126 - "FlowPost Studio"
Cohesion: 0.10
Nodes (20): API References, Architecture Overview, Available Scripts, Database (Supabase), Deploy Database Migrations, Deploy Edge Functions, Deployment, Edge Functions (Supabase) (+12 more)

### Community 127 - "Monetization Eligibility Feature — 4-Phase Plan (100% ✅)"
Cohesion: 0.10
Nodes (20): 55. Per-Item Publish Times for Custom Ranges (2026-07-22), 56. Sort Preference Persisted in localStorage (2026-07-22), 57. Infinite Loading Fix — WorkflowItemsPage (2026-07-22), 58. Skeleton Loading — InsightsPage (2026-07-22), 59. Skeleton Loading — ProfilePage (2026-07-22), 60. FlowPost Bridge Extension — Monetization Eligibility Checker (2026-07-23), 61. Extension Improvements — Token Fallback, Fetch Pages Bridge, DOM Extraction (2026-07-23), 62. Phase 1 Persistence — Eligibility Results Saved to Supabase (2026-07-23) (+12 more)

### Community 128 - "CalendarPage.tsx"
Cohesion: 0.17
Nodes (15): lucide-react, sonner, CalendarPage, config, PlatformIcon(), StatusBadge(), statusConfig, CarouselItem (+7 more)

### Community 129 - "Security Checklist"
Cohesion: 0.11
Nodes (17): AI / LLM Security, Authentication, Authorization, CORS Configuration, Data Protection, Dependency Security, Destructive Path Operations, Error Handling (+9 more)

### Community 130 - "Accessibility Checklist"
Cohesion: 0.12
Nodes (16): Accessibility Checklist, Accessible Lists, ARIA Roles, Buttons vs. Links, Common Anti-Patterns, Common HTML Patterns, Content, Essential Checks (+8 more)

### Community 131 - "PipelineLandingPage.tsx"
Cohesion: 0.10
Nodes (6): next-themes, PipelineLandingPage, Toaster(), ToasterProps, PipelineLandingPage(), useScrollReveal()

### Community 132 - "Web Performance Auditor"
Cohesion: 0.12
Nodes (15): 1. Core Web Vitals, 2. Loading, 3. Rendering / JavaScript, 4. Network, Composition, Deep mode (activated when tool artifacts or live measurement are available), Metric-Honesty Rule, Operating Modes (+7 more)

### Community 133 - "Performance Audit (Phase 6)"
Cohesion: 0.22
Nodes (9): Bundle Size, Database — Missing Indexes (P0), Database — Over-fetching, Edge Function Architecture (post-MVP), N+1 Query Patterns, Performance Audit (Phase 6), Performance Test Script, Realtime Subscriptions (+1 more)

### Community 134 - "Using Agent Skills"
Cohesion: 0.13
Nodes (14): 1. Surface Assumptions, 2. Manage Confusion Actively, 3. Push Back When Warranted, 4. Enforce Simplicity, 5. Maintain Scope Discipline, 6. Verify, Don't Assume, Core Operating Behaviors, Failure Modes to Avoid (+6 more)

### Community 135 - "Problems & Solutions Log"
Cohesion: 0.13
Nodes (15): 10. DB Cleanup Issues, 11. Secret Management, 12. "Post between (UTC time)" Feature — Removed (2026-07-06), 13. Instagram Insights Not Loading — Full Resolution (2026-07-06), 14. `POST /auth/v1/token?grant_type=refresh_token` Returns 429 — Fixed (2026-07-18), 1. Cron Functions Returning 401 (reserved secrets override), 2. Staggered Posts Never Posted (missing Google token), 3. Instagram Uploads Stuck in "processing" Forever (timeout) (+7 more)

### Community 136 - "Testing Patterns Reference (JavaScript/TypeScript)"
Cohesion: 0.14
Nodes (13): API / Integration Testing, Common Assertions, E2E Testing (Playwright), Mock at Boundaries Only, Mock Functions, Mock Modules, Mocking Patterns, React/Component Testing (+5 more)

### Community 137 - "Review Scope"
Cohesion: 0.15
Nodes (12): 1. Input Handling, 2. Authentication & Authorization, 3. Data Protection, 4. Infrastructure, 5. Third-Party Integrations, 6. AI / LLM Features (if present), Composition, Output Format (+4 more)

### Community 138 - "useAuth"
Cohesion: 0.11
Nodes (24): date-fns, AppRoutes(), RequireVerified(), ToolsPage, CardTitle, useAuth(), usePageLoading(), AccountsPage() (+16 more)

### Community 139 - "Google Sheets & FlowPost Workflows"
Cohesion: 0.15
Nodes (13): AI Captions for Workflows, Best Practices, FlowPost Workflows, Google Sheet Workflows, Google Sheets & FlowPost Workflows, Image Workflows, Media Sources, Processing Behavior (+5 more)

### Community 140 - "Review Framework"
Cohesion: 0.17
Nodes (11): 1. Correctness, 2. Readability, 3. Architecture, 4. Security, 5. Performance, Composition, Output Format, Review Framework (+3 more)

### Community 141 - "SESSION_STATE.md"
Cohesion: 0.17
Nodes (11): Current Issues, Current Status, DB Schema Notes, Entry #60 — UploadPage: Google Drive file browser + import to R2, Entry #61 — Fix: `created_at` → `uploaded_at` on videos table, Entry #62 — UploadPage: Local machine upload tab, Entry #63 — UploadPage: Post as Story toggle, Entry #64 — Auth redirect fix: save & restore URL + /security-questions route (+3 more)

### Community 142 - "Approach"
Cohesion: 0.18
Nodes (10): 1. Analyze Before Writing, 2. Test at the Right Level, 3. Follow the Prove-It Pattern for Bugs, 4. Write Descriptive Tests, 5. Cover These Scenarios, Approach, Composition, Output Format (+2 more)

### Community 143 - "Security Audit — FlowPost Studio (2026-09-10)"
Cohesion: 0.18
Nodes (10): CRITICAL, Findings, HIGH, LOW, MEDIUM, Positive observations, Prior-finding status, Prioritized fix order (+2 more)

### Community 144 - "The Standing Checklist"
Cohesion: 0.18
Nodes (10): Correctness, Definition of Done, Definition of Done vs. Acceptance Criteria, Documentation, How to Apply, Integration, Quality, Red Flags (+2 more)

### Community 145 - "Observability Checklist"
Cohesion: 0.18
Nodes (10): Alerting, Dashboards, Distributed Tracing, Metrics, Observability Checklist, On-Call Questions (Start Here), Pre-Launch Gate, Structured Logging (+2 more)

### Community 146 - "Current Issues"
Cohesion: 0.18
Nodes (11): 66. Phase 1 — Foundation for FlowPost In-App Workflow Items (2026-07-15), 67. Phase 2 — Workflow Creation UI with Drive Folder Browser (2026-07-15), 68. Drive Folder Pagination — All Pages Now Loaded (2026-07-15), 69. Phase 3 — Workflow Items Editor Page (2026-07-15), 70. CORS Fix — `list-files` Changed from GET to POST (2026-07-15), 71. Phase 4 — Per-Item Platform Overrides UI (2026-07-15), 72. LinkedIn Integration — Feasibility Analysis (2026-07-15), 73. Multi-Account OAuth Flow Improvements (2026-07-15) (+3 more)

### Community 147 - "FlowPost Studio — User Guide"
Cohesion: 0.18
Nodes (10): Authentication, Content Calendar, FlowPost Studio — User Guide, Getting Started, Navigation, Profile Information, Profile & Security, Security Questions (+2 more)

### Community 148 - "Troubleshooting"
Cohesion: 0.18
Nodes (11): AI Caption Generation Fails, CORS Errors in Browser Console, FlowPost Workflow Not Triggering, Getting Help, Google Drive / Mega Issues, Google Sheets Workflow Not Triggering, LinkedIn Post Fails, OAuth Errors (+3 more)

### Community 149 - "CaptionPromptEditor.tsx"
Cohesion: 0.20
Nodes (11): @radix-ui/react-tabs, CaptionPromptEditor(), CaptionPromptEditorProps, normalizeField(), templateOptions, TabsContent, TabsList, TabsTrigger (+3 more)

### Community 150 - "Logo.tsx"
Cohesion: 0.24
Nodes (5): PrivacyPage, TermsPage, Logo(), LogoProps, sizeMap

### Community 151 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 152 - "FlowPost Studio — Agent Operating Rules"
Cohesion: 0.25
Nodes (7): Core Rules, Environment Notes, Execution Model, FlowPost Studio — Agent Operating Rules, graphify, Intent → Skill Mapping, Project Overview

### Community 153 - "FlowPost Studio — Full Audit Report"
Cohesion: 0.25
Nodes (7): 1. Security (severity: CRITICAL first), 2. Code Quality, 3. Performance, 4. UI + Whop/Earn-readiness, FlowPost Studio — Full Audit Report, Open Items, Recommended Fix Order

### Community 154 - "Unified Edge-Function Auth Helper — Implementation Plan (2026-09-10)"
Cohesion: 0.22
Nodes (8): Design (from test-engineer, Critical #1), Execution order (THIS session), Findings consolidated (priority order for THIS refactor), Goal, Out of scope (deferred), Unified Edge-Function Auth Helper — Implementation Plan (2026-09-10), Verification, Verified

### Community 155 - "Current State (2026-07-12)"
Cohesion: 0.25
Nodes (8): 52. get-file Egress Spike — R2 Cache Layer Plan (2026-07-12), 53. get-file Egress Spike — R2 Cache in process-workflow (2026-07-12), Blocked, Current State (2026-07-12), Known Issues, Not Yet Implemented, Recently Fixed, What Works

### Community 156 - "Step-by-Step Guide"
Cohesion: 0.25
Nodes (8): 1. Upload a Video, 2. Select Platforms, 3. Customize Content Per Platform, 4. Content Settings, 5. Publish or Schedule, 6. Monitor Progress, Step-by-Step Guide, Uploading & Distributing Videos

### Community 157 - "Test Coverage Analysis — FlowPost Studio (2026-09-10)"
Cohesion: 0.29
Nodes (6): Commands, Current Coverage, Discrepancy corrections (vs earlier brief), Key structural recommendation (critical), Priority, Test Coverage Analysis — FlowPost Studio (2026-09-10)

### Community 158 - "Connected Accounts"
Cohesion: 0.29
Nodes (7): Connected Accounts, Connecting an Account, LinkedIn Notes, Managing Connections, Supported Platforms, TikTok Notes, Token Expiry

### Community 159 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 160 - "auth.test.ts"
Cohesion: 0.31
Nodes (8): AuthInputs, AuthResult, bearerOf(), createSessionLookup(), isRequestAuthorized(), SessionLookupResult, lookupResult(), stubSupabase()

### Community 161 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 162 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 163 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 164 - "CURRENT HEAD: `(pending commit)` — Bulk AI caption generation + Stop button (serial queue)"
Cohesion: 0.50
Nodes (4): CURRENT HEAD: `(pending commit)` — Bulk AI caption generation + Stop button (serial queue), Feature: Bulk synchronous AI caption generation with Stop (work in progress, not yet committed), Fix: instagram-upload polling restored to 10×12s=120s (2026-07-28), UI: YouTube Altered Content moved to Platforms stage, conditional toggles (2026-07-28)

### Community 165 - "Managing Your Queue"
Cohesion: 0.50
Nodes (4): Actions, Filters, Managing Your Queue, Post Statuses

### Community 166 - "Storage Manager"
Cohesion: 0.50
Nodes (4): Google Drive, Mega, Storage Manager, Transfer Files

### Community 170 - "Dashboard"
Cohesion: 0.67
Nodes (3): Dashboard, Recent Activity, Stats Cards

### Community 172 - "google-drive.test.ts"
Cohesion: 0.36
Nodes (7): buildRefreshUrl(), DriveTokenContext, getDriveToken(), shouldRefreshToken(), fakeSupabase(), makeCtx(), NOW

### Community 173 - "groq.ts"
Cohesion: 0.36
Nodes (6): vitest, ALLOWED_CHAT_MODELS, DEFAULT_CHAT_TOKENS, MAX_CHAT_TOKENS, sanitizeChatOptions(), SanitizedChatOptions

### Community 174 - "SQA & Performance Audit Plan"
Cohesion: 0.29
Nodes (7): Phase 1 — Unit Tests, Phase 2 — Edge Function Integration Tests, Phase 3 — React Component Tests, Phase 4 — Manual E2E Test Cases, Phase 5 — Post-Deploy Smoke Tests, SQA & Performance Audit Plan, Test Infrastructure

### Community 175 - "mega-auth/index.ts"
Cohesion: 0.33
Nodes (4): corsHeaders, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, supabaseAdmin

## Knowledge Gaps
- **971 isolated node(s):** `$schema`, `plugin`, `$schema`, `style`, `rsc` (+966 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1143 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **46 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `groq.ts` to `auth.test.ts`, `google-drive.test.ts`, `package.json`, `utils.ts`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `QueuePage.tsx`, `App.tsx`, `CalendarPage.tsx`, `WorkflowItemsPage.tsx`, `PipelineLandingPage.tsx`, `package.json`, `use-toast.ts`, `sidebar.tsx`, `cn`, `useAuth`, `UserMenu.tsx`, `utils.ts`, `CaptionPreviewModal.tsx`, `CaptionPromptEditor.tsx`, `Auth Context`, `WorkflowsPage.tsx`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `decrypt()` connect `crypto.ts` to `YouTube Upload`, `LinkedIn Upload`, `Post Story Upload`, `generate-ai-captions/index.ts`, `mega-auth/index.ts`, `Google Drive OAuth`, `encrypt`, `process-workflow/index.ts`, `TikTok OAuth`, `YouTube OAuth`, `Drive-to-Mega OAuth`, `tiktok-upload/index.ts`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **What connects `$schema`, `plugin`, `$schema` to the rest of the system?**
  _971 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.14166666666666666 - nodes in this community are weakly interconnected._
- **Should `StoragePage` be split into smaller, more focused modules?**
  _Cohesion score 0.09411764705882353 - nodes in this community are weakly interconnected._
- **Should `WorkflowItemsPage.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._