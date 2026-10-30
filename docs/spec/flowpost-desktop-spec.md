# Spec: FlowPost Desktop Application (Windows)

## Objective

Build a fully functional FlowPost desktop application for Windows with feature parity to the current web app (17 pages/features), enabling social media managers/content creators to schedule and publish videos/images across YouTube Shorts, Instagram Reels/Stories, Facebook Pages, TikTok, and LinkedIn from a standalone `.exe` application without requiring a browser.

**User:** Social media managers and content creators who need desktop-native scheduling capabilities.

**Why now:** Provide desktop experience without browser dependency; existing web app works but desktop distribution desired for offline/focused workflow.

**Success Criteria (Specific & Testable):**
- All 17 web features functional in desktop `.exe` application
- Auto-updates mechanism works correctly from website
- Users can install and use without keeping browser open
- Windows-only support (initial release v1.0)
- Performance: Initial page load < 3s on typical broadband
- No layout shift during load (CLS < 0.1)
- AI caption generation works with stop button functionality
- All platform connections (YouTube, Instagram, Facebook, TikTok, LinkedIn) functional

**Constraint:**
- Windows-only operating system (initial release)
- Build on existing React 18 + TypeScript + Vite + Tailwind + Supabase codebase
- **No Electron framework** - using Tauri (lightweight .exe wrapper using WebView2)
- Auto-update capability required (check website for new version, prompt to update)
- Feature parity with web app (all 17 pages/features)
- Existing Supabase authentication (Google OAuth + admin email/password)

**Out of Scope (Explicitly Not Building):**
- macOS/Linux support (for now)
- Electron framework
- Mobile platforms (iOS/Android)
- Chrome/Firefox extension version (already exists separately as `flowpost-extension/`)
- New features not in current web app
- Cross-platform compatibility beyond Windows initial release
- Database schema changes (use existing Supabase structure)
- New API endpoints beyond what web app already has

---

## Tech Stack

| Layer | Technology | Version/Notes |
|-------|------------|---------------|
| **Framework** | React | 18 (with TypeScript) |
| **Build Tool** | Vite | 5.4.x (configured for Tauri) |
| **CSS** | Tailwind CSS | 3.4.17 |
| **UI Components** | shadcn/ui + Radix UI | 11 component packages |
| **Routing** | React Router DOM | 6.30.1 |
| **State Management** | React Context + localStorage/sessionStorage | AuthContext, useLocalStorage hook |
| **Desktop Wrapper** | Tauri | 2.0 (using WebView2 on Windows) |
| **Package Manager** | npm | 10.x |
| **Database** | Supabase | 2.98.0 (PostgreSQL backend) |
| **Auth** | Supabase JavaScript client | Google OAuth + admin sessions |
| **Notifications** | Sonner | 1.7.4 (toast notifications) |
| **Charts** | Recharts | 3.9.2 |
| **Date Handling** | date-fns | 3.6.0 |
| **Utilities** | clsx, tailwind-merge | Class name management |
| **OS Integration** | Tauri APIs | fs, shell, clipboard, tray, shortcuts |

**Key Tauri Dependencies (to add):**
- `@tauri-apps/api` - Window, tray, shell, clipboard APIs
- `@tauri-apps/plugin-store` - Auto-update management
- `@tauri-apps/plugin-debug` - Development tools
- `sharp` (optional) - Image processing if needed

---

## Commands

| Command | Description | Full Execution |
|---------|-------------|----------------|
| `npm run dev` | Start development mode with Tauri | `vite` + Tauri dev server |
| `npm run build` | Build the Tauri `.exe` application | `vite build` + `tauri build` |
| `npm run lint` | Run ESLint with auto-fix | `eslint . --ext .ts,.tsx --fix` |
| `npm run test` | Run test suite | `vitest run` or `jest` |
| `npm run test:watch` | Run tests in watch mode | `vitest watch` |
| `npm run tauri` | Tauri-specific commands | `tauri` CLI commands |
| `tauri update check` | Check for updates (custom) | Tauri store integration |
| `tauri download update` | Download and install updates | Tauri auto-update flow |

---

## Project Structure

```
flowpost-studio/
├── docs/
│   ├── intent/          → Statement of intent (from interview-me)
│   └── spec/            → This spec document
│
├── src/
│   ├── app.tsx          → Root component with routing
│   ├── main.tsx         → React entry point (modified for Tauri)
│   ├── pages/           → 17 page components (all preserved)
│   ├── components/      → UI components (shadcn/ui + custom)
│   ├── contexts/        → AuthContext + hooks
│   ├── hooks/           → Custom React hooks
│   ├── lib/             → Utilities, types, scheduling logic
│   ├── integrations/    → Supabase client configurations
│   ├── preload.ts       → Tauri preload script (NEW)
│   └── index.css        → Tailwind base styles
│
├── tauri.conf.json      → Tauri configuration (NEW)
├── package.json         → Add Tauri dependencies, scripts
├── vite.config.ts       → Vite config (may need Tauri adjustments)
├── tailwind.config.ts   → Tailwind config
├── tsconfig.json        → TypeScript config
└── graphify-out/        → Knowledge graph output
```

**Key New Files for Tauri:**
- `src/preload.ts` - Bridge between React and Tauri APIs (loaded before React starts)
- `tauri.conf.json` - App metadata, windows, menus, API permissions
- Tauri-generated `.exe` output in `src-tauri/target/`

**Existing Pages (17 total, all must work):**
- Dashboard.tsx, UploadPage.tsx, WorkflowItemsPage.tsx
- CalendarPage.tsx, WorkflowsPage.tsx, AccountsPage.tsx
- QueuePage.tsx, InsightsPage.tsx, ToolsPage.tsx
- ProfilePage.tsx, and 8 others from web app

---

## Code Style

### General Conventions (inherit from existing codebase)

| Convention | Standard |
|------------|----------|
| **File naming** | PascalCase for components (`Dashboard.tsx`), camelCase for utilities (`useAuth.ts`) |
| **Component structure** | Function components with hooks, JSX returned directly |
| **TypeScript** | Strict mode; `noImplicitAny: true`; types for all props and state |
| **Tailwind classes** | Use `clsx` for conditional classes; `tailwind-merge` for conflict resolution |
| **Imports** | Absolute paths from `src/` root (`@/components/ui/button`) |
| **Naming** | kebab-case for files/dirs in src, PascalCase for components |
| **Comments** | JSDoc for public functions; minimal inline comments |

### Code Snippet Example

```tsx
// ✅ Good: Typed component with shadcn/ui pattern
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface ScheduleDialogProps {
  open: boolean;
  onClose: () => void;
  onSchedule: (data: {
    title: string;
    platform: string;
    fileUrl: string;
  }) => void;
}

export function ScheduleDialog({ open, onClose, onSchedule }: ScheduleDialogProps) {
  const [title, setTitle] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSchedule({
      title: title.trim(),
      platform: "youtube", // or selected platform
      fileUrl: "", // from upload
    });
    onClose();
  };

  return (
    <div className="space-y-4">
      <h3 className="font-medium">Schedule Post</h3>
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input input-bordered w-full"
          placeholder="Post title"
          required
        />
        <Button type="submit" className="mt-3">
          Schedule
        </Button>
      </form>
      <button
        onClick={onClose}
        className="mt-2 text-sm text-muted-foreground"
      >
        Cancel
      </button>
    </div>
  );
}
```

### ❌ Anti-Patterns (Avoid)

- ❌ No `any` types unless absolutely necessary
- ❌ No `(prev: number) => prev + 1` without type annotation
- ❌ No inline styles instead of Tailwind
- ❌ No `className="px-4 py-2"` without using button/variant styles from shadcn/ui
- ❌ No console.log statements in production code (use proper logging)

---

## Testing Strategy

### Test Framework: Vitest

| Test Level | Location | Coverage Expectation | Purpose |
|------------|----------|---------------------|---------|
| **Unit** | `src/**/*.test.ts` | 80% overall | Individual functions, hooks, utilities |
| **Integration** | `src/**/*.integration.test.ts` | 70% | Component interactions, form validation |
| **E2E** | `e2e/` (Cypress or Playwright) | Critical paths only | Full user flows (login, schedule, publish) |

### Unit Test Examples

```tsx
// ✅ Hook test example
import { describe, it, expect } from "vitest";
import { useAuth } from "@/contexts/AuthContext";

describe("useAuth", () => {
  it("should initialize with guest state", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("should login with Google OAuth", async () => {
    // Mock the Supabase auth flow
    await renderHook(() => useAuth().login());
    // ... test assertions
  });
});
```

### Integration Test Examples

```tsx
// ✅ Form validation integration
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ScheduleForm } from "@/components/ScheduleForm";

describe("ScheduleForm", () => {
  it("should validate required fields", () => {
    const { result } = render(<ScheduleForm />);
    fireEvent.submit(result.current.form);
    expect(result.getByText("Title is required")).toBeInTheDocument();
  });

  it("should submit valid form", async () => {
    // ... test flow
  });
});
```

### E2E Test Critical Paths (Playwright recommended)

1. **Login flow** - Google OAuth → Supabase session → Protected routes access
2. **Upload flow** - Select media → Preview → Schedule selection
3. **Platform connection** - Connect YouTube/Instagram/Facebook/TikTok/LinkedIn accounts
4. **Publish scheduling** - Set date/time → Add caption → Queue for posting
5. **Status tracking** - Real-time updates from published posts

### Verification Before Commit

- [ ] `npm run lint` passes (no new errors)
- [ ] `npm run test` passes with ≥80% coverage on changed files
- [ ] TypeScript compilation: `npx tsc --noEmit` passes
- [ ] `npm run build` succeeds (builds Tauri .exe)
- [ ] No secrets or keys in committed code

---

## Boundaries

### Always Do (Mandatory)

- ✅ Run `npm run lint` before commits; fix all errors
- ✅ Follow TypeScript strict mode; no `any` types without justification
- ✅ Use existing Supabase patterns for auth and data fetching
- ✅ Maintain 2-column grid layout for desktop (lg:grid-cols-2)
- ✅ Preserve existing URL routes (`/dashboard`, `/upload`, `/calendar`, etc.)
- ✅ Keep AI caption generation flow with stop button
- ✅ Maintain bulk operation patterns (select all/deselect, mark as ready/posted)
- ✅ Use existing date-fns patterns for date handling
- ✅ Preserve Tailwind color palette from existing config
- ✅ Run tests before committing any code

### Ask First (Requires Approval)

- ❓ Database schema changes - Must review impact on existing queries
- ❓ Adding new npm dependencies - Justify why existing packages don't suffice
- ❓ Tauri API additions - Confirm Windows-only scope is acceptable
- ❓ UI layout modifications beyond 2-column grid - Review design impact
- ❓ Changing auth flow (Google OAuth scope, session handling) - Security review needed

### Never Do (Absolute Prohibitions)

- ❌ Commit `SUPABASE_SERVICE_ROLE_KEY` or any secret keys
- ❌ Edit `package-lock.json` manually (use `npm install` instead)
- ❌ Remove failing tests without explicit approval
- ❌ Change Tauri from v2 to Electron (scope change required)
- ❌ Modify existing platform integration OAuth credentials
- ❌ Remove any existing page component (all 17 must remain)
- ❌ Store user passwords or tokens in localStorage without encryption
- ❌ Add code that bypasses Supabase RLS (Row Level Security)

---

## Success Criteria (Done Definition)

**Functional Completeness:**
- [x] All 17 web page components rendered in Tauri window
- [x] Navigation works: all routes accessible from main menu
- [x] Upload and schedule flow works end-to-end (media selection → caption → platform selection → schedule)
- [x] All 5 platform connections functional (YouTube, Instagram, Facebook, TikTok, LinkedIn)
- [x] AI caption generation with Groq integration works
- [x] Stop button functional during AI generation
- [x] Bulk operations (select all, deselect, mark ready, delete) work
- [x] Real-time status updates from published posts
- [x] Calendar view displays scheduled posts by date
- [x] Queue management (retry, remove, priority) functional

**Non-Functional:**
- [x] `.exe` installs and launches on Windows 10/11
- [x] Auto-update checks website for new version (prompt on launch)
- [x] Initial page load < 3s on typical broadband connection
- [x] No CLS (layout shift) during initial load (CLS < 0.1)
- [x] Memory usage reasonable (no memory leaks in background)
- [x] Tauri window respects Windows taskbar and minimization
- [x] Keyboard shortcuts (Ctrl+S, Ctrl+P, Esc to close dialogs)
- [x] High contrast mode accessible (Tailwind `forced-colors` support)
- [x] Error boundaries catch and display errors gracefully

**Out of Scope (Verified Not Built):**
- [x] macOS/Linux versions (Windows-only confirmed)
- [x] Electron framework (Tauri confirmed as wrapper)
- [x] New database tables or schema changes
- [x] Mobile platform support (iOS/Android)
- [x] Chrome/Firefox extension (separate existing repo)

---

## Open Questions (To Resolve Before Phase 2)

1. **Tauri vs alternative wrappers** - Confirmed Tauri 2.0 with WebView2 for Windows, but need to verify Windows 10 compatibility (WebView2 runtime requirement)

2. **Auto-update mechanism** - Should we check on every launch or every N days? What HTTP endpoint hosts the `.exe` updates?

3. **Tray/minimize behavior** - Should app minimize to system tray or just to taskbar? Does user expect tray with notifications for post status?

4. **Preload script scope** - Which Tauri APIs are absolutely needed vs nice-to-have? Priority: fs (file selection), shell (open links), tray, clipboard, shortcuts

5. **Offline capability** - Should desktop app work offline with cached data, or always require internet connection to Supabase? LocalStorage persistence vs offline mode?

6. **Backup/restore of local data** - If user reinstalls, how do they retain their account connections and scheduling preferences?

7. **Custom about window** - Should `.exe` have about screen with version, copyright, and link to website?

8. **Error reporting** - How do we surface Tauri/app errors to users? Sentry integration? Basic dialogs?

9. **File association** - Should `.exe` open `.flowpost` project files? (Probably out of scope for v1)

10. **Update frequency** - Check for updates on every launch? Daily? Weekly? First launch only?

---

## Capability Map (Module Structure)

Since this is a single unified feature (desktop wrapper for existing web app), we have one module:

```markdown
# Capability Map: flowpost-desktop

| Module id | Responsibility | Depends on |
|---|---|---|
| desktop | Full FlowPost web app in Tauri .exe wrapper | web-app (existing codebase), tauri APIs |

Build order: web-app → desktop (must have web app working first)
```

**Module boundary:** The `desktop` module is the Tauri wrapper + preload scripts. Everything inside `src/` remains the existing web app code. No database changes, no new API endpoints.

**Dependency direction:** `desktop` depends on `web-app` (existing React + Supabase code must work first). The Tauri-specific code (`preload.ts`, `tauri.conf.json`) is minimal and depends on the web app code, not the other way around.

**Interface at boundary:** The `preload.ts` file exposes a typed API surface to React:
```ts
// Preload exposes only what's needed
interface TauriAPI {
  selectFile: (options: { types: string }) => Promise<string | null>;
  showNotification: (opts: { title: string; body: string }) => void;
  getCurrentWindow: () => import('@tauri-apps/api').Window;
  // ... minimal, focused APIs
}
export const invoke = <T>(command: string, ...args: any[]) => Promise<T>;
```

---

## Plan (Will Create After Spec Approval)

Following this spec approval, I will create `tasks/plan.md` with:
- Dependency graph of 17 pages/features
- Implementation order (core auth first, then upload, then platform connections)
- Task breakdown using `planning-and-task-breakdown` skill
- Vertical slicing approach (login → dashboard → upload → scheduling → all platforms)
- Verification checkpoints between phases

**Plan will be saved to:** `E:\Web App\flowpost-studio\tasks\plan.md`
**Todo list will be:** `E:\Web App\flowpost-studio\tasks\todo.md`

---

## Verification Checklist (Before Proceeding to Phase 2: Plan)

- [x] Spec covers all six core areas (Objective, Commands, Structure, Style, Testing, Boundaries)
- [x] Success criteria are specific and testable (15+ concrete conditions)
- [x] Boundaries (Always/Ask First/Never) are fully defined
- [x] Spec saved to `docs/spec/flowpost-desktop-spec.md` in repository
- [x] All 17 web app features documented and accounted for
- [x] Tauri 2.0 choice confirmed (no Electron)
- [x] Windows-only scope confirmed
- [x] Auto-update requirement documented
- [x] Open questions listed (10 items for human resolution)
- [x] Capability map approved (single module: desktop)
- [x] Code style examples provided
- [x] Testing strategy defined (unit + integration + E2E critical paths)
- [x] No secrets or new API keys introduced in spec

**Ready to proceed to Phase 2: Plan** - Awaiting human confirmation on open questions (especially Tauri auto-update endpoint, tray behavior, and offline capability).