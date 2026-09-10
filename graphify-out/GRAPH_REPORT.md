# Graph Report - flowpost-studio  (2026-09-10)

## Corpus Check
- 147 files · ~0 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 946 nodes · 1870 edges · 113 communities (49 shown, 41 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Core UI Components & Types
- App Shell & Landing Pages
- Drive-to-Mega Transfer
- AI Captions & Insights
- Runtime Dependencies
- Project Metadata
- Toast System
- Sidebar & Navigation
- Dev Dependencies
- Admin Auth & Rate Limits
- UI Primitives
- Caption Generation Pipeline
- Captions Edge Function
- TypeScript App Config
- User Menu & Dropdowns
- App Sidebar & Logos
- Components Config
- Caption Preview Modal
- Google Drive OAuth
- Platform Upload Hub
- Crypto & Media Resolver
- TypeScript Node Config
- Workflow Processing
- TikTok OAuth
- Facebook OAuth
- Instagram OAuth
- Auth Context
- LinkedIn OAuth
- YouTube OAuth
- Supabase Types
- Drive-to-Mega OAuth
- TikTok Upload
- YouTube Upload
- Insights & Crypto Helpers
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
- Get File Function
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
- Community 99
- Community 101
- Community 103
- Community 104
- Community 106
- Community 108
- Community 111
- Community 112

## God Nodes (most connected - your core abstractions)
1. `cn()` - 125 edges
2. `react` - 48 edges
3. `useAuth()` - 36 edges
4. `lucide-react` - 30 edges
5. `StoragePage()` - 24 edges
6. `usePageLoading()` - 21 edges
7. `decrypt()` - 21 edges
8. `Button` - 19 edges
9. `encrypt()` - 18 edges
10. `react-router-dom` - 18 edges

## Surprising Connections (you probably didn't know these)
- `AppRoutes()` --calls--> `useAuth()`  [EXTRACTED]
  src/App.tsx → src/contexts/AuthContext.tsx
- `AlertDialogOverlay` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/alert-dialog.tsx → src/lib/utils.ts
- `DialogOverlay` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/dialog.tsx → src/lib/utils.ts
- `DropdownMenuCheckboxItem` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/dropdown-menu.tsx → src/lib/utils.ts
- `DropdownMenuRadioItem` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/dropdown-menu.tsx → src/lib/utils.ts

## Import Cycles
- None detected.

## Communities (113 total, 41 thin omitted)

### Community 0 - "Core UI Components & Types"
Cohesion: 0.06
Nodes (96): class-variance-authority, date-fns, lucide-react, @radix-ui/react-alert-dialog, react, react-router-dom, sonner, RequireVerified() (+88 more)

### Community 1 - "App Shell & Landing Pages"
Cohesion: 0.05
Nodes (25): next-themes, AccountsPage, App(), AppRoutes(), AuthCallback, CalendarPage, Dashboard, NotFound (+17 more)

### Community 2 - "Drive-to-Mega Transfer"
Cohesion: 0.09
Nodes (32): megajs, callTransferTicket(), DriveFileInfo, fetchDriveStream(), getDriveFileInfo(), resolveMegaFolder(), transferDriveToMega(), TransferListener (+24 more)

### Community 3 - "AI Captions & Insights"
Cohesion: 0.08
Nodes (28): @radix-ui/react-select, @radix-ui/react-tabs, recharts, InsightsPage, CaptionPromptEditor(), CaptionPromptEditorProps, normalizeField(), templateOptions (+20 more)

### Community 4 - "Runtime Dependencies"
Cohesion: 0.06
Nodes (31): dependencies, class-variance-authority, clsx, date-fns, lucide-react, megajs, next-themes, @radix-ui/react-alert-dialog (+23 more)

### Community 5 - "Project Metadata"
Cohesion: 0.07
Nodes (29): name, private, type, version, autoprefixer, clsx, eslint, jsdom (+21 more)

### Community 6 - "Toast System"
Cohesion: 0.12
Nodes (25): @radix-ui/react-toast, Toast, ToastAction, ToastActionElement, ToastClose, ToastDescription, ToastProps, ToastTitle (+17 more)

### Community 7 - "Sidebar & Navigation"
Cohesion: 0.11
Nodes (23): AppSidebar(), Sidebar, SidebarContext, SidebarGroupAction, SidebarGroupLabel, SidebarHeader, SidebarInput, SidebarInset (+15 more)

### Community 8 - "Dev Dependencies"
Cohesion: 0.09
Nodes (22): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, jsdom (+14 more)

### Community 9 - "Admin Auth & Rate Limits"
Cohesion: 0.14
Nodes (16): checkRateLimit(), LOCKOUT_DURATION_MINUTES, MAX_ATTEMPTS, recordFailedAttempt(), resetRateLimit(), APP_PASSWORD, corsHeaders, supabase (+8 more)

### Community 10 - "UI Primitives"
Cohesion: 0.18
Nodes (14): CardFooter, PopoverContent, RadioGroup, RadioGroupItem, Separator, SheetContent, SheetContentProps, SheetDescription (+6 more)

### Community 11 - "Caption Generation Pipeline"
Cohesion: 0.23
Nodes (19): AICaptionResult, downloadVideo(), emit(), extractAudio(), extractFrames(), generateAICaptions(), getFileToken(), groqApiCall() (+11 more)

### Community 12 - "Captions Edge Function"
Cohesion: 0.12
Nodes (16): corsHeaders, FRONTEND_API_KEY, generateCaptions(), getDriveAccount(), getDriveToken(), GROQ_API_KEY, json(), PLATFORM_ALLOWED_KEYS (+8 more)

### Community 13 - "TypeScript App Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+11 more)

### Community 14 - "User Menu & Dropdowns"
Cohesion: 0.16
Nodes (15): @radix-ui/react-avatar, @radix-ui/react-dropdown-menu, Avatar, AvatarFallback, AvatarImage, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem (+7 more)

### Community 15 - "App Sidebar & Logos"
Cohesion: 0.13
Nodes (13): navItems, Logo(), LogoProps, sizeMap, NavLink, NavLinkCompatProps, SidebarContent, SidebarFooter (+5 more)

### Community 16 - "Components Config"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, rsc, $schema (+8 more)

### Community 17 - "Caption Preview Modal"
Cohesion: 0.16
Nodes (14): @radix-ui/react-dialog, CAPTION_LABELS, CaptionPreviewModal(), CaptionPreviewModalProps, STEP_LABELS, StepId, DialogContent, DialogDescription (+6 more)

### Community 18 - "Google Drive OAuth"
Cohesion: 0.14
Nodes (15): corsHeaders, exchangeCodeForTokens(), fetchDriveUserInfo(), GD_CLIENT_ID, GD_CLIENT_SECRET, json(), R2_ACCESS_KEY, R2_BUCKET (+7 more)

### Community 19 - "Platform Upload Hub"
Cohesion: 0.14
Nodes (11): corsHeaders, supabase, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, corsHeaders, supabase, SUPABASE_ANON_KEY (+3 more)

### Community 20 - "Crypto & Media Resolver"
Cohesion: 0.15
Nodes (11): resolveMediaUrl(), corsHeaders, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, supabaseAdmin, encrypt(), getKey(), corsHeaders (+3 more)

### Community 21 - "TypeScript Node Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+7 more)

### Community 22 - "Workflow Processing"
Cohesion: 0.13
Nodes (10): corsHeaders, CRON_API_KEY, R2_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT, R2_SECRET_KEY, SheetValuesResponse, supabase (+2 more)

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

### Community 31 - "TikTok Upload"
Cohesion: 0.20
Nodes (6): ALLOWED_DOMAINS, corsHeaders, supabase, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

### Community 32 - "YouTube Upload"
Cohesion: 0.22
Nodes (7): ALLOWED_DOMAINS, corsHeaders, json(), refreshYouTubeToken(), supabase, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

### Community 33 - "Insights & Crypto Helpers"
Cohesion: 0.25
Nodes (6): corsHeaders, fetchMeta(), fetchSingleMetric(), corsHeaders, getDriveToken(), decrypt()

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

### Community 46 - "Get File Function"
Cohesion: 0.40
Nodes (4): corsHeaders, supabase, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

### Community 47 - "Scheduled Posts Cron"
Cohesion: 0.40
Nodes (4): corsHeaders, supabase, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

### Community 48 - "Migration: Workflows Sheets"
Cohesion: 0.40
Nodes (4): public.workflows, auth.users, public.update_updated_at_column, update_workflows_updated_at

### Community 50 - "Migration: Carousel Support"
Cohesion: 0.50
Nodes (3): public.carousel_items, public.posts, public.videos

## Knowledge Gaps
- **360 isolated node(s):** `BadgeProps`, `ButtonProps`, `CalendarProps`, `CarouselItem`, `Video` (+355 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 494 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **41 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Core UI Components & Types` to `App Shell & Landing Pages`, `AI Captions & Insights`, `Project Metadata`, `Toast System`, `Sidebar & Navigation`, `UI Primitives`, `User Menu & Dropdowns`, `App Sidebar & Logos`, `Caption Preview Modal`, `Auth Context`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `cn()` connect `UI Primitives` to `Core UI Components & Types`, `AI Captions & Insights`, `Toast System`, `Sidebar & Navigation`, `User Menu & Dropdowns`, `App Sidebar & Logos`, `Caption Preview Modal`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Runtime Dependencies` to `Project Metadata`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **What connects `BadgeProps`, `ButtonProps`, `CalendarProps` to the rest of the system?**
  _360 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core UI Components & Types` be split into smaller, more focused modules?**
  _Cohesion score 0.05963029218843172 - nodes in this community are weakly interconnected._
- **Should `App Shell & Landing Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.04964539007092199 - nodes in this community are weakly interconnected._
- **Should `Drive-to-Mega Transfer` be split into smaller, more focused modules?**
  _Cohesion score 0.09411764705882353 - nodes in this community are weakly interconnected._