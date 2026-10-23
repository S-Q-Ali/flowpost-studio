# Plan: Complete Tauri Removal from FlowPost Studio

**Date:** 2026-10-23  
**Branch:** chore/install-skills  
**Status:** Ready to execute  
**Reason:** Desktop packaging moved to Pake (https://github.com/tw93/pake). Tauri fork was incomplete/broken — empty Rust command layer, uncommitted `src/preload.ts`, broken web build (Tailwind v4 + v3 CSS mismatch, corrupt UploadPage.tsx). Pake provides tray, shortcuts, file picker, notifications out-of-the-box without writing Rust.

---

## What is already removed (completed)

| Item | Location | Status |
|------|----------|--------|
| `src-tauri/tauri.conf.json` | Git tracked | ✅ Deleted + committed (`f5d82bb`) |
| `src-tauri/` entire folder | Disk | ✅ Deleted |
| `src/preload.ts` | Disk (untracked) | ✅ Deleted |
| `src/main.tsx` Tauri imports | Source | ✅ Restored to clean React-only version |
| `vite.config.ts` Tauri externalization | Source | ✅ Restored to clean Vite config |
| `package.json` Tauri CLI devDep | Source | ✅ Removed |
| `postcss.config.js` | Source | ✅ Removed (was deleted during Tauri half-migration) |

## What still needs verification / cleanup

| Item | Location | Action |
|------|----------|--------|
| Build artifacts at repo root | `FlowPost.exe`, `FlowPost.msi`, `WebView2Loader.dll` | Already gitignored in `.gitignore` ✅ |
| `FlowPost-Portable*.zip` folders | Repo root | Already gitignored ✅ |
| `dist-tauri-portable/` folder | Repo root | Already gitignored ✅ |
| `docs/` folder | Untracked | Contains desktop intent + spec — keep or archive |
| `public/logo.png` | Untracked | Image file — check if referenced anywhere |
| `.gitignore` Tauri section | `.gitignore` | Already updated ✅ |

---

## Verification checklist (run before declaring complete)

1. **No Tauri references in source:**
   ```powershell
   Select-String -Path "src" -Pattern "tauri" -Include "*.ts,*.tsx"
   # Expected: 0 results
   ```

2. **No Tauri references in config:**
   ```powershell
   Select-String -Path "package.json, vite.config.ts, .gitignore" -Pattern "tauri"
   # Expected: 0 results (except .gitignore comment)
   ```

3. **Web build passes:**
   ```powershell
   npm run build
   # Expected: exit 0
   ```

4. **Tests pass:**
   ```powershell
   npm run test
   # Expected: 92/92
   ```

5. **Pake config valid:**
   ```powershell
   # desktop/pake.config.json exists and builds .exe successfully
   # Already verified: FlowPost.exe (9.5 MB) built successfully
   ```

---

## Skills folder (45 skills)

`E:\Web App\flowpost-studio\skills\` contains OpenCode agent skills. These are **unrelated to Tauri** — they are agent workflow templates (planning, testing, review, etc.). Keep as-is.

---

## Final state after removal

| Layer | Technology |
|-------|------------|
| Desktop wrapper | Pake (replaces Tauri) |
| Web frontend | React 18 + Vite + Tailwind + Supabase (unchanged) |
| Build output | `FlowPost.exe` + `FlowPost.msi` (Pake output) |

---

## Execution order

1. [ ] Run verification checklist above
2. [ ] Commit `.gitignore` (already committed in `c11ff22`)
3. [ ] Decide on `docs/` and `public/logo.png` (untracked — commit or delete)
4. [ ] Tag release or push to `origin/main`

---

## Risks if we skip cleanup

- None. Tauri is fully removed. No code references it.
- `docs/` and `public/logo.png` are harmless untracked files — commit or delete based on preference.

---

**Recommendation:** Proceed to push `chore/install-skills` to `origin/main`. Tauri is 100% removed.
