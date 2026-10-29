# Implementation Plan: FlowPost Desktop Application (Windows, Pake-based)

**Status:** Active — supersedes `tasks/archive/plan-tauri-fork.md` (archived 2026-10-22)  
**Created:** 2026-10-22 · **Revised:** 2026-10-23 (skills-based planning: planning-and-task-breakdown + spec-driven-development + shipping-and-launch)  
**Target:** FlowPost Desktop v1.0 (Windows x64, portable `.exe`)

---

## Overview

Ship FlowPost Studio as a native Windows desktop app by wrapping the **deployed web app** (`https://flowpost-studio.vercel.app`) with [Pake](https://github.com/tw93/Pake) — a Tauri-2-based website-to-desktop packager. The desktop client becomes an installable `.exe` with a system tray, native file pickers, drag-and-drop and window management, while all product logic stays where it already is (Supabase edge functions + the React frontend). A site deploy is instantly an app update.

The previous approach — a hand-written `src-tauri/` fork in this repo — is **superseded**. It needed 12 Rust commands, a JS bridge, Vite externalization and a second build pipeline, and was left non-building. Pake provides that upstream, maintained.

---

## Assumptions (surfaced per spec-driven-development)

1. **Desktop login = Google OAuth** (user-confirmed). Google may refuse sign-in inside an embedded webview; Phase 0 proves this before anything is built. → Correct me now or I'll proceed with this.
2. **Windows x64 only.** macOS/Linux deferred (Google blocks WKWebView OAuth harder).
3. **Remote-URL packaging** (`pake https://flowpost-studio.vercel.app`). Local-dist packaging is not planned — only if Phase 0 forces it.
4. **The web app stays production-grade.** Desktop is a shell; a web regression blocks desktop too, so web health is a hard prerequisite.
5. **v1 is a portable `.exe`,** not an MSI. No installer, no CI, no code signing until someone needs to install it.

---

## Architecture Decisions

| Decision | Rationale |
|---|---|
| **Pake CLI over a forked `src-tauri/`** | Pake *is* Tauri 2, shipped and maintained upstream. Removes 12 Rust commands, the JS bridge and a second build pipeline. |
| **Remote-URL mode** | Zero code changes to the web app; site deploy = app update; no duplicate frontend build to keep in sync. |
| **OAuth fixed in the web app, not the shell** | Google OAuth and `window.open` popups are webview-constrained regardless of the wrapper. A redirect flow (`window.location.href`) works in browsers *and* webviews, and improves the web app. |
| **Portable `.exe` for v1** | Pake's `--keep-binary` yields a standalone `FlowPost.exe`. No installer, no CI, no code signing — none of which anyone asked for yet. |
| **Desktop config in the repo as code** | `desktop/pake.config.json` + `desktop/inject/*.js` — versioned, reviewable, reproducible. |
| **Extension-dependent features stay web-only** | `/tools` needs the Chrome extension; the web app already shows a clean "extension not detected" state, so the desktop app needs no special handling. |
| **Wrapper auto-update deferred** | Pake has no updater; adding one means forking Pake. Revisit in v1.1. |

---

## Dependency Graph (bottom-up implementation order)

```
Task 1 (toolchain + Pake CLI install)
  └─> Task 2 (spike app + OAuth matrix)
        └─> Checkpoint 0 (GO/NO-GO)
              ├─> Task 3 (archive Tauri fork + revise spec/intent)
              │     └─> Task 4 (web restore + verify build + tests)
              │           └─> Task 5 (guardrails: typecheck script, baseline, .gitignore)
              │                 └─> Checkpoint 1 (web healthy, repo clean)
              │                       └─> Task 6 (desktop config + inject scripts)
              │                             ├─> Task 7 (produce .exe + verify on clean machine)
              │                             └─> Checkpoint 2 (reproducible build)
              │                                   └─> Task 8 (Google OAuth + platform OAuth in web app)
              │                                         └─> Task 9 (session persistence + refresh + logout)
              │                                               └─> Checkpoint 3 (auth complete in app)
              │                                                 ├─> Task 10 (keyboard shortcuts via inject)
              │                                                 ├─> Task 11 (native notifications via inject)
              │                                                 ├─> Task 12 (file upload + drag-drop via inject)
              │                                                 ├─> Task 13 (window lifecycle + zoom + dark mode via inject)
              │                                                 └─> Task 14 (hide /tools via inject)
              │                                                       └─> Checkpoint 4 (feature parity in app)
              │                                                         └─> Task 15 (version check + hosted download)
              │                                                               └─> Task 16 (host installer + docs)
              │                                                                     └─> Task 17 (release checklist + rollback)
              │                                                                       └─> Checkpoint 5 (v1.0.0 released)
              └─> Task 18 (local-dist `pake ./dist`, only if Phase 0 NO-GO)
```

---

## Task List

### Phase 0: De-risk Spike (no repo changes)

#### Task 1: Verify toolchain, install Pake CLI

**Description:** Confirm the machine can build Tauri apps and install the Pake CLI. Rust ≥ 1.85 and Node ≥ 20.9 are required; on Windows either Visual Studio Build Tools 2022 (MSVC) or a MinGW/GNU toolchain must be present.

**Acceptance criteria:**
- [ ] `node -v` ≥ 20.9, `rustc -V` ≥ 1.85
- [ ] `npm install -g pake-cli` succeeds; `pake --version` runs
- [ ] Windows toolchain (MSVC vs `--windows-toolchain gnu`) written down in `desktop/README.md`

**Verification:**
- [ ] Manual: `pake --version` output captured
- [ ] Manual: if MSVC absent, confirm GNU path viable before continuing

**Dependencies:** None  
**Files likely touched:** `desktop/README.md` (new)  
**Estimated scope:** XS

#### Task 2: Build spike app against production; run OAuth matrix

**Description:** Build a throwaway desktop app against the production URL and prove — or disprove — the desktop-critical web behaviours inside an embedded webview. This is the single highest-risk unknown; everything downstream depends on the result.

**Acceptance criteria:**
- [ ] A spike `.exe` builds and launches the FlowPost login page
- [ ] **Google sign-in** completes and lands on `/dashboard` *inside the app window*
- [ ] **Session persistence**: closing and relaunching keeps the user signed in
- [ ] **Platform OAuth**: Facebook connect opens, completes, notifies the opener
- [ ] **File upload**: "Upload from Computer" opens native Windows picker; upload succeeds
- [ ] Every outcome (pass/fail + observed error text) recorded in `desktop/spike-results.md`

**Verification:**
- [ ] Manual: each matrix row executed with evidence (screenshot or error text)
- [ ] Decision recorded: **GO** / **GO with fixes** / **NO-GO** (fall back to Task 18 local-dist)

**Dependencies:** Task 1  
**Files likely touched:** `desktop/spike-results.md` (new)  
**Estimated scope:** S

### Checkpoint 0: GO / NO-GO

- [ ] Tasks 1–2 complete, evidence recorded
- [ ] Written decision naming packaging mode and OAuth strategy
- [ ] Human reviewed and approved before Phase 1

---

### Phase 1: Repository hygiene + web restore

#### Task 3: Archive Tauri fork + revise spec/intent

**Description:** Preserve abandoned Tauri-fork work without losing it; update project documents to describe Pake architecture. The three Tauri commits and uncommitted scaffold currently sit on `main` and break a clean-clone build.

**Acceptance criteria:**
- [ ] `feature/desktop-tauri-fork` branch holds `src-tauri/`, `src/preload.ts`, commits `b37cb82`/`aff56d4`/`22b61b6`
- [ ] `tasks/archive/plan-tauri-fork.md` + `tasks/archive/todo-tauri-fork.md` kept with "superseded" header
- [ ] `docs/spec/flowpost-desktop-spec.md` rewritten for Pake architecture
- [ ] `docs/intent/flowpost-desktop.md` updated (wrapper = auto-updating shell; extension-only features out of parity scope)
- [ ] Short note records *why* Pake replaced the fork

**Verification:**
- [ ] `git branch --list feature/desktop-tauri-fork` shows branch
- [ ] `git log feature/desktop-tauri-fork --oneline -3` shows Tauri commits
- [ ] Docs contain no remaining claims of hand-written Rust command layer

**Dependencies:** Task 2  
**Files likely touched:** `docs/spec/flowpost-desktop-spec.md`, `docs/intent/flowpost-desktop.md`  
**Estimated scope:** S

#### Task 4: Restore web app to clean, building, styled state

**Description:** Working tree previously broke web app four ways: Tailwind v4 against v3 CSS (all styling lost), `UploadPage.tsx` corrupted by stray JSX block + deleted state declarations, `AccountsPage.tsx` routed through uninstalled Tauri import, `postcss.config.js` deleted. Restore last known-good state and prove it.

**Acceptance criteria:**
- [ ] `src/pages/UploadPage.tsx`, `src/pages/AccountsPage.tsx`, `src/main.tsx`, `postcss.config.js`, `package.json`, `vite.config.ts`, `package-lock.json` restored to `41f4c73`
- [ ] `npx vite build` exits 0 and emitted CSS > 50 KB with `.flex` and `.rounded-lg`
- [ ] `npx vitest run` passes 92/92
- [ ] `/upload` and `/accounts` render with no console errors and no `ReferenceError`
- [ ] Web build deployable to Vercel as-is

**Verification:**
- [ ] Build: `npx vite build` exit 0; CSS size/content assertions
- [ ] Tests: `npx vitest run` → all green
- [ ] Manual: `/upload` → select file → "Add to Queue" → no crash; `/accounts` → connect dialog opens

**Dependencies:** Task 3  
**Files likely touched:** the seven listed above  
**Estimated scope:** S

#### Task 5: Add repository guardrails

**Description:** Prevent failure modes found during audit: build artifacts committed at root, `tsc` checking zero files, untracked work in tree for weeks.

**Acceptance criteria:**
- [ ] `.gitignore` covers `FlowPost-Portable*/`, `dist-tauri-portable/`, `skills/`, `desktop/dist/`, `desktop/*.exe`
- [ ] `package.json` gains `"typecheck": "tsc -p tsconfig.app.json --noEmit"`
- [ ] Typecheck baseline (~126 pre-existing errors) recorded in `desktop/README.md`
- [ ] `desktop/README.md` documents one-command local build

**Verification:**
- [ ] `npm run typecheck` reports baseline count
- [ ] `git check-ignore -v` resolves for artifact paths
- [ ] `git status` clean after local build

**Dependencies:** Task 4  
**Files likely touched:** `.gitignore`, `package.json`, `desktop/README.md`  
**Estimated scope:** XS

### Checkpoint 1: Web healthy, repo clean

- [ ] `npm run build` exits 0 with full Tailwind CSS
- [ ] `npm run test` green; `npm run typecheck` at baseline
- [ ] Fresh clone of `main` builds
- [ ] `main` pushed; `origin/main` current

---

### Phase 2: Packaging

#### Task 6: Desktop config as code

**Description:** Replace ad-hoc CLI flags with versioned config so any developer/CI reproduces same app. Window geometry, tray, identity, inject scripts all here.

**Acceptance criteria:**
- [ ] `desktop/pake.config.json` exists and validates against Pake schema
- [ ] Config pins: name `FlowPost`, identifier `com.flowpost.desktop`, window 1440×900 (min 1024×700), `--show-system-tray`, `--hide-on-close`, `--enable-drag-drop`, `--enable-find`, `--password-autosave`, `--download-dir`
- [ ] `desktop/inject/flowpost.js` + `desktop/inject/flowpost.css` exist with documented purpose
- [ ] `desktop/build.ps1` runs Pake with `--config` and `--json`

**Verification:**
- [ ] `pake --config desktop/pake.config.json --json` returns JSON object with `ok: true`
- [ ] No flag duplicated between config and script

**Dependencies:** Checkpoint 1  
**Files likely touched:** `desktop/pake.config.json`, `desktop/inject/flowpost.js`, `desktop/inject/flowpost.css`, `desktop/build.ps1`  
**Estimated scope:** S

#### Task 7: Produce and verify portable `.exe`

**Description:** Build distributable and prove it works on clean machine. v1 ships standalone executable — no installer, no CI, no signing.

**Acceptance criteria:**
- [ ] `pake --config desktop/pake.config.json --keep-binary` produces `FlowPost.exe`
- [ ] Exe runs from any folder on clean Windows 10/11 machine (WebView2 present)
- [ ] Tray icon appears; close hides to tray; tray menu quits cleanly
- [ ] Phase 0 OAuth matrix passes against this build

**Verification:**
- [ ] Run on clean machine; confirm no installer, no registry writes, no admin prompt

**Dependencies:** Task 6  
**Files likely touched:** `desktop/` (build output, gitignored)  
**Estimated scope:** S

### Checkpoint 2: Reproducible build

- [ ] Build comes from committed config, not local flags
- [ ] Clean-machine run passes OAuth matrix
- [ ] Human approved look and feel

---

### Phase 3: Auth in the webview

#### Task 8: Google + platform OAuth + session persistence

**Description:** Implement Task 2 outcome in **web app** (not shell): Google sign-in inside webview, all five platforms + Google Drive moved from `window.open` popups to full-window redirect, sessions survive restart. One feature path, one task, one file set.

**Acceptance criteria:**
- [ ] Google sign-in completes inside desktop app → `/dashboard`
- [ ] Supabase redirect allow-list contains every landing URL (hosted callback + custom scheme if deep link used)
- [ ] No `window.open` remains in OAuth connect path; every provider round-trips (connect → provider → back → account appears, no manual reload)
- [ ] Popup-blocked and provider-error paths show actionable message
- [ ] Sign in → quit → relaunch → still signed in; expired token refreshes without 429 and without logout; logout clears session
- [ ] Same flows still work in normal browser tab (no desktop-only regression)

**Verification:**
- [ ] Each of six providers exercised in packaged app *and* browser
- [ ] Quit/relaunch cycle with expired token
- [ ] `npm run build`, `npm run test`, `npm run typecheck` green

**Dependencies:** Checkpoint 2  
**Files likely touched:** `src/contexts/AuthContext.tsx`, `src/pages/AccountsPage.tsx`, `src/pages/AuthCallback.tsx`, `src/pages/LoginPage.tsx`  
**Estimated scope:** M

### Checkpoint 3: Auth complete in packaged app

- [ ] Google + 5 platforms + Drive all connect inside app
- [ ] Sessions persist; logout works
- [ ] Browser flow no regressions

---

### Phase 4: Desktop UX parity

#### Task 10: Global keyboard shortcuts

**Description:** Ctrl+S (save), Ctrl+P (schedule dialog), Esc (close dialogs) via injected script — browser build untouched.

**Acceptance criteria:**
- [ ] Ctrl+S triggers save / prevents browser save inside app
- [ ] Ctrl+P opens schedule dialog inside app
- [ ] Esc closes top-most dialog
- [ ] Injected script inert in normal browser tab

**Verification:** Manual: each shortcut pressed inside app; same keys in browser tab behave as before

**Dependencies:** Checkpoint 3  
**Files likely touched:** `desktop/inject/flowpost.js`  
**Estimated scope:** S

#### Task 11: Native notifications for post status

**Description:** "Post scheduled / published / failed" as native Windows toasts.

**Acceptance criteria:**
- [ ] Notification permission requested once, choice remembered
- [ ] Published/failed post → native toast within seconds
- [ ] Focus Assist suppresses toasts (OS-side)
- [ ] One toast per post status transition

**Verification:** Manual: publish post → toast appears; force failure → failure toast; Focus Assist enabled → no toast

**Dependencies:** Task 10  
**Files likely touched:** `desktop/inject/flowpost.js`, `src/pages/QueuePage.tsx`  
**Estimated scope:** S

#### Task 12: File upload + drag-and-drop + download directory

**Description:** Native media handling: file picker, drag video onto window, downloads dir.

**Acceptance criteria:**
- [ ] "Upload from Computer" opens native Windows picker
- [ ] Dragging `.mp4`/`.mov`/`.jpg`/`.png` onto upload area starts import
- [ ] Downloads land in configured FlowPost directory
- [ ] Files over 200 MB rejected with clear message

**Verification:** Manual: upload via picker and drag-drop; download lands in configured dir

**Dependencies:** Checkpoint 3  
**Files likely touched:** `desktop/pake.config.json`, `src/pages/UploadPage.tsx`  
**Estimated scope:** S

#### Task 13: Window lifecycle + find-in-page + dark mode + min sizes

**Description:** Desktop-quality window behaviour.

**Acceptance criteria:**
- [ ] Window resizable to 1024×700 without layout breakage
- [ ] Ctrl+F find; Ctrl+/- / 0 zoom
- [ ] Dark mode follows system theme
- [ ] Close hides to tray; quitting from tray clean

**Verification:** Manual: resize to minimum, zoom, toggle system dark mode, close/quit

**Dependencies:** Task 10  
**Files likely touched:** `desktop/pake.config.json`, `desktop/inject/flowpost.css`  
**Estimated scope:** XS

#### Task 14: Hide extension-only features on desktop

**Description:** `/tools` depends on Chrome extension; cannot work in desktop. Hide it.

**Acceptance criteria:**
- [ ] `/tools` + sidebar entry hidden in desktop build
- [ ] No layout gap or broken route
- [ ] `/tools` still present in browser build

**Verification:** Manual: sidebar in packaged app has no Tools entry; `/tools` direct nav shows notice or landing page

**Dependencies:** Task 10  
**Files likely touched:** `desktop/inject/flowpost.js`, `desktop/inject/flowpost.css`, `src/components/AppSidebar.tsx`  
**Estimated scope:** S

### Checkpoint 4: Feature parity in packaged app

- [ ] All 16 web surfaces (17 minus extension-only `/tools`) reachable and functional
- [ ] Shortcuts / notifications / upload / drag-drop / tray / zoom / dark mode verified
- [ ] `npm run build`, `npm run test`, `npm run typecheck` green
- [ ] Human walkthrough of full flow

---

### Phase 5: Distribution

#### Task 15: Version check + download prompt

**Description:** Pake has no auto-updater. Publish current desktop version in JSON; app compares on launch.

**Acceptance criteria:**
- [ ] `desktop-version.json` hosted (version + download URL + notes), cache-controlled
- [ ] App checks on launch, at most once per 24 h
- [ ] Non-blocking banner when newer version exists, linking to installer
- [ ] No prompt when version current; unreachable file never blocks start

**Verification:** Manual: bump hosted version → banner appears after relaunch; unreachable → app starts normally

**Dependencies:** Checkpoint 4  
**Files likely touched:** `public/desktop-version.json`, `desktop/inject/flowpost.js`, `vercel.json`  
**Estimated scope:** S

#### Task 16: Host installer + documentation

**Description:** Make build downloadable and document usage.

**Acceptance criteria:**
- [ ] `.msi` downloadable from site (or release page)
- [ ] `README.md` + `USER_GUIDE.md` desktop section (install, sign-in, tray, shortcuts, known limits)
- [ ] `SESSION_STATE.md` records desktop release
- [ ] `docs/spec/flowpost-desktop-spec.md` matches shipped

**Verification:** Manual: download from link in clean browser profile, install, sign in; docs reviewed by human

**Dependencies:** Task 15  
**Files likely touched:** `README.md`, `USER_GUIDE.md`, `SESSION_STATE.md`, `docs/spec/flowpost-desktop-spec.md`  
**Estimated scope:** S

#### Task 17: Release checklist + rollback path

**Description:** Define desktop release requirements and undo path.

**Acceptance criteria:**
- [ ] Checklist: version bump → CI build → hash → download URL → version JSON → changelog → support notes
- [ ] Rollback path defined (repoint download URL to previous build) and rehearsed once
- [ ] Checklist executed end-to-end for v1.0

**Verification:** Dry run produces working release; rollback rehearsed

**Dependencies:** Task 16  
**Files likely touched:** `desktop/RELEASE.md`  
**Estimated scope:** S

### Checkpoint 5: v1.0 released

- [ ] Installer published and downloadable
- [ ] Phase 3–4 criteria re-verified against release build
- [ ] Documentation current
- [ ] Human sign-off

---

### Deferred (trigger decides — not planned)

| Item | Trigger |
|------|---------|
| MSI installer + CI release pipeline | Non-technical user needs to install |
| Wrapper auto-update / version banner | Users running stale builds |
| Ctrl+S / Ctrl+P shortcuts, native toasts | Testers ask for them (Pake has `--activation-shortcut` for app-level) |
| Local-dist packaging (`pake ./dist`), offline mode | Offline becomes requirement, or Phase 0 forces it |
| macOS/Linux builds | Windows v1 stable |
| Native (extension-free) `/tools` for desktop | Monetization checks needed on desktop |

---

## Open Questions (answer before Phase 2)

- [ ] Distribution channel: GitHub Releases, Vercel site, or both?
- [ ] Audience: internal team only or public download?
- [ ] Code-signing certificate available when public distribution starts?
- [ ] Version source: Pake's `version_name` vs app's own version badge?

---

## Definition of Done (per task)

Every task clears project-wide bar in `.opencode/references/definition-of-done.md` plus its own acceptance criteria: acceptance criteria met, behaviour verified at runtime, no regressions, tests green, lint/format clean, scoped changes only, docs updated, security/rollback considered, human review before merge. New non-trivial logic leaves one small test (ponytail rule).

---

## Related Documents

- `docs/spec/flowpost-desktop-spec.md` — desktop spec (updated in Task 3)
- `docs/intent/flowpost-desktop.md` — intent (updated in Task 3)
- `tasks/archive/plan-tauri-fork.md` — superseded Tauri fork plan
- `tasks/archive/todo-tauri-fork.md` — superseded task list
- `SESSION_STATE.md` — running log of shipped work
