# Todo: FlowPost Desktop — Production-Ready Windows MVP

**Plan:** `tasks/plan.md`
**Status:** Auth deferred by owner; building features without login (accounts first)
**Mode:** Windows x64, Flutter, existing Supabase backend, unsigned Inno Setup
**Rule:** A phase is done only when its gate passes. No next phase with a Must-fix.
**Owner override (2026-10-28):** login is deferred to the end. Build the real screens and local flows with no auth gate; real Supabase wiring resumes with identity. Phase gates for Phases 2–5 record local evidence only.

---

## Phase 0 — Shell Completion and Installability

- [x] **0.1a** Archive Pake plan/todo to `tasks/archive/`
- [x] **0.1b** Review and approve `tasks/plan.md` and this todo
- [x] **0.2** Fix shell safety blockers
  - [x] Exclusive single-instance lock; unknown owner treated as alive
  - [x] Tray failure does not trap a hidden window
  - [x] OAuth `code`/`state` redacted; log route only
  - [x] Config rejects non-HTTPS and service-role/secret keys
  - [x] Global framework/async error logging
- [x] **0.3** Deep-link restore and intent durability
  - [x] Every accepted link calls `showFromTray()`
  - [x] Hidden window returns with taskbar entry and focus
  - [x] Failed batch read restores the intent file
- [x] **0.4** Shell tests
  - [x] Guard, tray, quit, hand-off, restore unit tests
  - [x] `integration_test/shell_test.dart` launches and exits cleanly
- [x] **0.5** Installer and protocol
  - [x] `installer/flowpost.iss` builds `FlowPostNativeSetup.exe`
  - [x] Start Menu, uninstall, and `flowpost://` registry entry
  - [x] Icon from `public/logo.png`
- [x] **0.6** Version/update, README, log path
  - [x] Version + manifest check + download URL
  - [x] README commands/toolchain/log path
  - [x] Align spec/comment with real `%APPDATA%\com.flowpost\FlowPost\logs`
- [x] **0.7** Phase 0 gate
  - [x] `flutter analyze` zero
  - [x] `dart format --set-exit-if-changed lib test` clean
  - [x] `flutter test` green (60 tests)
  - [x] `flutter test integration_test -d windows` green
  - [x] Release build + installer
  - [x] Install, Start Menu, protocol, uninstall
  - [x] Close-to-tray; Show verified through `flowpost://focus`
  - [x] Tray **Quit**/**Show** click accepted at approval (Quit via code path/review)
  - [x] Two cold starts: one primary only
  - [x] Cold start under 3 seconds
  - [x] Logs contain no token/code/state
  - [x] Scoped `ponytail-audit` no Must-fix
  - [x] Human approval (2026-10-28)

### Phase 0 evidence (2026-10-28)

- `flutter analyze`: no issues. `dart format --set-exit-if-changed lib test integration_test`: clean.
- `flutter test`: 60 passed. `flutter test integration_test -d windows`: 1 passed.
- Release build and `iscc installer/flowpost.iss`: success; output `dist-desktop/FlowPostNativeSetup.exe`.
- Install/uninstall: silent install exit 0, Start Menu shortcut present, `flowpost://` key present, uninstall removed app dir/shortcut/protocol key and kept `%APPDATA%\com.flowpost\FlowPost`.
- Cold start: 2.75 s, 2.10 s, 2.90 s, 2.87 s, 2.92 s (limit 3 s); title `FlowPost Studio`.
- Single instance: second launch exited, one process left; `flowpost://focus` and `flowpost://auth-callback` handed off to the primary.
- Close-to-tray: window hidden, process alive, one instance; restore via `flowpost://focus` brought it back visible with focus.
- Log scan after `code=FINAL123&state=FINAL456` callback: no code/state/token values.
- Manual scoped audit (`ponytail-audit` + `security-and-hardening` + `code-review-and-quality`): no Must-fix. Non-blocking notes: send-time resolution for schedules, server-side auth/RLS checks, publish timeout/retry semantics — scheduled for later phases.

---

## Phase 1 — Identity and Session (DEFERRED by owner 2026-10-28)

- [x] **1.1** Write `SPEC-identity.md` + ADR 0001 (dual auth session)
- [ ] **1.1a** Approve identity decisions: question cadence, admin-only, backend hardening, logout scope, credentials
- [ ] **1.2** Auth data layer: typed session, secure storage, refresh, logout
- [ ] **1.3** Login UI: email/password, Google, loading/error/offline
- [ ] **1.4** Google OAuth: system browser, PKCE/state, `flowpost://auth-callback`
- [ ] **1.5** Session restore, logout, expired/revoked handling
- [ ] **1.6** Phase 1 gate
  - [ ] Unit/widget tests green
  - [ ] Real Google login on installed build
  - [ ] Session survives restart; logout clears
  - [ ] No tokens in logs
  - [ ] `security-and-hardening` review
  - [ ] Scoped `ponytail-audit` no Must-fix
  - [ ] Human approval

---

## Phase 2 — Account Connections (no-auth local slice first)

- [x] **2.0** Navigation shell: Home, Accounts, Upload, Calendar, Settings routes
- [x] **2.1** `docs/spec/SPEC-accounts.md` written for the local slice; real function contracts deferred with identity
- [x] **2.2** Typed `AccountsRepository`; local JSON implementation with six seeded accounts
- [x] **2.3** Accounts screen: connected/disconnected/expired, connect/disconnect, loading/error/empty
- [x] **2.4** Local connect/disconnect state; persists across restart and reinstall; real browser flow deferred
- [ ] **2.5** Phase 2 gate (local)
  - [x] Repository and widget tests for six platforms
  - [x] Local connect/disconnect persists across restart (installed build; `accounts.json`)
  - [x] No token logged (this slice stores no tokens)
  - [x] `security-and-hardening` review: no secrets, fixed data path, untrusted file handled defensively
  - [x] Scoped `ponytail-audit` no Must-fix
  - [x] Human approval (owner, 2026-10-28)

**Evidence:** `flutter analyze` clean; 73 unit/widget tests pass; installed build shows six cards at the minimum window size (two columns, natural heights, 1.6× text scale tested); connect wrote `%APPDATA%\com.flowpost\FlowPost\accounts.json` and survived restart and reinstall; save-before-state and atomic temp-file rename verified by tests; icons verified in the 27-glyph release font after a clean build.

**Review fixes (2026-10-28):** save now completes before the card changes (no optimistic race); repository merges partial files back to six platforms and writes via temp file + rename; retry invalidates the repository as well as the controller; card grid uses natural heights and a wrapping header so large text cannot clip; temp-file rename over an existing file verified on Windows.

---

## Phase 3 — Media Pipeline

- [ ] **3.1** Write/approve `SPEC-media.md`; FFmpeg packaging ADR; fixtures
  - [x] `docs/spec/SPEC-media.md`: formats, 100 MB/180 s limits, normalization, workspace cleanup, caption/upload contracts
  - [x] `docs/adr/0002-bundle-ffmpeg.md`: pinned BtbN 8.1 LGPL shared, SHA-256, 161.2 MB, `libopenh264`, LGPL notices
  - [x] Fixtures generated; `expected.json` verified with the pinned build
  - [x] `libopenh264` encode + decode round-trip verified; probe JSON, frames, audio, corrupt-file rejection verified
  - [ ] Human review/approval of the FFmpeg and licensing decision
- [x] **3.2** File picker, validation, temp workspace
  - [x] `MediaValidation`: extension allowlist, 100 MB cap, empty/unreadable rejection
  - [x] `MediaWorkspace`: per-job folders, guarded deletion, stale-job sweep at startup
  - [x] Native Windows picker (`file_selector`) behind an injectable seam
  - [x] Upload screen: empty / checking / failed / picked states
- [x] **3.3** FFmpeg probe/transcode/thumbnail/audio/frame extraction
  - [x] `tool/fetch_ffmpeg.ps1`: pinned download, SHA-256 check, license posture assertions
  - [x] `FfmpegPaths`: runtime lookup next to the executable, `FLOWPOST_FFMPEG_DIR` override
  - [x] `FfmpegRunner`: separate process, argument list, bounded buffers, progress, kill on cancel
  - [x] `MediaProbe` / `parseProbeJson` / `parseAudioProbeJson`: defensive metadata parsing
  - [x] `checkMediaLimits`: duration and dimension caps
  - [x] `FfmpegMediaProcessor`: probe → limits → remux-or-encode → thumbnail → frames → audio
  - [x] Progress reporting, cancel, remux-falls-back-to-encode, sanitized error reasons
  - [x] Upload screen: processing and ready states; captions and upload disabled until sign-in
  - [x] Fixture integration tests against the real binary
- [ ] **3.4** Caption generation through existing edge function
- [ ] **3.5** R2 upload with progress and cleanup
- [ ] **3.6** Phase 3 gate
  - [x] Fixture integration tests
  - [x] Large-file run: no UI freeze, memory bounded
  - [x] Temp files cleaned
  - [x] `performance-optimization` review
  - [x] `security-and-hardening` review
  - [ ] Scoped `ponytail-audit` no Must-fix
  - [ ] Human approval

### Phase 3.1 evidence (2026-10-28)

- **Spec:** `docs/spec/SPEC-media.md` — one file at a time; MP4/MOV/M4V/WEBM/MKV and JPG/PNG/WEBP; 100 MB and 180 s caps; remux-or-encode rules; 640×360 thumbnail; three 640-max-side frames at web timestamps; 16 kHz mono MP3; workspace cleanup and crash recovery; typed caption/upload contracts.
- **ADR:** `docs/adr/0002-bundle-ffmpeg.md` (Proposed) — BtbN FFmpeg 8.1 LGPL shared win64, zip 77.9 MB, SHA-256 `092B5E24…ADB5`; 161.2 MB / 9 files installed; `libopenh264` H.264; separate process, argument lists, `file` protocol allowlist; no GPL components.
- **Fixtures:** `desktop-flutter/test/fixtures/media/` — 10 files, 2.28 MB total: portrait H.264 MP4/MOV, VP9 WebM, 6 s H.264 MP4, JPG/PNG/WebP stills, Unicode/space still, 2 KB corrupt MP4, unsupported TXT. `expected.json` holds probe, normalization, thumbnail, frame, audio, and limit values.
- **Verified with the pinned build:** `ffmpeg n8.1.3-24-g92611900bb-20261027`; every probe matches `expected.json`; remux of MP4/MOV/6 s MP4 and encode of VP9 WebM produce H.264 `yuv420p` + AAC 48 kHz; 640×360 thumbnails; portrait frames 360×640; 6 s frames at 2/3/4 s are distinct; 16 kHz mono MP3 8.5 KB (2 s) and 24.2 KB (6 s); `corrupt.mp4` probe exits 1.
- **Encoder check:** 1080×1920 `libopenh264` encode exits 0 (Constrained Baseline, level 4.0, 997.6 KB for 2 s); full decode round-trip exits 0.
- **Gitignore:** `third_party/ffmpeg/` and `third_party/cache/` are ignored; binaries are fetched, fixtures are committed.
- **Deferred/blocked:** live caption and upload calls need identity; duplicate-free upload retry needs the `idempotency_key` change in `upload-local-file`; public-distribution H.264 patent position needs an owner decision (internal distribution accepted for the MVP).

### Phase 3.2 evidence (2026-10-29)

- **Validation** (`lib/features/media/domain/media_validation.dart`): MP4/M4V/MOV/WEBM/MKV and JPG/PNG/WEBP allowlist, 100 MB cap, empty-file and unreadable-file rejection with user-facing messages. Extension match is case-insensitive.
- **Workspace** (`lib/features/media/data/media_workspace.dart`): one folder per job under `%LOCALAPPDATA%\com.flowpost\FlowPost\media\jobs`, named by an internally generated id (`yyyyMMddTHHmmss-<6 hex>`) — no user-supplied text becomes a path. Deletion resolves symlinks, requires the target to sit inside the jobs root, and refuses the root itself. Leftover folders are swept at startup; a failed sweep logs the job id only, never a full path.
- **Picker** (`lib/features/media/data/media_file_picker.dart`): native Windows Open dialog with the "FlowPost media" filter, behind an injectable `MediaFilePicker` seam so the controller is testable.
- **Upload screen** (`lib/features/media/presentation/media_page.dart`): empty / checking / failed / picked states, size formatting, `Choose another file` releases the job folder.
- **Audit fix:** picking a second file orphaned the first job folder; the controller now deletes the previous job after the new one is created (covered by a failing-first test).
- **Gate:** `flutter analyze` no issues; `dart format --set-exit-if-changed lib test integration_test` clean; `flutter test` 104 passed; `flutter test integration_test -d windows --dart-define-from-file=config/dev.json` 1 passed (now also asserts the Upload screen opens from the nav rail); release build succeeded.
- **Live run (release build):** Upload screen renders; "Choose file" opens the native Open dialog with the "FlowPost media" filter; selecting `sample.png` showed "sample.png — Image — 213.2 KB" and created job `20261029T064638-a9dd11`; "Choose another file" returned to the empty state and removed the job folder (jobs root empty afterwards).

### Phase 3.3 evidence (2026-10-29)

- **Pinned toolchain:** BtbN FFmpeg `n8.1.3-25-g611cec792a-20261028` (LGPL v3, shared, win64) from the immutable tag `autobuild-2026-10-28-19-47` — the rolling `latest` URL is gone, so a rebuild cannot silently drift. Zip 81,649,021 bytes, SHA-256 `0448C3F3B9BDC724CC0189D5CE6E6BFA5B8937E7EC408E1E97FB08719BDB3B92`, verified by `tool/fetch_ffmpeg.ps1` before extraction. Installed: 10 files, 161.2 MiB (169,051,107 bytes) in `desktop-flutter/third_party/ffmpeg/bin`. The script asserts `--enable-version3`, `--enable-shared`, no `--enable-gpl`, no `--disable-libx264` failure — a GPL build aborts the fetch.
- **ADR:** `docs/adr/0002-bundle-ffmpeg.md` re-pinned to the immutable tag and the new size figures; the pin-rot consequence is now written down.
- **Domain layer (pure, no I/O):** `media_probe.dart` (`MediaProbe` + `parseProbeJson` + `AudioProbe`/`parseAudioProbeJson` for audio-only containers), `media_limits.dart` (`checkMediaLimits` — duration and dimension caps), `ffmpeg_plan.dart` (remux-vs-encode decision, thumbnail/frame timestamp math, argument builders), `ffmpeg_progress.dart` (progress line parsing), `ffmpeg_error.dart` (sanitized failure reason — prefers the first stderr line containing "error", strips the `[lib @ 0x…]` prefix and replaces Windows/quoted paths with "the file"), `media_processing.dart` (`MediaProcessingProgress`, `MediaProcessingException`, `MediaCancelled`).
- **Runner** (`data/ffmpeg_runner.dart`): `FfmpegExecutor` seam over `FfmpegRunner`. Separate process, **argument list only — never a shell string**, `-protocol_whitelist file`, `-nostdin -hide_banner`, stdout capped at 1 MB and stderr at 64 KB, `-progress pipe:1` parsed for progress, `process.kill()` on timeout and on cancel.
- **Processor** (`data/media_processor.dart`): `MediaProcessor` seam, `FfmpegMediaProcessor` runs probe → limits → normalize (remux, falling back to one encode attempt) → thumbnail → frames → audio. Weighted progress (probe 0.02, normalize 0.05→0.7, thumbnail 0.7, frames 0.8, audio 0.95, ready 1.0), throttled to 4 updates/second and never moving backwards. A missing or empty output file fails the step with "Couldn't write temporary files. Check free space and try again."; a timeout reports "Processing took too long and was stopped."; still images are read whole (no `-ss`) because a still has no timeline.
- **Providers** (`media_providers.dart`): state machine `MediaIdle | MediaChecking | MediaProcessing | MediaReady | MediaFailed`; `mediaProcessorFactoryProvider` is overridable so the controller is testable. Picking a file validates, creates the job, deletes the previous job, then processes without blocking the frame; cancel stops FFmpeg and removes the job folder; a failure keeps the folder and shows the sanitized reason. Each job is logged by id only — never a path.
- **Upload screen** (`presentation/media_page.dart`): processing state (name/kind/size, progress bar, stage label, percent, Cancel) and ready state (thumbnail preview, dimensions/duration/codecs, the output list, and disabled "Generate captions"/"Upload" buttons with the hint "Sign in required to generate captions or upload."). Auth is deliberately not a gate yet, per the current MVP decision.
- **Installer** (`installer/flowpost.iss`): packages `third_party\ffmpeg\bin` into `{app}\ffmpeg\bin`; `FfmpegPaths.locate()` finds it next to the executable, with `FLOWPOST_FFMPEG_DIR` as an override.
- **Security fix:** the probe did not carry the `file` protocol allowlist even though the test claimed it did; `probeArguments` now passes `-protocol_whitelist file`, so a playlist-shaped input cannot reach the network. The test asserts the flag.
- **Live run (real app on Windows, real FFmpeg):** `integration_test/app_test.dart` launches the shipped app, opens Upload, and processes `portrait_2s_1080x1920_h264.mp4` end to end. The ready state shows "Dimensions: 1080 x 1920", "Duration: 0:02", "Video codec: h264", and the outputs `normalized.mp4`, `thumb.jpg`, `audio.mp3`; "Generate captions" and "Upload" are disabled with the sign-in hint. A second job was cancelled while FFmpeg was running: the app returned to the empty state, the jobs folder was empty afterwards, and the `ffmpeg.exe` process count returned to its pre-test value — no orphan process. The log shows only job ids (`Media job 20261029T083656-3709d5 started/ready/cancelled`), never a path.
- **Integration test shape:** the shell and the media pipeline share one file on purpose — the shell takes a single-instance lock, so a second `app.main()` in the same run hands off to the first and exits. `main()` takes an optional `MediaFilePicker` so the test can feed a fixture instead of opening the native dialog.
- **Gate:** `flutter analyze` no issues; `dart format --set-exit-if-changed lib test integration_test` clean; `flutter test` **183 passed** (media suite 110, of which **19 run against the real FFmpeg binary** and compare against `test/fixtures/media/expected.json`); `flutter test integration_test -d windows` **1 passed** against the real app; release build succeeded.
- **Open:** the `ponytail-audit` review and the human approval of the Phase 3.6 gate remain.

### Phase 3.6 gate review (2026-10-29)

**Security (`security-and-hardening`) — findings and resolutions**

| Finding | Severity | Resolution |
|---|---|---|
| A crafted image declares its resolution in a few bytes and the decoder allocates the whole frame, so the 100 MB size cap does not bound the decode | HIGH | `mediaMaxPixels` = 33.2 MP (7680×4320); `checkMediaLimits` rejects a wider frame with "This file's resolution is too large to process." Covered by a failing-first test. |
| A job ran six FFmpeg processes with no wall-clock ceiling, so a stuck job could hold the UI for an hour | HIGH | `FfmpegMediaProcessor.jobTimeout` (15 min whole job, 30 s probe) with a per-step remaining-budget; overrunning it stops the process and reports "Processing took too long and was stopped." |
| FFmpeg's stderr reached the screen and the log with the user's full path, leaking the file location | MEDIUM | `ffmpegErrorReason` masks the known source path and any Windows/UNC path as "the file" and strips control bytes. |
| A crafted file name with CR/LF or ANSI bytes could forge log lines | MEDIUM | `stripControlCharacters` runs over the message, the error and the stack trace before the line is written. |
| FFmpeg can echo bytes that are not valid UTF-8, which killed the whole job on a decoder error | MEDIUM | `decodeOutputLines` decodes with `allowMalformed: true`. |
| The probe lacked the `file` protocol allowlist, so a playlist-shaped input could reach the network | MEDIUM | `probeArguments` passes `-protocol_whitelist file` and ends its options with `--`. |
| Outputs kept the source's metadata and chapters (device, GPS, title) | LOW | Every output now passes `-map_metadata -1` and `-map_chapters -1`. |
| The pinned build's `enable_drefs` is off by default, so an external-track file would follow a remote reference | LOW | Verified on the pinned build (`-enable_drefs <boolean> ... (default false)`); the flag only exists in the mov demuxer, so passing it breaks every other demuxer. The default is now guarded by an integration test and ADR 0002 records it. |

**Performance (`performance-optimization`) — findings and resolutions**

| Finding | Severity | Resolution |
|---|---|---|
| The pixel cap (above) also bounds decode memory | HIGH | Same fix. |
| A job had no wall-clock budget (above) | HIGH | Same fix. |
| Progress was reported per FFmpeg line, which floods the UI on a long job | MEDIUM | `_Progress` throttles to 4 updates/second and never moves backwards; the stage boundaries always show. |
| The app did not stream FFmpeg's output — it buffered it whole | MEDIUM | stdout and stderr are consumed as streams with a 1 MB / 64 KB cap. |
| The job folder was created with `create(recursive: true)`, which silently reuses an existing folder | LOW | `createJob` draws a new id when the folder is already taken. |
| The ffprobe JSON is capped at 1 MB | LOW | Left as is; the cap is above any real probe output and bounds the memory. |

**Large-file run (2026-10-29)** — a temporary integration harness (`integration_test/large_file_test.dart`, deleted after the run) drove the real Windows app over three stress files and measured the app while FFmpeg worked. "UI updates" counts the distinct percentages the screen showed; "longest tick gap" is the longest delay between two 100 ms timer ticks on the app's own isolate — a blocked isolate would stretch it.

| Fixture | Source | Bytes | Job | UI updates | Longest tick gap | Peak app | Peak FFmpeg |
|---|---|---|---|---|---|---|---|
| `size_stress.mp4` | 960×540, 12 s, 64 Mbps | 96,178,529 | 3 s | 2 | 161 ms | 469.5 MB | 50.2 MB |
| `duration_stress.mp4` | 1920×1080, 170 s | 18,826,887 | 2 s | 2 | 166 ms | 473.3 MB | below the sample rate |
| `encode_stress.mp4` | 3840×2160, 15 s | 4,333,399 | 10 s | 11 | 126 ms | 473.0 MB | 313.3 MB |

- **No UI freeze:** the longest gap between two ticks was 161 ms across all three runs, so the UI isolate was never blocked — FFmpeg runs as a separate process and every step awaits it.
- **Progress kept moving:** the 4K re-encode (the only slow path) showed 11 distinct percentages while it ran.
- **Memory bounded:** the app peaked at ~470 MB and FFmpeg at 313 MB during the 4K encode. The app figure includes the `flutter_test` harness running inside the app process, so a shipped build sits lower.
- **Correct output:** the 4K source was scaled to 1920×1080 H.264 Constrained Baseline `yuv420p`, 15.000 s.
- **Temp files cleaned:** a job folder left behind by a hard kill was gone after the next launch — the startup sweep removes it.
- The harness is deleted; it was a measurement, not a test.

**Deferred to the owner**

- The LGPL attribution / About screen (ADR 0002 item 7) has no owner decision yet.
- `FLOWPOST_FFMPEG_DIR` takes precedence over the installed binaries; it is a development and fixture override only.
- `libopenh264` runs with its default thread count, which is not pinned.
- `media_page.dart` builds a new `Future` per rebuild; it is cheap today but is the next thing to revisit.
- `graphify update .` was blocked by the safety classifier and never ran; the knowledge graph is stale for this slice.

---

## Phase 4 — Publishing

- [ ] **4.1** Write/approve `SPEC-publishing.md`; map upload functions/statuses
- [ ] **4.2** Compose/publish UI with validation and per-platform status
- [ ] **4.3** Publish-now flow with status polling
- [ ] **4.4** Schedule + retry guard: refresh status before retry
- [ ] **4.5** Phase 4 gate
  - [ ] State-machine tests for timeout/already-published
  - [ ] One real platform publish
  - [ ] Duplicate guard proven
  - [ ] `security-and-hardening` review
  - [ ] `performance-optimization` review
  - [ ] Scoped `ponytail-audit` no Must-fix
  - [ ] Human approval

---

## Phase 5 — Scheduling and Offline Slice

- [ ] **5.1** Write/approve `SPEC-scheduling.md` + `SPEC-offline.md`; SQLite ADR
- [ ] **5.2** Calendar/queue UI; timezone/DST correctness
- [ ] **5.3** SQLite cache with schema version and migration
- [ ] **5.4** Local drafts: autosave, restore, delete, no offline publish
- [ ] **5.5** Connectivity banner; cached reads; reconnect refresh
- [ ] **5.6** Phase 5 gate
  - [ ] Timezone/DST tests
  - [ ] Cache migration and corruption tests
  - [ ] Draft round-trip and restart
  - [ ] Offline cannot publish
  - [ ] Data-loss review
  - [ ] Scoped `ponytail-audit` no Must-fix
  - [ ] Human approval

---

## Phase 6 — Production Hardening

- [ ] **6.1** Settings: account, logout, version, update, log location, about
- [ ] **6.2** Global error handlers, rotation, diagnostics export, crash recovery
- [ ] **6.3** Accessibility: keyboard, focus, labels, contrast, 200% scaling
- [ ] **6.4** Performance: cold start, media, lists, memory, size
- [ ] **6.5** Security: secrets, tokens, deep links, FFmpeg args, dependencies, RLS notes
- [ ] **6.6** README, ADRs, runbook, release checklist, rollback notes
- [ ] **6.7** Phase 6 gate
  - [ ] `shipping-and-launch` checklist green
  - [ ] No P0/P1 security/accessibility/performance issue
  - [ ] Scoped `ponytail-audit` no Must-fix
  - [ ] Human approval

---

## Phase 7 — Release Candidate and Launch

- [ ] **7.1** Version bump, production build, installer, checksum, release notes
- [ ] **7.2** Clean Windows 10/11 install, launch, tray, deep link, login, uninstall, reinstall
- [ ] **7.3** End-to-end smoke: login, connect, media, publish, schedule, offline, draft, logout
- [ ] **7.4** Rollback installer, data compatibility, support runbook, SmartScreen docs
- [ ] **7.5** Internal VM first, then admin machine; monitor one week
- [ ] **7.6** Final `ponytail-audit` no Must-fix; human sign-off

---

## Gate Commands

```powershell
cd desktop-flutter
flutter pub get
flutter analyze
dart format --set-exit-if-changed lib test
flutter test
flutter test integration_test -d windows --dart-define-from-file=config/dev.json
flutter build windows --release --dart-define-from-file=config/prod.json
iscc installer/flowpost.iss
```

Run backend checks only when the backend or web app changes:

```powershell
npm test
npm run build
```
