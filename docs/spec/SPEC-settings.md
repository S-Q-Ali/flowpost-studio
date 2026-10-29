# Spec: `settings` — Settings Screen (Phase 6.1)

**Module:** `settings` (see `docs/spec/flowpost-native-capability-map.md`)
**Status:** Proposed 2026-10-29 (Phase 6.1); awaiting the owner's approval
**Depends on:** `shell` (the route and the rail entry), `identity` (the session — deferred by the owner), `offline` (the cache wipe on sign-out)
**Blocks:** 6.2 (the export action sits beside the log location), 6.7 (the About text)

---

## Objective

One screen where the admin sees the account state, signs out when there is a session, sees the version, checks for an update, finds the log, and reads what the app is.

**User:** the FlowPost admin on Windows 10/11 x64.

**Success looks like:** Settings answers "which build is this, is there a newer one, where is the log, and who is signed in" in one place; a sign-out removes the saved posts from the machine and keeps the drafts; a machine with no update manifest says so instead of failing.

## Scope

In:

- The account state, and a sign-out when there is a session.
- The app version and a manual update check.
- The log location, with a way to open the folder.
- An About block.

Out:

- **Sign-in.** The owner's rule of 2026-10-29 keeps the app unguarded until the production gate; the identity module (SPEC-identity) lands when the app is production-ready, and this screen is where its session is read.
- **A profile read or a `profile` cache table.** There is no user id without a session, so a read would be dead code and a table with no writer. Both wait for identity (migration 2+).
- **Password change and security questions.** The web app has them (`src/pages/ProfilePage.tsx:284-373`); they need the identity module and a Supabase auth write, and v1 does not extend them to the desktop.
- **Theme, language and notification preferences.** The web app's Preferences tab is a placeholder (`ProfilePage.tsx:376-388`); copying a placeholder is not work.
- **Log export and diagnostics.** 6.2 owns the export; this screen only reveals the folder.

## The screen

`/settings` replaces the placeholder (`desktop-flutter/lib/core/router/app_router.dart:62`). The rail entry already exists (`core/shell/app_shell.dart:18`). Sections in this order, one scroll:

| Section | Shows | Actions |
|---|---|---|
| Account | the signed-in name and email, or "Not signed in" | none when signed out |
| Session | what a sign-out removes and keeps | **Sign out** (only with a session) |
| Updates | the version, the check's answer | **Check for updates**; **Download** when there is one |
| Diagnostics | the log file's folder | **Open folder** |
| About | the app name, the version, one line on what it is | none |

## States

- **Account.** No session: "Not signed in", with "Sign-in arrives with the production build." — not an error, and no button that leads nowhere. With a session: the row's name and email once identity lands; this phase has no session, so the signed-out state is the one on screen.
- **Sign out** is behind a confirmation that names the trade: "Signing out removes the saved posts from this machine. Your drafts are kept." A cache that cannot be wiped does not keep the admin signed in: the session still clears, and the failure is logged by type only.
- **Updates.** No manifest URL configured: the button is off and the section says the build has no update source, rather than showing a failure that looks like a network fault. Configured: **Check for updates** → a spinner → "You're up to date (1.2.3)" or "Version 1.3.0 is available" with **Download** (system browser) or "Update check failed." with the button back on. The download URL must be https (`core/update/update_checker.dart` already enforces it).
- **Diagnostics.** The folder is the app's own `logs` folder under the support directory (`core/logging/app_logger.dart`). **Open folder** reveals it in Explorer. If the folder cannot be resolved, the section says the log is not available yet and shows no path.
- **About.** "FlowPost Studio", the version, and one line: the desktop companion to the FlowPost dashboard.

## Decisions (need the owner's yes)

| # | Decision |
|---|---|
| 1 | No sign-in UI in this phase; the account section shows the signed-out state, and the app stays unguarded until the production gate. |
| 2 | The account read lands with the identity module. This screen holds its place; no `users` read and no `profile` table now. |
| 3 | Sign out appears only when a session exists; it clears the session and wipes `cache.db`, and keeps `drafts.db` (SPEC-offline Decision 8), after a confirmation that says so. |
| 4 | The version comes from `package_info_plus` through one provider the Home screen and Settings share, so the two cannot disagree. |
| 5 | The update check is manual, uses `UPDATE_MANIFEST_URL`, and an unset URL disables the button with a reason instead of reporting a failure. |
| 6 | The log section reveals the app's own logs folder only — never a media path — and 6.2 adds the export beside it. |
| 7 | The Home screen keeps its automatic check on open; Settings is where the admin asks on demand. Both use the same manifest URL and version. |

## Tests

- Unit: the version provider answers the platform's version and falls back without throwing when the channel is unavailable; the update states (unset URL, up to date, available, failed) with a fake manifest fetch; the sign-out effect clears the session, wipes the cache and leaves the drafts (fake cache and fake drafts repository, including a wipe that throws).
- Widget: the five sections render in order; "Not signed in" with no session; Sign out absent without a session and present with one (an overridden session provider); the confirmation sentence and the outcome; the update button off with no manifest URL and its three answers with one; the log folder shown and **Open folder** calling the seam; About shows the version.
- Manual: the installed build opens Settings from the rail; the version matches the installer; Open folder opens Explorer at `logs\app.log`.

## Verification

`dart format --set-exit-if-changed lib test integration_test` clean, `flutter analyze lib test` no issues, `flutter test` green, `flutter build windows --release` succeeds.

## Open questions

None. The three that mattered — sign-in stays out, the cache is wiped on sign-out and the drafts are kept, and the update check is manual — are decisions 1, 3 and 5.
