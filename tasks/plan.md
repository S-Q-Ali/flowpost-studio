# Implementation Plan: FlowPost Desktop Application (Windows, Pake-based)

**Status:** Active — supersedes `tasks/archive/plan-tauri-fork.md` (archived 2026-10-22)
**Created:** 2026-10-22 · **Revised:** 2026-10-22 (ponytail ladder applied — 20 tasks → 10)
**Target:** FlowPost Desktop v1.0 (Windows x64, portable `.exe`)

## Overview

Ship FlowPost Studio as a native Windows desktop app by wrapping the **deployed web app**
(`https://flowpost-studio.vercel.app`) with [Pake](https://github.com/tw93/Pake) — a
Tauri-2-based website-to-desktop packager. The desktop client becomes an installable
`.exe` with a system tray, native file pickers, drag-and-drop and window management,
while all product logic stays where it already is (Supabase edge functions + the React
frontend). A site deploy is instantly an app update.

The previous approach — a hand-written `src-tauri/` fork in this repo — is **superseded**.
It needed 12 Rust commands, a JS bridge, Vite externalization and a second build
pipeline, and was left non-building. Pake provides that upstream, maintained.

## Assumptions

1. **Desktop login = Google OAuth** (user-confirmed). Google may refuse sign-in inside an
   embedded webview; Phase 0 proves this before anything is built.
2. **Windows x64 only.** macOS/Linux deferred (Google blocks WKWebView OAuth harder).
3. **Remote-URL packaging** (`pake https://flowpost-studio.vercel.app`). Local-dist
   packaging is not planned — only if Phase 0 forces it.
4. **The web app stays production-grade.** Desktop is a shell; a web regression blocks
   desktop too, so web health is a hard prerequisite.
5. **v1 is a portable `.exe`,** not an MSI. No installer, no CI, no code signing until
   someone needs to install it.

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

## Task List

### Phase 0: De-risk spike (no repo changes)

- [ ] **Task 1:** Verify toolchain, install Pake CLI
- [ ] **Task 2:** Build a spike app against production and run the OAuth matrix
- [ ] **Checkpoint 0:** GO / NO-GO recorded

### Phase 1: Repository hygiene + web restore

- [ ] **Task 3:** Archive the Tauri fork, revise spec/intent
- [ ] **Task 4:** Restore the web app to a clean, building, styled state
- [ ] **Task 5:** Guardrails — gitignore, real `typecheck` script, recorded baseline
- [ ] **Checkpoint 1:** Web healthy, repo clean

### Phase 2: Packaging

- [ ] **Task 6:** Desktop config as code — window, tray, identity, inject scripts
- [ ] **Task 7:** Produce and verify the portable `.exe`
- [ ] **Checkpoint 2:** Reproducible build, clean machine, OAuth matrix green

### Phase 3: Auth in the webview

- [ ] **Task 8:** Google + platform OAuth + session persistence
- [ ] **Checkpoint 3:** All six OAuth flows complete inside the app

### Phase 4: Distribution

- [ ] **Task 9:** Publish the build + write the desktop docs
- [ ] **Task 10:** Release checklist and rollback path
- [ ] **Checkpoint 4:** v1.0 released

### Deferred (not planned — trigger decides)

| Deferred | Trigger to revisit |
|---|---|
| MSI installer + CI release pipeline | A non-technical user needs to install it |
| Wrapper auto-update / version banner | Users start running stale builds |
| Ctrl+S / Ctrl+P shortcuts, native toasts | Testers ask for them (Pake has `--activation-shortcut` for app-level) |
| Local-dist packaging (`pake ./dist`), offline mode | Offline becomes a requirement, or Phase 0 forces it |
| macOS / Linux builds | Windows v1 is stable |
| Native (extension-free) `/tools` for desktop | Monetization checks are needed on desktop |

---

## Task Details

### Phase 0: De-risk spike

#### Task 1: Verify build toolchain and install Pake CLI

**Description:** Confirm the machine can build Tauri apps and install the Pake CLI. Rust
≥ 1.85 and Node ≥ 20.9 are required; on Windows either Visual Studio Build Tools 2022
(MSVC) or a MinGW/GNU toolchain must be present.

**Acceptance criteria:**
- [ ] `node -v` ≥ 20.9, `rustc -V` ≥ 1.85
- [ ] `npm install -g pake-cli` succeeds; `pake --version` runs
- [ ] The chosen Windows toolchain is written down in `desktop/README.md`

**Verification:** `pake --version` output captured; GNU path confirmed viable if MSVC is absent.

**Dependencies:** None · **Files:** `desktop/README.md` (new) · **Scope:** XS

#### Task 2: Build a spike app and run the OAuth matrix

**Description:** Build a throwaway desktop app against the production URL and prove —
or disprove — the desktop-critical web behaviours inside an embedded webview. The single
highest-risk unknown in the project; everything downstream depends on the result.

**Acceptance criteria:**
- [ ] A spike `.exe` builds and launches the FlowPost login page
- [ ] **Google sign-in** completes and lands on `/dashboard` *inside the app window*
- [ ] **Session persistence**: close and relaunch → still signed in
- [ ] **Platform OAuth**: Facebook connect opens, completes, notifies the opener
- [ ] **File upload**: "Upload from Computer" opens the native picker; upload succeeds
- [ ] Every outcome (pass/fail + observed error text) recorded in `desktop/spike-results.md`

**Verification:** each matrix row executed with evidence (screenshot or error text);
decision written: **GO** / **GO with fixes** / **NO-GO** (fall back to local-dist).

**Dependencies:** Task 1 · **Files:** `desktop/spike-results.md` (new) · **Scope:** S

### Checkpoint 0: GO / NO-GO

- [ ] Tasks 1–2 complete, evidence recorded
- [ ] Written decision naming the packaging mode and the OAuth strategy
- [ ] Human approved before Phase 1

---

### Phase 1: Repository hygiene + web restore

#### Task 3: Archive the Tauri fork and revise the spec

**Description:** Preserve the abandoned Tauri-fork work without losing it, then update the
project documents so they describe the Pake architecture. The three Tauri commits and the
uncommitted scaffold currently sit on `main` and break a clean-clone build.

**Acceptance criteria:**
- [ ] `src-tauri/`, `src/preload.ts` and the three Tauri commits preserved on branch
      `feature/desktop-tauri-fork` (not deleted)
- [ ] `tasks/archive/plan-tauri-fork.md` + `tasks/archive/todo-tauri-fork.md` kept with a
      "superseded" header
- [ ] `docs/spec/flowpost-desktop-spec.md` rewritten for the Pake architecture
- [ ] `docs/intent/flowpost-desktop.md` updated to match (wrapper = auto-updating shell;
      extension-only features out of parity scope)
- [ ] A short note records *why* Pake replaced the fork

**Verification:** `git branch --list feature/desktop-tauri-fork` and
`git log feature/desktop-tauri-fork --oneline -3` show the preserved work; docs contain no
remaining claims of a hand-written Rust command layer.

**Dependencies:** Task 2 · **Files:** `docs/spec/flowpost-desktop-spec.md`,
`docs/intent/flowpost-desktop.md` · **Scope:** S

#### Task 4: Restore the web app to a clean, building, styled state

**Description:** The working tree breaks the web app four ways: Tailwind v4 installed
against v3 CSS syntax (all styling lost), `UploadPage.tsx` corrupted by a stray JSX block
and deleted state declarations, `AccountsPage.tsx` routed through an uninstalled Tauri
import, and `postcss.config.js` deleted. Restore the last known-good state and prove it.

**Acceptance criteria:**
- [ ] `src/pages/UploadPage.tsx`, `src/pages/AccountsPage.tsx`, `src/main.tsx`,
      `postcss.config.js`, `package.json`, `vite.config.ts`, `package-lock.json` restored
      to their `41f4c73` state
- [ ] `npx vite build` exits 0 and the emitted CSS is > 50 KB with `.flex` and `.rounded-lg`
- [ ] `npx vitest run` passes
- [ ] `/upload` and `/accounts` render with no console errors and no `ReferenceError`
- [ ] The web build is deployable to Vercel as-is

**Verification:** build + tests as above; manual walk of `/upload` → select file → "Add to
Queue" → no crash, and `/accounts` → connect dialog opens.

**Dependencies:** Task 3 · **Files:** the seven listed above · **Scope:** S

#### Task 5: Add repository guardrails

**Description:** Prevent the failure modes this audit found: build artifacts committed at
the repo root, a `tsc` command that checks zero files, and untracked work sitting in the
tree for weeks.

**Acceptance criteria:**
- [ ] `.gitignore` covers `FlowPost-Portable*/`, `dist-tauri-portable/`, `skills/`,
      `desktop/dist/`, `desktop/*.exe`
- [ ] `package.json` gains `"typecheck": "tsc -p tsconfig.app.json --noEmit"` (root
      `tsc --noEmit` checks 0 files — a trap)
- [ ] The typecheck baseline (≈126 pre-existing errors) is recorded in `desktop/README.md`
      so future diffs can be compared against it
- [ ] `desktop/README.md` documents the one-command local build

**Verification:** `npm run typecheck` reports the baseline; `git check-ignore -v` resolves
for the artifact paths; `git status` is clean after a local build.

**Dependencies:** Task 4 · **Files:** `.gitignore`, `package.json`, `desktop/README.md` · **Scope:** XS

### Checkpoint 1: Web healthy, repo clean

- [ ] `npm run build` exits 0 with full Tailwind CSS
- [ ] `npm run test` green, `npm run typecheck` at baseline
- [ ] A fresh clone of `main` builds
- [ ] `main` pushed, `origin/main` current

---

### Phase 2: Packaging

#### Task 6: Desktop config as code

**Description:** Replace ad-hoc CLI flags with one versioned config so any developer or CI
runner reproduces the same app. Window geometry, tray, identity and the injected script
all live here.

**Acceptance criteria:**
- [ ] `desktop/pake.config.json` exists and validates against Pake's published schema
- [ ] Config pins: name `FlowPost`, identifier `com.flowpost.desktop`, window 1440×900
      (min 1024×700), `--show-system-tray`, `--hide-on-close`, `--enable-drag-drop`,
      `--enable-find`, `--password-autosave`, `--download-dir`
- [ ] `desktop/inject/flowpost.js` + `desktop/inject/flowpost.css` exist, each with a
      documented purpose (currently: desktop-only chrome tweaks; nothing else is needed
      because the web app already handles a missing Chrome extension gracefully)
- [ ] `desktop/build.ps1` runs Pake with `--config` and `--json`

**Verification:** `pake --config desktop/pake.config.json --json` returns one JSON object
with `ok: true`; no flag is duplicated between the config and the script.

**Dependencies:** Checkpoint 1 · **Files:** `desktop/pake.config.json`,
`desktop/inject/flowpost.js`, `desktop/inject/flowpost.css`, `desktop/build.ps1` · **Scope:** S

#### Task 7: Produce and verify the portable `.exe`

**Description:** Build the distributable and prove it works on a clean machine. v1 ships
a standalone executable — no installer, no CI, no signing.

**Acceptance criteria:**
- [ ] `pake --config desktop/pake.config.json --keep-binary` produces `FlowPost.exe`
- [ ] The exe runs from any folder on a clean Windows 10/11 machine (WebView2 present)
- [ ] Tray icon appears, close hides to tray, tray menu quits cleanly
- [ ] The Phase 0 OAuth matrix passes against this build

**Verification:** run on a clean machine; confirm no installer, no registry writes, no
admin prompt.

**Dependencies:** Task 6 · **Files:** `desktop/` (build output, gitignored) · **Scope:** S

### Checkpoint 2: Reproducible build

- [ ] The build comes from the committed config, not from local flags
- [ ] Clean-machine run passes the OAuth matrix
- [ ] Human approved the look and feel

---

### Phase 3: Auth in the webview

#### Task 8: Google + platform OAuth + session persistence

**Description:** Implement the outcome of Task 2 in the **web app** (not the shell):
Google sign-in inside the webview, all five platform connects plus Google Drive moved
from `window.open` popups to a full-window redirect, and sessions that survive an app
restart. One feature path, one task, one set of files.

**Acceptance criteria:**
- [ ] Google sign-in completes inside the desktop app and lands on `/dashboard`
- [ ] Supabase's redirect allow-list contains every landing URL (hosted callback + the
      custom scheme, if a deep link is needed)
- [ ] No `window.open` remains in the OAuth connect path; every provider round-trips
      (connect → provider → back → account appears, no manual reload)
- [ ] Popup-blocked and provider-error paths show an actionable message
- [ ] Sign in → quit → relaunch → still signed in; an expired token refreshes without a
      429 and without logging the user out; logout clears the session
- [ ] The same flows still work in a normal browser tab (no desktop-only regression)

**Verification:** each of the six providers exercised in the packaged app *and* in a
browser; quit/relaunch cycle with an expired token; `npm run build`, `npm run test`,
`npm run typecheck` green.

**Dependencies:** Checkpoint 2 · **Files:** `src/contexts/AuthContext.tsx`,
`src/pages/AccountsPage.tsx`, `src/pages/AuthCallback.tsx`, `src/pages/LoginPage.tsx` ·
**Scope:** M

### Checkpoint 3: Auth complete in the packaged app

- [ ] Google + 5 platforms + Drive all connect inside the app
- [ ] Sessions persist; logout works
- [ ] Browser flow has no regressions

---

### Phase 4: Distribution

#### Task 9: Publish the build and write the desktop docs

**Description:** Make the build obtainable and document how to use it.

**Acceptance criteria:**
- [ ] The `.exe` is downloadable (channel still open — GitHub Releases or the site)
- [ ] `README.md` and `USER_GUIDE.md` gain a desktop section: install, sign in, tray,
      what works, what does not (`/tools` needs the Chrome extension)
- [ ] `SESSION_STATE.md` records the desktop release
- [ ] `docs/spec/flowpost-desktop-spec.md` matches what shipped

**Verification:** download from the published link in a clean browser profile, run it,
sign in; docs reviewed for accuracy by the human.

**Dependencies:** Checkpoint 3 · **Files:** `README.md`, `USER_GUIDE.md`, `SESSION_STATE.md`,
`docs/spec/flowpost-desktop-spec.md` · **Scope:** S

#### Task 10: Release checklist and rollback path

**Description:** Define what a desktop release requires and how to undo it.

**Acceptance criteria:**
- [ ] Checklist covers: version bump, build, artifact hash, download URL, changelog entry,
      support notes
- [ ] Rollback path defined (repoint the download URL to the previous build) and rehearsed
      once
- [ ] Checklist executed end-to-end for v1.0

**Verification:** a dry run produces a working release; rollback rehearsed.

**Dependencies:** Task 9 · **Files:** `desktop/RELEASE.md` · **Scope:** S

### Checkpoint 4: v1.0 released

- [ ] The build is published and downloadable
- [ ] Phase 3 acceptance criteria re-verified against the release build
- [ ] Documentation current
- [ ] Human sign-off

---

## Dependency Graph

```
Task 1 → Task 2 → Checkpoint 0 (GO/NO-GO)
  → Task 3 → Task 4 → Task 5 → Checkpoint 1
    → Task 6 → Task 7 → Checkpoint 2
      → Task 8 → Checkpoint 3
        → Task 9 → Task 10 → Checkpoint 4
```

## Parallelization Opportunities

**Safe:** Task 9 documentation can start once the release shape is fixed.
**Sequential:** 3 → 4 → 5 (web restore before guardrails measure a baseline); 6 → 7 →
(config is the input to the build); Task 8 touches four auth files at once and must be one
change, not four parallel ones.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Google refuses OAuth inside an embedded webview | **High** | Task 2 proves it first. Fallback: system-browser OAuth + `flowpost://` deep link (Task 8) |
| Platform OAuth popups blocked in webview | Medium | Task 8 moves them to a redirect flow, which also improves the web app |
| Build needs Rust + MSVC | Medium | GNU toolchain alternative; CI is deferred until an MSI is actually needed |
| Web app regresses while desktop work continues | High | Task 4 restores it, Task 5 locks the baseline; desktop work never touches web source without a browser check |
| `/tools` dead on desktop | Low | The web app already shows a clean "extension not detected" state — no special handling needed |
| Remote mode needs internet | Medium | Accepted (it is a SaaS); local-dist is deferred, not planned |
| Undocumented Facebook endpoints break the extension | Medium | Already covered by the extension beta + changelog; the extension is independent of the desktop app |

## Open Questions

1. **Distribution channel** — GitHub Releases, the Vercel site, or both?
2. **Desktop users** — internal team only, or public download? (Decides whether the MSI,
   CI and signing ever get planned.)
3. **Code signing** — an unsigned `.exe` triggers SmartScreen warnings. Is a certificate
   available when public distribution starts?
4. **Version source** — Pake's `version_name` vs the app's own version badge?

## Definition of Done (per task)

Every task clears the project-wide bar in `.opencode/references/definition-of-done.md` in
addition to its own acceptance criteria: acceptance criteria met, behaviour verified at
runtime, no regressions, tests green, lint/format clean, scoped changes only, docs
updated, security and rollback considered, human review before merge. New non-trivial
logic leaves one small test (ponytail rule).

## Related Documents

- `docs/spec/flowpost-desktop-spec.md` — desktop spec (updated in Task 3)
- `docs/intent/flowpost-desktop.md` — statement of intent (updated in Task 3)
- `tasks/archive/plan-tauri-fork.md` — superseded hand-written Tauri fork plan
- `tasks/archive/todo-tauri-fork.md` — superseded task list
- `SESSION_STATE.md` — running log of shipped work
