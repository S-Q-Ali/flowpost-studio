# Spec: `diagnostics` — Failures, Evidence and Salvage (Phase 6.2)

**Module:** `diagnostics` (see `docs/spec/flowpost-native-capability-map.md`)
**Status:** Proposed 2026-10-29 (Phase 6.2); awaiting the owner's approval
**Depends on:** `shell` (the bootstrap sequence and the window), `settings` (the Diagnostics section and the log folder), `offline` (the cache and drafts files, SPEC-offline Decisions 3 and 8)
**Blocks:** 6.7 (the runbook quotes the evidence file and the salvage step), 6.8 (the gate reads these rules)

---

## Objective

When something breaks on the admin's machine, the app keeps running where it can, says what happened in words the admin can act on, and can hand back one file of evidence that carries no token, no caption and no file path.

**User:** the FlowPost admin on Windows 10/11 x64, and the person they send the evidence file to.

**Success looks like:** a screen that throws shows a calm message and the rest of the window still works; the admin can save a diagnostics file to any folder and send it; a drafts file that will not open is reported with one honest choice instead of silently disappearing; a start that fails before the window opens leaves a message, not a silent process.

## Scope

In:

- A calm in-window surface for a widget that throws, in place of Flutter's red error box.
- A message for a start that fails before the window opens.
- The **Save diagnostics** action in Settings, and the evidence file it writes.
- The local-data state in Settings: the cache, the drafts and any renamed-broken files.
- The drafts salvage: keep the broken file and start fresh.

Out:

- **A dedicated diagnostics page.** Settings already has the Diagnostics section (SPEC-settings); the export and the file list belong beside the log folder, not on a second screen.
- **Uploading evidence anywhere.** The file leaves the machine only when the admin sends it. No telemetry, no automatic report, nothing over the network.
- **A log viewer in the app.** Explorer and the file are enough; rendering the log inside the app would duplicate what the log folder already does.
- **Draft editing in the salvage view.** The salvage choice is keep-and-start-fresh or nothing. Copying drafts out stays the admin's own action with the renamed file.
- **Multi-file archives.** No zip, no new dependency (Decision 1).

## What the admin sees

Settings, Diagnostics section, in this order:

| Row | Shows | Actions |
|---|---|---|
| Log folder | the folder, as today | **Open folder** (as today) |
| Saved diagnostics | the last export's name and time, or nothing yet | **Save diagnostics…** |
| Local data | `cache.db` and `drafts.db` with size and state; the renamed-broken files, newest first | **Keep the old draft file and start fresh** (only when the drafts cannot be opened) |

The section is one card like the others on the screen (SPEC-settings "The screen").

## The evidence file

One plain-text file, `flowpost-diagnostics-20261029-1430.txt`, written into the folder the admin picks. Contents, in this order:

```
FlowPost Studio diagnostics
Generated 2026-10-29T14:30:12Z

App       1.0.0 (1), Windows 10.0.26300, en-US
Clock     UTC+05:00, Asia/Karachi
Session   signed in
Files     cache.db       412 KB  written 2026-10-29T14:12Z  ok
          drafts.db       16 KB  written 2026-10-29T13:58Z  cannot be opened
          logs           app.log 412 KB, app.log.1 1.0 MB
Broken    cache.corrupt-20261029-1432.db  2026-10-29T14:32Z  412 KB

--- app.log (last 200 lines) ---
2026-10-29T14:12:03.114 SEVERE flowpost.http: A read failed
...

This file holds no tokens, no captions and no file paths.
```

- **Bounded.** The log tail is the last 200 lines of `app.log` and `app.log.1`, not the whole file, so the export stays small whatever the log has grown to.
- **Sanitized twice.** Every line is re-run through `redactSecrets` and `maskPaths` (`core/logging/app_logger.dart`) at export time, on top of the redaction the logger already did at write time. A line that reaches the file through another path (a SQLite error, a Windows exception string) cannot carry a secret or a path to the screen or the folder.
- **No content.** Nothing from a caption, a title, a URL or a media file enters the file; the row counts and byte sizes are the only facts about them.
- **Written once.** The file is written as `.tmp` and renamed into place, so a failed export leaves no half file. The export says where it went, or why it could not.

## States

- **A widget that throws while building** logs the error with its stack, and that subtree is replaced by a calm panel: "This part of the screen could not be shown. The rest of the app still works." The rail and every other screen keep working. In a debug build Flutter's own error box stays, because a developer needs the stack on screen.
- **A start that fails before the window opens** (after logging is up) shows a Windows message box: "FlowPost could not start. The log is in <log folder>." and exits with code 1. Today that path writes to stderr, which a packaged app does not show. An invalid configuration keeps its existing screen (`ConfigErrorApp`), which is a start the window can explain.
- **The drafts cannot be opened.** The Publish screen behaves as it does today (no draft to restore). Settings → Diagnostics names the file, and offers the one action: **Keep the old draft file and start fresh** renames `drafts.db` to `drafts.corrupt-<stamp>.db` and creates a new file. A confirmation names what the admin keeps (the old file) and what they lose (the drafts in it are not restored). Nothing is deleted.
- **A cache that cannot be opened** already renames itself and carries on (SPEC-offline); it appears under Local data as a `cache.corrupt-*` row.
- **The log folder cannot be resolved.** The rows that need it say "not available yet" (SPEC-settings), and the export still writes the app, clock, session and files blocks without the log tail, saying the log could not be read.

## Decisions (need the owner's yes)

| # | Decision |
|---|---|
| 1 | The export is one plain-text file written into a folder the admin picks with the system folder dialog (`file_selector`). No zip, no new dependency. |
| 2 | The file is built from a pure snapshot of facts and sanitized again at export (`redactSecrets`, `maskPaths`); it says in its own text that it holds no tokens, captions or paths. |
| 3 | The export writes `.tmp` and renames; a failure leaves no partial file and reports itself in the section, not in a dialog. |
| 4 | Rotation stays as built and tested: `app.log` up to 1 MiB, then one archive `app.log.1`. The export reads both. No change in this phase. |
| 5 | Files the app renamed as broken (`cache.corrupt-*`, `drafts.corrupt-*`) are listed with size, time and name, and are never deleted by the app. |
| 6 | The drafts salvage lives in Settings → Diagnostics: when `drafts.db` will not open, one action renames it and starts fresh, behind a confirmation. Nothing is deleted, and no other screen gains a button. |
| 7 | A widget that throws is logged and replaced by a calm panel for that subtree; the rest of the window stays usable. Debug builds keep Flutter's error box. |
| 8 | A failure before the window opens shows a Windows message box naming the log folder and exits with code 1. An invalid configuration keeps `ConfigErrorApp`. |

## Tests

- **The snapshot (unit, temp dirs).** The app, clock and session blocks; a cache and a drafts file present, missing, and unreadable; broken files listed newest first; the log tail bounded at 200 lines across both files; a line carrying a token, a Windows path and a UNC path comes out redacted and masked.
- **The export (unit).** Writes the chosen name, renames from `.tmp`, replaces a `.tmp` left by an earlier attempt, and reports a write failure without leaving a file.
- **The salvage (unit).** A drafts file that is not a database is renamed with its bytes intact and a fresh database answers no drafts; the confirmation and the outcome in a widget test.
- **The surfaces (widget).** A throwing child shows the calm panel and logs once; the Diagnostics rows with and without broken files; **Save diagnostics…** calling the picker seam and reporting the path; the section saying "not available yet" when the folder cannot be resolved.
- **Manual.** On the installed build: break `drafts.db` with a text editor, reopen, see the row and the salvage action, keep the renamed file; save a diagnostics file to Documents and confirm it opens and carries no path or token.

## Verification

`dart format --set-exit-if-changed lib test integration_test` clean, `flutter analyze lib test` no issues, `flutter test` green, `flutter build windows --release` succeeds.

## Open questions

None. The four that matter — no zip, sanitized twice, rename-never-delete, and the salvage only in Settings — are decisions 1, 2, 5 and 6.
