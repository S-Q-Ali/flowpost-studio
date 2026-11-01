# Spec: `settings` — Settings Screen (Phase 6.1)

**Module:** `settings` (see `docs/spec/flowpost-native-capability-map.md`)
**Status:** Proposed 2026-10-29 (Phase 6.1). The license (2026-10-31), the credentials (2026-10-30) and the look (2026-11-01) sections are on screen; the account rows the first draft planned for are not — the app is licensed by key.
**Depends on:** `shell` (the route and the rail entry), `license` (the grant and the session it mints), `credentials` (the backend values), `offline` (the cache wipe when a grant ends)
**Blocks:** 6.2 (the export action sits beside the log location), 6.7 (the About text)

---

## Objective

One screen where the admin holds the license, sets the backend and the look, sees the version, checks for an update, finds the log, and reads what the app is.

**User:** the FlowPost admin on Windows 10/11 x64.

**Success looks like:** Settings answers "which build is this, is there a newer one, where is the log, and is this machine licensed" in one place; deactivating removes the saved posts from the machine and keeps the drafts; a machine with no update manifest says so instead of failing.

## Scope

In:

- The license state, with activate, change and deactivate.
- The backend credentials, with a test and a clear (SPEC-credentials).
- The look: System, Light or Dark.
- The app version and a manual update check.
- The log location, with a way to open the folder.
- An About block.

Out:

- **Sign-in.** The app is licensed by key, not by an account sign-in (SPEC-license); the license section is where the machine's grant lives.
- **A profile read or a `profile` cache table.** There is no user id without a session, so a read would be dead code and a table with no writer. Both wait for identity (migration 2+).
- **Password change and security questions.** The web app has them (`src/pages/ProfilePage.tsx:284-373`); they need the identity module and a Supabase auth write, and v1 does not extend them to the desktop.
- **Language and notification preferences.** The web app's Preferences tab is a placeholder (`ProfilePage.tsx:376-388`); copying a placeholder is not work.
- **Log export and diagnostics.** 6.2 owns the export; this screen only reveals the folder.

## The screen

`/settings` replaces the placeholder (`desktop-flutter/lib/core/router/app_router.dart:62`). The rail entry already exists (`core/shell/app_shell.dart:18`). Sections in this order, one scroll:

| Section | Shows | Actions |
|---|---|---|
| License | the grant and its expiry, or why there is none | **Activate license** / **Change license** (the license screen); **Deactivate this PC** |
| Credentials | which values are live and the reason | **Save**, **Test connection**, **Clear** |
| Appearance | the look in use | **System** / **Light** / **Dark** |
| Updates | the version, the check's answer | **Check for updates**; **Download** when there is one |
| Diagnostics | the log file's folder, the local files, what could not be opened | **Open folder**; **Save diagnostics**; **Salvage drafts** when the file will not open |
| About | the app name, the version, one line on what it is | none |

## States

- **License.** No grant: "No active license." with **Activate license**. An active one: the expiry date, `· offline` when it was read from the machine rather than confirmed by the server. An expired one names what to do. **Deactivate this PC** is behind a confirmation that names the trade: "Deactivating removes the license from this machine. Your drafts are kept." A grant that cannot be removed still ends the session and wipes the cache; the failure says so.
- **Credentials** is the shared form (SPEC-credentials): the live values, a line on where they came from, and a service-role key refused before anything is written. A backend change deactivates the grant and wipes `cache.db`, because a post from the old backend must not look like one from the new one.
- **Appearance.** One `SegmentedButton`, the mode in use selected. **System** follows the Windows setting through `MaterialApp.themeMode`. The pick applies on the same frame — no restart — and is written to `preferences.json` first: a look the file refused keeps what is on screen and says "The look could not be saved on this machine." rather than showing a look that will be gone after a restart. Startup reads the file before the first frame, so the saved look is the one shown.
- **Updates.** No manifest URL configured: the button is off and the section says the build has no update source, rather than showing a failure that looks like a network fault. Configured: **Check for updates** → a spinner → "You're up to date (1.2.3)" or "Version 1.3.0 is available" with **Download** (system browser) or "Update check failed." with the button back on. The download URL must be https (`core/update/update_checker.dart` already enforces it).
- **Diagnostics.** The folder is the app's own `logs` folder under the support directory (`core/logging/app_logger.dart`). **Open folder** reveals it in Explorer. If the folder cannot be resolved, the section says the log is not available yet and shows no path.
- **About.** "FlowPost Studio", the version, and one line: the desktop companion to the FlowPost dashboard.

## Decisions (need the owner's yes)

| # | Decision |
|---|---|
| 1 | No sign-in UI: the machine holds a license key (SPEC-license) and this screen is where it lives. |
| 2 | The grant's session is the only session the app has. No `users` read and no `profile` table. |
| 3 | Deactivating clears the session and wipes `cache.db`, and keeps `drafts.db` (SPEC-offline Decision 8), after a confirmation that says so. Changing or clearing the backend does the same, because the grant belongs to the backend that minted it. |
| 4 | The version comes from `package_info_plus` through one provider the Home screen and Settings share, so the two cannot disagree. |
| 5 | The update check is manual, uses `UPDATE_MANIFEST_URL`, and an unset URL disables the button with a reason instead of reporting a failure. |
| 6 | The log section reveals the app's own logs folder only — never a media path — and 6.2 adds the export beside it. |
| 7 | The Home screen keeps its automatic check on open; Settings is where the admin asks on demand. Both use the same manifest URL and version. |
| 8 | The look is kept in `preferences.json`, written atomically and before it reaches the screen, and read before the first frame — a saved dark look must not flash the light one on start. |
| 9 | `System` is passed to `MaterialApp.themeMode` unresolved, so a Windows change while the app is open is followed without a poll. |

## Tests

- Unit: the version provider answers the platform's version and falls back without throwing when the channel is unavailable; the update states (unset URL, up to date, available, failed) with a fake manifest fetch; deactivating clears the session, wipes the cache and leaves the drafts (fake cache and fake drafts repository, including a wipe that throws); the preferences file round-trips, replaces rather than merges, and answers `null` for a file it cannot read (theme store test).
- Widget: the six sections render in order; each license state and the confirmation sentence with its two outcomes; the three looks offered with the current one picked, a pick kept and shown on the same frame, and a refused write named while the screen stays as it was; the update button off with no manifest URL and its three answers with one; the log folder shown and **Open folder** calling the seam; About shows the version.
- Contrast: every text and non-text token of both themes measured against the surface it sits on (`test/core/theme/contrast_test.dart`), so a palette edit that drops a colour below WCAG 2.1 fails here rather than on a screen.
- Manual: the installed build opens Settings from the rail; the version matches the installer; Open folder opens Explorer at `logs\app.log`; each screen is read in both looks at 200% text.

## Verification

`dart format --set-exit-if-changed lib test integration_test` clean, `flutter analyze lib test` no issues, `flutter test` green, `flutter build windows --release` succeeds.

## Open questions

None. The three that mattered — the app is licensed by key with no sign-in, ending a grant wipes the cache and keeps the drafts, and the update check is manual — are decisions 1, 3 and 5.
