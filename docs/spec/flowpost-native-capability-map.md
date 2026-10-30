# Capability Map: FlowPost Native (Windows, Flutter)

**Status:** Approved — Phase 0 gate passed (2026-10-26)
**Created:** 2026-10-26
**Supersedes:** `docs/spec/flowpost-desktop-spec.md` for client architecture. The Pake/remote-URL shell is replaced by a native Flutter client; the backend and feature list remain valid reference.

---

## Confirmed decisions

| Decision | Choice |
|---|---|
| Platform | Windows x64 only |
| Framework | Flutter (Dart), Material 3 |
| First release | MVP, not full parity |
| Primary goal | Self-contained UI (assets ship in the installer, no Vercel dependency) + offline-tolerant queue |
| Backend | Existing Supabase project and edge functions; no new backend service |
| Web app | Keeps shipping; the native app is a second client, not a replacement |
| Google sign-in | Required in v1 (system browser + `flowpost://` deep link) |
| Offline v1 | Cached reads + local drafts; no queued publishing |
| Project location | `desktop-flutter/` in this repository |

## Assumptions (correct before any module spec)

1. **"Self-contained" means the UI and static assets ship in the installer.** Supabase remains the source of truth. First login and OAuth still need internet.
2. **Flutter draws its own widgets.** This is not WinUI 3 native controls. If OS-native controls are a hard requirement, switch the framework before the shell spec.
3. **Windows x64 only.** No macOS, Linux, or mobile in this initiative.
4. **The existing 30 edge functions are the API.** No new backend service. Backend changes are limited to idempotency/status guards and are gated separately.
5. **Auth hand-off uses the system browser.** Google sign-in returns through a registered `flowpost://` deep link. Platform connections use the system browser; the app polls `connected_accounts` because the current callback redirects to the Vercel accounts page.
6. **The media pipeline stays split the same way.** FFmpeg does probe/transcode/audio/frame extraction locally; Groq work stays in `generate-ai-captions`.
7. **Feature behaviour follows the web app.** Same platforms, limits, statuses, and copy unless a spec says otherwise.
8. **Dual maintenance is accepted.** Every product change needs both clients.

## Capability map

| Module id | Responsibility | Depends on | MVP |
|---|---|---|---|
| `shell` | Flutter Windows bootstrap, window/tray, single instance, installer, auto-update, deep-link registration, logging | — | Yes |
| `identity` | Supabase email/password + Google login, session storage, admin security questions, `flowpost_token` session, lockout | shell | Yes |
| `accounts` | Connect/disconnect YouTube, Instagram/Facebook, TikTok, LinkedIn, Google Drive, Mega; token refresh; connection status | identity, shell | Yes |
| `media` | File/folder picker, FFmpeg probe/transcode, thumbnails, audio + frame extraction, caption calls, R2 upload with progress | identity, shell | Yes |
| `publishing` | Publish now/schedule through existing upload functions, per-platform status, retry, duplicate guard | accounts, media | Yes |
| `scheduling` | Calendar and queue views, timezone handling, scheduled status, local drafts | publishing | Yes |
| `offline` | SQLite cache, local drafts, connectivity state, sync/refresh policy | identity, media, publishing, scheduling | Yes (thin slice) |
| `workflows` | Workflow CRUD, items, automation runs | media, publishing, scheduling | No (v1.1) |
| `insights` | Quota usage and analytics | accounts, publishing | No (v1.1) |
| `admin` | User management, security settings | identity | No (v1.1) |

**Build order:** `shell` → `identity` → `accounts` → `media` → `publishing` → `scheduling` → `offline` slice → `workflows` / `insights` / `admin`.

The `offline` slice ships alongside `scheduling`: cached reads and local drafts are cheap to add while the data layer is being built, and retrofitting them later would touch every screen.

## MVP boundary

**In scope**

- Installable Windows app with bundled UI, icon, tray, and Reload.
- Email/password login. Google login via system browser + deep link.
- Connect/disconnect the six account types in `accounts`.
- Pick local media, probe/transcode with FFmpeg, generate captions, upload to R2.
- Publish now or schedule through the existing upload functions, with visible status and retry.
- Calendar and queue: read server data, create/update scheduled posts.
- Offline: open and browse cached data, compose and save local drafts; publishing requires a connection.
- Settings: account, logout, app version, update check.

**Out of scope for v1**

- Workflows, insights, admin user management.
- Bulk operations beyond select-all on the upload list.
- Pake/Electron shells, macOS/Linux, mobile.
- New product features not present in the web app.
- Offline OAuth or offline first login.

## Key risks

1. **Duplicate publishing on retry.** The upload functions do not reject a post that is already `published` (`supabase/functions/youtube-upload/index.ts:128`). An ambiguous timeout followed by a manual retry can post twice. V1 rule: refresh the post status before offering Retry, and never blind-retry. Queued publishing (auto-retry) stays out of scope until every upload function has a status/idempotency guard. Backend change, needs approval and deploy access.
2. **Google login plumbing.** Supabase redirect allowlist must include the `flowpost://` callback, and the Windows installer must register the protocol. If either is missing, login fails closed.
3. **Platform connection hand-off.** Current callbacks redirect to `https://flowpost-studio.vercel.app/accounts?...`. MVP polls `connected_accounts` and asks the user to close the browser tab; a `return_to` parameter can replace this later.
4. **Media parity.** The browser uses `<video>`, canvas, and `AudioContext` (`src/lib/captions.ts`); FFmpeg output must be validated against the same fixtures or caption quality will drift.
5. **Flutter plugin maturity on Windows.** Tray, window management, FFmpeg, and deep links need a one-week spike inside `shell` before the rest is committed.
6. **Effort.** MVP is 4–6 weeks for one experienced developer with AI assistance; full parity is 2–4 months, plus dual maintenance.
7. **Deploy access.** Supabase and Vercel deploys are currently blocked in this environment. Code can be written and tested locally; shipping backend changes waits on credentials.

## Open questions (answer before the `shell` spec)

1. **Design system?** Material 3 defaults for speed, or a port of the FlowPost look (colors, spacing, components) with a small custom theme?
2. **Installer and updates?** Inno Setup `.exe` (recommended for an unsigned v1), or MSIX? Is a code-signing certificate available?

## Approval

**Approved:** 2026-10-26. Module boundaries, dependency direction, and build order accepted. Google sign-in is required in v1; offline v1 is cached reads + local drafts; the Flutter project lives in `desktop-flutter/`.

Next gate: `docs/spec/SPEC-shell.md`.
