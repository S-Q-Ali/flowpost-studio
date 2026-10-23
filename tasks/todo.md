# Todo List: FlowPost Desktop Application (Windows, Pake-based)

**Plan:** `tasks/plan.md` · **Mode:** Remote-URL packaging, Windows x64, portable `.exe`  
**Status:** Phase 0 next — de-risk spike before any build work  
**Revised 2026-10-23:** skills-based planning (planning-and-task-breakdown + spec-driven-development + shipping-and-launch)  
**Source:** docs/spec/flowpost-desktop-spec.md + docs/intent/flowpost-desktop.md

---

## Phase 0: De-risk spike (no repo changes)

- [ ] **Task 1:** Verify toolchain, install Pake CLI
  - [ ] `node -v` ≥ 20.9, `rustc -V` ≥ 1.85
  - [ ] `npm install -g pake-cli` → `pake --version` works
  - [ ] Windows toolchain (MSVC vs GNU) documented in `desktop/README.md`

- [ ] **Task 2:** Build spike app against production, run OAuth matrix
  - [ ] Spike `.exe` launches FlowPost login page
  - [ ] Google sign-in completes **inside app window** → `/dashboard`
  - [ ] Session survives close/relaunch
  - [ ] Facebook OAuth popup opens, completes, notifies opener
  - [ ] "Upload from Computer" opens native picker; upload succeeds
  - [ ] All outcomes recorded in `desktop/spike-results.md`

- [ ] **Checkpoint 0: GO / NO-GO**
  - [ ] Written decision: packaging mode + OAuth strategy
  - [ ] Human approved before Phase 1

---

## Phase 1: Repository hygiene + web restore

- [ ] **Task 3:** Archive Tauri fork + revise spec/intent
  - [ ] `feature/desktop-tauri-fork` branch holds `src-tauri/`, `src/preload.ts`, commits `b37cb82`/`aff56d4`/`22b61b6`
  - [ ] `tasks/archive/plan-tauri-fork.md` + `tasks/archive/todo-tauri-fork.md` kept with "superseded" headers
  - [ ] `docs/spec/flowpost-desktop-spec.md` rewritten for Pake architecture
  - [ ] `docs/intent/flowpost-desktop.md` updated (wrapper = auto-updating shell; extension-only features out of parity)
  - [ ] Note recorded: why Pake replaced Tauri fork

- [ ] **Task 4:** Restore web app to clean, building, styled state
  - [ ] `UploadPage.tsx`, `AccountsPage.tsx`, `main.tsx`, `postcss.config.js`, `package.json`, `vite.config.ts`, `package-lock.json` restored to `41f4c73`
  - [ ] `npx vite build` exit 0; CSS > 50 KB with `.flex` + `.rounded-lg`
  - [ ] `npx vitest run` → 92/92 pass
  - [ ] `/upload` and `/accounts` render with no console errors / `ReferenceError`
  - [ ] Deployable to Vercel as-is

- [ ] **Task 5:** Add repository guardrails
  - [ ] `.gitignore`: `FlowPost-Portable*/`, `dist-tauri-portable/`, `skills/`, `desktop/dist/`, `desktop/*.exe`
  - [ ] `package.json` script `"typecheck": "tsc -p tsconfig.app.json --noEmit"`
  - [ ] Typecheck baseline (~126) recorded in `desktop/README.md`
  - [ ] `desktop/README.md`: one-command local build

- [ ] **Checkpoint 1: Web healthy, repo clean**
  - [ ] `npm run build` exit 0 with full Tailwind CSS
  - [ ] `npm run test` green; `npm run typecheck` at baseline
  - [ ] Fresh clone of `main` builds
  - [ ] `main` pushed; `origin/main` current

---

## Phase 2: Packaging

- [ ] **Task 6:** Desktop config as code
  - [ ] `desktop/pake.config.json` validates against Pake schema
  - [ ] Pins name/identifier/window/min-size/tray/`--hide-on-close`/`--enable-drag-drop`/`--enable-find`/`--password-autosave`/`--download-dir`
  - [ ] `desktop/inject/flowpost.js` + `desktop/inject/flowpost.css` created and documented
  - [ ] `desktop/build.ps1` runs Pake with `--config` and `--json`

- [ ] **Task 7:** Produce and verify portable `.exe`
  - [ ] `pake --config desktop/pake.config.json --keep-binary` → `FlowPost.exe`
  - [ ] Runs from any folder on clean Windows 10/11
  - [ ] Tray icon, close-to-tray, clean quit
  - [ ] Phase 0 OAuth matrix passes against this build

- [ ] **Checkpoint 2: Reproducible build**
  - [ ] Build from committed config, not local flags
  - [ ] Clean-machine run passes OAuth matrix
  - [ ] Human approved look and feel

---

## Phase 3: Auth in the webview

- [ ] **Task 8:** Google + platform OAuth + session persistence
  - [ ] Google sign-in completes inside app → `/dashboard`
  - [ ] Supabase redirect allow-list has every landing URL (hosted callback + custom scheme if needed)
  - [ ] No `window.open` in OAuth connect path; all six platforms round-trip without manual reload
  - [ ] Popup-blocked / provider-error paths show actionable messages
  - [ ] Sign in → quit → relaunch → still signed in; expired token refreshes without 429; logout clears session
  - [ ] Browser flow no regressions
  - [ ] `npm run build`, `npm run test`, `npm run typecheck` green

- [ ] **Checkpoint 3: Auth complete in packaged app**
  - [ ] Google + 5 platforms + Drive all connect inside app
  - [ ] Sessions persist; logout works
  - [ ] Browser flow no regressions

---

## Phase 4: Desktop UX parity

- [ ] **Task 10:** Global keyboard shortcuts
  - [ ] Ctrl+S → save / prevent browser save
  - [ ] Ctrl+P → schedule dialog opens
  - [ ] Esc → closes top-most dialog
  - [ ] Injected script inert in normal browser tab

- [ ] **Task 11:** Native notifications for post status
  - [ ] Permission requested once, choice remembered
  - [ ] Published / failed post → native toast within seconds
  - [ ] Focus Assist suppresses toasts
  - [ ] One toast per status transition

- [ ] **Task 12:** File upload, drag-and-drop, download directory
  - [ ] Native Windows file picker from "Upload from Computer"
  - [ ] Drag `.mp4`/`.mov`/`.jpg`/`.png` onto upload area → import starts
  - [ ] Downloads land in configured FlowPost directory
  - [ ] >200 MB rejected with clear message

- [ ] **Task 13:** Window lifecycle, find-in-page, dark mode, min sizes
  - [ ] Resizable down to 1024×700 without layout breakage
  - [ ] Ctrl+F find; Ctrl +/- / 0 zoom
  - [ ] Dark mode follows system theme
  - [ ] Close hides to tray; quit from tray leaves no orphan process

- [ ] **Task 14:** Hide extension-only features on desktop
  - [ ] `/tools` + sidebar entry hidden in desktop build
  - [ ] No layout gap or broken route
  - [ ] `/tools` still present in browser build

- [ ] **Checkpoint 4: Feature parity in packaged app**
  - [ ] All 16 web surfaces (17 minus extension-only `/tools`) reachable and functional
  - [ ] Shortcuts / notifications / upload / drag-drop / tray / zoom / dark mode verified
  - [ ] `npm run build`, `npm run test`, `npm run typecheck` green
  - [ ] Human walkthrough of full flow

---

## Phase 5: Distribution

- [ ] **Task 15:** Version check + download prompt
  - [ ] `desktop-version.json` hosted (version + URL + notes), cache-controlled
  - [ ] Check on launch, at most once per 24 h
  - [ ] Non-blocking banner when newer version exists
  - [ ] No prompt when current; unreachable file never blocks start

- [ ] **Task 16:** Host installer + documentation
  - [ ] `.msi` downloadable from site / release page
  - [ ] `README.md` + `USER_GUIDE.md` desktop section (install, sign-in, tray, shortcuts, known limits)
  - [ ] `SESSION_STATE.md` records desktop release
  - [ ] `docs/spec/flowpost-desktop-spec.md` matches shipped

- [ ] **Task 17:** Release checklist + rollback path
  - [ ] Checklist: version bump → build → hash → download URL → changelog → support notes
  - [ ] Rollback defined (repoint URL to previous build) and rehearsed once
  - [ ] Dry run produces working release

- [ ] **Checkpoint 5: v1.0 released**
  - [ ] Installer published and downloadable
  - [ ] Phase 3–4 criteria re-verified against release build
  - [ ] Documentation current
  - [ ] Human sign-off

---

## Deferred (trigger decides — not planned)

| Item | Trigger |
|------|---------|
| MSI installer + CI release pipeline | Non-technical user needs to install |
| Wrapper auto-update / version banner | Users running stale builds |
| Ctrl+S / Ctrl+P shortcuts, native toasts | Testers ask (Pake has `--activation-shortcut`) |
| Local-dist packaging (`pake ./dist`), offline mode | Offline required, or Phase 0 forces it |
| macOS/Linux builds | Windows v1 stable |
| Native (extension-free) `/tools` for desktop | Monetization checks needed on desktop |

---

## Open decisions (before Phase 2)

- [ ] Distribution channel: GitHub Releases, Vercel site, or both?
- [ ] Audience: internal team only or public download?
- [ ] Code-signing certificate available for public distribution?
- [ ] Version source: Pake's `version_name` vs app's own version badge?
