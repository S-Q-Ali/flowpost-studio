# Todo List: FlowPost Desktop Application (Windows, Pake-based)

**Plan:** `tasks/plan.md` · **Mode:** Remote-URL packaging, Windows x64, portable `.exe`
**Status:** Phase 0 next — de-risk spike before any build work
**Revised 2026-10-22:** ponytail ladder applied — 20 tasks → 10, six items deferred

---

## Phase 0: De-risk spike (no repo changes)

- [ ] **Task 1:** Verify toolchain, install Pake CLI
  - [ ] `node -v` ≥ 20.9, `rustc -V` ≥ 1.85
  - [ ] `npm install -g pake-cli` → `pake --version` works
  - [ ] Windows toolchain (MSVC vs GNU) written down in `desktop/README.md`

- [ ] **Task 2:** Build a spike app against production, run the OAuth matrix
  - [ ] Spike `.exe` launches the FlowPost login page
  - [ ] Google sign-in completes **inside the app window** → `/dashboard`
  - [ ] Session survives close/relaunch
  - [ ] Facebook OAuth popup opens, completes, notifies the opener
  - [ ] "Upload from Computer" opens the native picker; upload succeeds
  - [ ] Every outcome recorded in `desktop/spike-results.md`

- [ ] **Checkpoint 0: GO / NO-GO**
  - [ ] Written decision: packaging mode + OAuth strategy
  - [ ] Human approved before Phase 1

---

## Phase 1: Repository hygiene + web restore

- [ ] **Task 3:** Archive the Tauri fork + revise spec/intent
  - [ ] `feature/desktop-tauri-fork` holds `src-tauri/`, `src/preload.ts`, commits `b37cb82`/`aff56d4`/`22b61b6`
  - [ ] `tasks/archive/plan-tauri-fork.md` + `tasks/archive/todo-tauri-fork.md` kept with "superseded" headers
  - [ ] `docs/spec/flowpost-desktop-spec.md` rewritten for the Pake architecture
  - [ ] `docs/intent/flowpost-desktop.md` updated (wrapper = auto-updating shell; extension-only features out of parity scope)
  - [ ] Note recorded: why Pake replaced the hand-written fork

- [ ] **Task 4:** Restore the web app to a clean, building, styled state
  - [ ] `UploadPage.tsx`, `AccountsPage.tsx`, `main.tsx`, `postcss.config.js`, `package.json`, `vite.config.ts`, `package-lock.json` restored to `41f4c73`
  - [ ] `npx vite build` exit 0; CSS > 50 KB with `.flex` + `.rounded-lg`
  - [ ] `npx vitest run` green
  - [ ] `/upload` and `/accounts` render with no console errors / `ReferenceError`
  - [ ] Deployable to Vercel as-is

- [ ] **Task 5:** Add repository guardrails
  - [ ] `.gitignore`: `FlowPost-Portable*/`, `dist-tauri-portable/`, `skills/`, `desktop/dist/`, `desktop/*.exe`
  - [ ] `package.json` script `"typecheck": "tsc -p tsconfig.app.json --noEmit"`
  - [ ] Typecheck baseline (≈126) recorded in `desktop/README.md`
  - [ ] `desktop/README.md`: one-command local build

- [ ] **Checkpoint 1: Web healthy, repo clean**
  - [ ] `npm run build` exit 0 with full Tailwind CSS
  - [ ] `npm run test` green; `npm run typecheck` at baseline
  - [ ] Fresh clone of `main` builds
  - [ ] `main` pushed; `origin/main` current

---

## Phase 2: Packaging

- [ ] **Task 6:** Desktop config as code
  - [ ] `desktop/pake.config.json` validates against Pake's schema
  - [ ] Pins name/identifier/window/min-size/tray/`--hide-on-close`/`--enable-drag-drop`/`--enable-find`/`--password-autosave`/`--download-dir`
  - [ ] `desktop/inject/flowpost.js` + `desktop/inject/flowpost.css` created and documented
  - [ ] `desktop/build.ps1` runs Pake with `--config` and `--json`

- [ ] **Task 7:** Produce and verify the portable `.exe`
  - [ ] `pake --config desktop/pake.config.json --keep-binary` → `FlowPost.exe`
  - [ ] Runs from any folder on a clean Windows 10/11 machine
  - [ ] Tray icon, close-to-tray, clean quit
  - [ ] Phase 0 OAuth matrix passes against this build

- [ ] **Checkpoint 2: Reproducible build**
  - [ ] Build comes from the committed config, not local flags
  - [ ] Clean-machine run passes the OAuth matrix
  - [ ] Human approved the look and feel

---

## Phase 3: Auth in the webview

- [ ] **Task 8:** Google + platform OAuth + session persistence
  - [ ] Google sign-in completes inside the app → `/dashboard`
  - [ ] Supabase redirect allow-list has every landing URL (hosted callback + custom scheme if needed)
  - [ ] No `window.open` left in the OAuth connect path; all six providers round-trip without a manual reload
  - [ ] Popup-blocked / provider-error paths show actionable messages
  - [ ] Sign in → quit → relaunch → still signed in; expired token refreshes without 429; logout clears the session
  - [ ] Browser flow has no regressions
  - [ ] `npm run build`, `npm run test`, `npm run typecheck` green

- [ ] **Checkpoint 3: Auth complete in the packaged app**
  - [ ] Google + 5 platforms + Drive all connect inside the app
  - [ ] Sessions persist; logout works
  - [ ] Browser flow has no regressions

---

## Phase 4: Distribution

- [ ] **Task 9:** Publish the build + write the desktop docs
  - [ ] `.exe` downloadable (channel open — GitHub Releases or the site)
  - [ ] `README.md` + `USER_GUIDE.md` desktop section (install, sign in, tray, what works, `/tools` needs the Chrome extension)
  - [ ] `SESSION_STATE.md` records the desktop release
  - [ ] `docs/spec/flowpost-desktop-spec.md` matches what shipped

- [ ] **Task 10:** Release checklist + rollback path
  - [ ] Checklist: version bump → build → hash → download URL → changelog → support notes
  - [ ] Rollback defined (repoint the URL to the previous build) and rehearsed once
  - [ ] Dry run produces a working release

- [ ] **Checkpoint 4: v1.0 released**
  - [ ] Build published and downloadable
  - [ ] Phase 3 criteria re-verified against the release build
  - [ ] Documentation current
  - [ ] Human sign-off

---

## Deferred (trigger decides — not planned)

| Item | Trigger |
|---|---|
| MSI installer + CI release pipeline | A non-technical user needs to install it |
| Wrapper auto-update / version banner | Users start running stale builds |
| Ctrl+S / Ctrl+P shortcuts, native toasts | Testers ask (Pake has `--activation-shortcut` for app-level) |
| Local-dist packaging (`pake ./dist`), offline mode | Offline becomes a requirement, or Phase 0 forces it |
| macOS / Linux builds | Windows v1 is stable |
| Native (extension-free) `/tools` for desktop | Monetization checks are needed on desktop |

---

## Open decisions (answer before Phase 2)

- [ ] Distribution channel: GitHub Releases, the Vercel site, or both?
- [ ] Audience: internal team only or public download?
- [ ] Code-signing certificate available when public distribution starts?
- [ ] Version source: Pake's `version_name` vs the app's own version badge?
