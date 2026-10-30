# Implementation Plan: Production Launch — Desktop-First Public Release

**Status:** awaiting owner approval
**Created:** 2026-10-31
**Scope:** GitHub Releases distribution of the Windows client, a desktop-first web landing page with a download CTA, and production-level repository presentation. The web dashboard stays reachable at `/dashboard` but is no longer promoted.
**Owner decisions (2026-10-31):** portable ZIP only (no MSI in v1); landing shows the desktop app only, dashboard unlinked; unsigned build with a documented SmartScreen note.
**Related:** `tasks/plan.md` (Flutter build plan, unaffected), `docs/runbook.md`, `docs/adr/0002-ffmpeg-bundling.md`.

---

## Overview

FlowPost Studio currently ships as two surfaces that the repository presents equally. The owner wants the desktop client to be the product: a public download on GitHub Releases, a landing page that sells and explains only the Windows app, and a repository front page that reads like a product rather than an internal build log.

The release pipeline builds the Flutter Windows app, bundles the pinned LGPL FFmpeg, produces one stable ZIP, a checksum file and the `update.json` manifest the client already understands, then publishes them on a tag. Because the asset names are stable, `releases/latest/download/...` is a permanent URL and the web page never needs a redeploy per release.

## Architecture Decisions

- **GitHub Releases is the only download host.** No Vercel-hosted binaries (limits, deploy coupling) and no R2 bucket for the installer.
- **Stable asset names:** `FlowPost-win-x64.zip`, `SHA256SUMS.txt`, `update.json`. The version lives inside `update.json` and the release tag, not in the file name, so the landing-page URL never changes.
- **Tag is the source of truth for the version.** The release workflow fails if the tag (`v1.2.3`) does not match `pubspec.yaml` (`1.2.3+build`). `pubspec.yaml` remains the version Flutter reports.
- **Updater matches what the client already parses:** `update.json` = `{ "version": "1.2.3", "downloadUrl": "https://github.com/.../releases/latest/download/FlowPost-win-x64.zip" }`. The manifest URL is baked in with `--dart-define=UPDATE_MANIFEST_URL=...`; no Dart code change.
- **Backend config is baked at build time** from repository secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the anon key already ships in the public web bundle). A fresh download works without the setup screen; `/setup` remains the fallback when a build has no baked config. If the secrets are missing the release job fails loudly instead of shipping a download that opens a setup screen.
- **Portable ZIP, unsigned.** No installer, no certificate in v1. The download page and README explain the SmartScreen "More info → Run anyway" step.
- **The landing page keeps its route and name** (`/` → `PipelineLandingPage`). Routes are not deleted: `/dashboard` and the rest stay reachable for the owner, only the marketing links go away.
- **Download links are plain anchors** to `github.com`, so the CSP in `vercel.json` needs no change and the page makes no runtime API calls (no rate limits, no CORS dependency).
- **Screenshots must be real captures** of the running Windows app. If a screen cannot be reached without live backend data, it is left out rather than mocked up.
- **Release notes come from `CHANGELOG.md`**, not auto-generated commit lists.

## Dependency Graph

```
T1 screenshots ─┐
T2 notices ─────┴─> T3 release workflow ──> T9 RC release ──> T11 final release
T4 download constants ──> T5 landing page ──> T6 meta/SEO ──> T10 visual gate
T2/T1 ──> T7 README ──> T8 repo metadata
T8/T5 ──> T11 final release ──> T12 post-release check
```

The release pipeline (T3) is independent of the web work and is the riskiest piece, so it goes first and is proven with a pre-release tag before anything goes public.

## Task List

### Phase 1 — Inputs (products, licences, constants)

- [ ] **T1 — Capture real desktop screenshots** (M)
  Run the current release build, capture Setup, Accounts, Settings and Upload (empty state) at 1440×900, redact anything personal, save optimised PNGs to `public/screenshots/`. Hero image gets a 2× capture.
  - Acceptance: images are real UI, no secrets/usernames/paths, each ≤ 400 KB, filenames stable (`setup.png`, `accounts.png`, `settings.png`, `upload.png`).
  - Verification: open each file and inspect; `npm run build` still passes with the new public assets.
  - Files: `public/screenshots/*.png`. Deps: none.

- [ ] **T2 — Third-party notices and FFmpeg redistribution check** (S)
  Add `THIRD_PARTY_NOTICES.md` covering the pinned BtbN LGPL-shared FFmpeg build (source URL, LGPLv3, written offer/source link) and confirm `third_party/ffmpeg/LICENSE.txt` ends up inside the ZIP.
  - Acceptance: notice file lists every bundled third-party component; release staging copies the FFmpeg licence; README links the notice.
  - Verification: inspect the staged ZIP contents once T3 runs; read the notice against `tool/fetch_ffmpeg.ps1` flags.
  - Files: `THIRD_PARTY_NOTICES.md`, `README.md` (link), `.github/workflows/release.yml` (copy step). Deps: none.

- [ ] **T3 — Download constants for the web** (XS)
  `src/lib/desktopRelease.ts` exporting `DESKTOP_DOWNLOAD_URL`, `RELEASES_URL`, `DESKTOP_REQUIREMENTS`; one Vitest test asserting both URLs are HTTPS GitHub release URLs with the stable asset name.
  - Acceptance: page and any future surface import the constants; no hard-coded URLs in components.
  - Verification: `npm test`.
  - Files: `src/lib/desktopRelease.ts`, `src/lib/desktopRelease.test.ts`. Deps: none.

### Checkpoint A
- [ ] Screenshots approved by the owner, notices complete, constants test green.

### Phase 2 — Release pipeline

- [ ] **T4 — Release workflow `.github/workflows/release.yml`** (M)
  Trigger on push of `v*` tags (plus `workflow_dispatch` for a dry run). Windows runner: version/tag match check → `flutter pub get` → fetch FFmpeg → `flutter analyze` + `flutter test` → `flutter build windows --release` with `--dart-define` Supabase URL/anon key and `UPDATE_MANIFEST_URL` → stage `FlowPost/` (exe, DLLs, data, `third_party/ffmpeg` + licence) → `Compress-Archive` to `FlowPost-win-x64.zip` → `SHA256SUMS.txt` → `update.json` → `gh release create` with the `CHANGELOG.md` section, uploads the three assets. Tags containing `-rc` are marked prerelease. `permissions: contents: write` on this workflow only.
  - Acceptance: workflow validates tag/version; fails when secrets are missing; assets have stable names; prerelease tags never replace `latest`; no third-party release action beyond `gh` and `subosito/flutter-action`.
  - Verification: YAML lint (actionlint if available), then T9 proves it end to end.
  - Files: `.github/workflows/release.yml`. Deps: T1, T2.

- [ ] **T5 — Versioning, changelog and release docs** (S)
  Add `CHANGELOG.md` (Keep a Changelog, `1.0.0` entry with the shipped features and known limitations: unsigned, Windows 10/11 x64, beta platforms). Rewrite the desktop release checklist in `docs/runbook.md` to the tag flow (rc tag → verify → final tag) and a rollback rule (edit the latest release / publish a fixed patch; `latest` never points at a prerelease). Add the versioning rule to `CONTRIBUTING.md`.
  - Acceptance: `.github/release.yml` not needed; changelog section is what the release workflow publishes; runbook has no manual build commands that contradict the workflow.
  - Verification: read-through; the workflow extracts the exact section T9 checks.
  - Files: `CHANGELOG.md`, `docs/runbook.md`, `CONTRIBUTING.md`. Deps: T4.

### Checkpoint B (riskiest gate)
- [ ] Pre-release `v1.0.0-rc.1` publishes: release is marked prerelease, `latest` untouched, ZIP downloads, checksum matches, `update.json` parses.

### Phase 3 — Web landing page

- [ ] **T6 — Desktop-first landing page** (M)
  Rewrite `src/pages/PipelineLandingPage.tsx` around the Windows client: nav (Features, Download, GitHub), hero with real screenshot + primary "Download for Windows" CTA (stable asset URL) and secondary "View on GitHub", "Why desktop" section (offline cache and drafts, local FFmpeg processing, tray/single instance, credentials stored locally), features limited to what the desktop app actually does (upload, AI captions, per-platform scheduling, calendar, queue, accounts, diagnostics), platforms strip, system requirements, SmartScreen note, FAQ, footer (Download, Releases, GitHub, Terms, Privacy, changelog). Remove every `/dashboard` CTA and the dashboard footer link. Apply `frontend-design` guidance and keep the existing design language (Fraunces/Plus Jakarta, plum palette, pill buttons).
  - Acceptance: no claim appears that only the web dashboard supports (Drive/Mega workflow automation, insights, workflow items); every download button points at `DESKTOP_DOWNLOAD_URL`; page works at 360 px and 1440 px; no layout shift regression on the hero.
  - Verification: `npx tsc -b`, `npm test`, `npm run build`, headless screenshots at 390×844 and 1440×900, console clean.
  - Files: `src/pages/PipelineLandingPage.tsx` (+ small components if it grows past a readable size). Deps: T1, T3.

- [ ] **T7 — Metadata, SEO and social cards for the download page** (S)
  Update `index.html` (title, description, keywords, OG/Twitter copy, `og:image` to a PNG social card), the JSON-LD block (`SoftwareApplication`, `operatingSystem: "Windows 10, Windows 11"`, `downloadUrl`), and `public/sitemap.xml` if it lists routes.
  - Acceptance: no "Web" operating system in structured data; OG image is a real PNG ≥ 1200×630; title ≤ 60 characters.
  - Verification: read the built `dist/index.html`; inspect the OG image.
  - Files: `index.html`, `public/sitemap.xml`, `public/og.png`. Deps: T6.

### Checkpoint C
- [ ] Web gates green and the page shows only the desktop product, with a working download link.

### Phase 4 — Repository presentation

- [ ] **T8 — README as a product page** (M)
  Restructure `README.md`: download button + latest-release/CI/licence/platform badges, one-line pitch, hero screenshot, "Install on Windows" (unzip, SmartScreen, first run), what it does, supported platforms and beta status, system requirements, updates, then the existing developer/backend/security/testing documentation below. Keep every command currently documented; drop nothing contributors rely on.
  - Acceptance: every link resolves (relative paths exist); badges point at the real workflows; install steps match the ZIP layout the workflow produces.
  - Verification: click every relative link locally; compare ZIP layout with T9 output.
  - Files: `README.md`. Deps: T1, T2.

- [ ] **T9 — Repository metadata and cleanup** (S)
  `gh repo edit`: description ("Automated multi-platform social scheduling for Windows — AI captions, calendar, queue, offline cache"), homepage = the Vercel URL, topics (`flutter`, `windows`, `social-media`, `scheduler`, `youtube`, `instagram`, `tiktok`, `linkedin`, `windows-desktop`). Delete the tracked stray `pipeline-preview.html` (superseded design mock) and confirm `.gitignore` already covers the local build artifacts (`FlowPost.exe`, `FlowPost.msi`, `WebView2Loader.dll`, `vs_buildtools.exe`). Prepare `docs/assets/social-preview.png` (1280×640) for the one manual upload step (GitHub has no API for social preview).
  - Acceptance: repo description/topics/homepage set; no stray tracked root files; `git status` clean after the PR.
  - Verification: `gh repo view --json description,homepageUrl,repositoryTopics`; `git ls-files` root check.
  - Files: `pipeline-preview.html` (delete), `docs/assets/social-preview.png`. Deps: T8.

### Checkpoint D
- [ ] Repository page reads as a desktop product; all docs links valid.

### Phase 5 — Ship

- [ ] **T10 — Final `v1.0.0` release** (S)
  Merge everything, tag `v1.0.0` (authored with the noreply identity), let the workflow publish a non-prerelease release, verify `releases/latest` now serves the three assets, and download the ZIP from the landing page CTA in a clean browser.
  - Acceptance: `latest` resolves to `v1.0.0`; ZIP runs on a clean Windows profile; `update.json` version equals the tag; checksum matches.
  - Verification: `gh release view v1.0.0 --json assets,isPrerelease`; `curl -L` the three URLs; run the exe.
  - Owner approval required before this task: publishing a public release and a public download is an owner-visible action.
  - Files: none (tag + release). Deps: T4–T9.

- [ ] **T11 — Record the launch** (XS)
  Append the release evidence to `tasks/todo.md`, update the project memory file, and note the remaining owner items (credential rotation, verified commit email).
  - Verification: memory index line reflects the shipped release.
  - Files: `tasks/todo.md`, memory files. Deps: T10.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| ~193 MB ZIP (app + FFmpeg) makes the release job slow or fails mid-upload | High | Build once, retry upload only; GitHub limit is 2 GB; FFmpeg stays pinned and cached. |
| FFmpeg redistribution terms | High | LGPL shared build enforced by `fetch_ffmpeg.ps1`; licence file in the ZIP; `THIRD_PARTY_NOTICES.md`. |
| Windows SmartScreen blocks the unsigned download | Med | Documented step on the page, README and release notes; signing deferred. |
| Landing copy drifts into web-only features (Drive/Mega workflows, insights) | Med | Copy restricted to the desktop capability list; review in Checkpoint C. |
| Repo secrets missing (Supabase URL/anon key) | Med | Workflow fails before build with a clear message; owner adds secrets once. |
| Screenshots cannot be captured without live backend data | Low | Capture only local screens; hero uses the best available real capture; no mockups. |
| Stable `latest` URL behaviour with prereleases | Med | rc tags always publish as prerelease; final tag verified from a clean browser. |

## Owner Actions

1. Add repository secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` (same values the web bundle already uses).
2. Upload `docs/assets/social-preview.png` in Settings → Social preview (no API exists).
3. Approve the final `v1.0.0` release (visible download).
4. Rotate the credentials exposed in git history, and verify a commit email on GitHub so plain commits stop being blocked.

## Open Questions

None — packaging, dashboard visibility and signing were decided on 2026-10-31. Launch version is `v1.0.0` because the desktop client has completed its build phases; if the owner prefers a beta label, use `v0.9.0` and switch the rc check to the final tag.
