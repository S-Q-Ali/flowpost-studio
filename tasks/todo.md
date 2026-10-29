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
- [x] **3.4** Caption generation through existing edge function
  - [x] `caption_prompt.dart`: master prompt and platform map in one file
  - [x] `captions_client.dart`: typed client over an injectable transport
  - [x] `caption_generator.dart`: transcribe → describe → captions, with progress and cancel
  - [x] `captions_providers.dart`: controller with idle / running / ready / failed states
  - [x] Upload screen: caption progress, editable captions, readable failures
  - [x] The action stays off until a session token exists
- [x] **3.5** R2 upload with progress and cleanup
  - [x] `idempotency_key` read by `upload-local-file`; the object is named after it
  - [x] `upload_client.dart`: multipart body by hand, typed client, injectable transport
  - [x] `upload_providers.dart`: idle / running / done / failed / cancelled, run counter, cancel
  - [x] Upload screen: progress with percent, Cancel, stored file, readable failure
  - [x] The action stays off until a session token exists
- [ ] **3.6** Phase 3 gate
  - [x] Fixture integration tests
  - [x] Large-file run: no UI freeze, memory bounded
  - [x] Temp files cleaned
  - [x] `performance-optimization` review
  - [x] `security-and-hardening` review
  - [x] Scoped `ponytail-audit` no Must-fix
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
- **Gate:** `flutter analyze` no issues; `dart format --set-exit-if-changed lib test integration_test` clean; `flutter test` **210 passed** (media suite 110, of which **19 run against the real FFmpeg binary** and compare against `test/fixtures/media/expected.json`); `flutter test integration_test -d windows` **1 passed** against the real app; release build succeeded.
- **Open:** the human approval of the Phase 3.6 gate remains.

### Phase 3.4 evidence (2026-10-29)

- **Prompt** (`lib/features/media/captions/domain/caption_prompt.dart`): `MasterPrompt` with the five fields of `src/lib/prompt-templates.ts` verbatim, `defaultMasterPrompt`, `platformAllowedCaptionKeys` (the `PLATFORM_ALLOWED_KEYS` map), `captionKeyLabels`, `allowedCaptionKeys`, `buildSystemPrompt` (the prompt as JSON with a two-space indent, matching `JSON.stringify(x, null, 2)`) and `buildUserMessage` with the web's "No transcript available." / "No visual description available." fallbacks. One file, so the text cannot drift into a second copy.
- **Client** (`captions/data/captions_client.dart`): `CaptionsApi` over an injectable `CaptionTransport`. The three calls of the `generate-ai-captions` edge function — `groq-transcribe` with the audio base64, `groq-chat` with `qwen/qwen3.6-27b` for the frames (temperature 0.6, 512 tokens) and `openai/gpt-oss-120b` for the captions (temperature 0.7, 4096 tokens). `HttpCaptionTransport` uses `dart:io` `HttpClient`, so no dependency was added. The answer is read from the model's own JSON with the code fences stripped; an answer that is not JSON is a readable failure, not an empty caption set. The client sends nothing while there is no token.
- **Generator** (`captions/data/caption_generator.dart`): transcribe → describe the frames → write the captions. The transcription is skipped when the source has no audio, so a silent video still gets captions from the frames. The audio goes out as base64, the frames as `data:image/jpeg;base64,…` data URLs. Progress at 0.05 / 0.2 / 0.5 / 0.8 / 1.0.
- **Controller** (`captions/captions_providers.dart`): `CaptionIdle | CaptionRunning | CaptionReady | CaptionFailed`. A run counter keeps a cancelled or superseded run from writing over the newer state, and `cancel()` aborts the request in flight. The captions can be edited before they are published; picking another file throws them away.
- **Upload screen** (`presentation/media_page.dart`): the "Generate captions" action, a progress bar with a Cancel button while the run lasts, one editable field per caption, and the failure message under the buttons.
- **Identity (why the action is off today):** `isRequestAuthorized` in `supabase/functions/_shared/auth.ts` rejects the anon key by design (`reason: "anon-key"`), and `FRONTEND_API_KEY` is a rotated secret that no client holds — so the desktop app cannot call the function without a session token. `captionTokenProvider` is null until the identity module exists, and the action stays disabled with the hint "Sign in required to generate captions or upload." The app itself is not gated, per the owner's decision to add the login guard only when the app is production-ready.
- **Tests:** 45 new — prompt 11, client 11, generator 8, controller 10, Upload screen 5 (the action is off without a token, the run works with one, a failure reads clearly, a caption can be edited, the run can be cancelled).
- **Gate:** `flutter analyze` no issues; `dart format --set-exit-if-changed lib test integration_test` clean; `flutter test` **255 passed**; release build succeeded.

### Phase 3.5 evidence (2026-10-29)

- **Contract** (`lib/features/media/upload/domain/upload_processing.dart`): `UploadStage` (`preparing`, `uploading`), `UploadProgress` (stage, fraction, message), `UploadResult` (videoId, url, filename, size) and `UploadException` — a failure the user can act on.
- **Body and client** (`lib/features/media/upload/data/upload_client.dart`): `MultipartBody` builds the request by hand — one `file` part and one `idempotency_key` text field, a random boundary, a known `contentLength`, and `openRead(onProgress:)` that counts the bytes on the way. The file name goes into a header line, so quotes, line breaks and control bytes become `_`. `HttpUploadTransport` speaks `dart:io` `HttpClient`, so no dependency was added; `cancel()` closes the client with `force: true` and makes a fresh one. `UploadClient` sits over an injectable `UploadTransport`: a non-2xx answer becomes a readable message, an answer without `videoId`/`url` is "The upload service returned an unexpected answer.", and no token means nothing is sent.
- **Progress:** the client reports at most every 250 ms and always reports the last one, so the bar ends at full instead of rebuilding the screen once per disk chunk.
- **Controller** (`lib/features/media/upload/upload_providers.dart`): `UploadIdle | UploadRunning | UploadDone | UploadFailed | UploadCancelled`. A run counter keeps a cancelled or superseded run from writing over the newer state, and the request in flight can be aborted. The job id is the idempotency key, so a retry after an ambiguous failure lands on the same object instead of a second one.
- **Upload screen** (`lib/features/media/presentation/media_page.dart`): the progress bar with a percent and a Cancel button, the stored file name and size, the failure message under the buttons. The Upload button is off while a token is missing, while the upload runs, and after it succeeded.
- **Identity (why the action is off today):** `sessionTokenProvider` in `lib/core/providers/app_providers.dart` is null until the identity module exists, so the Upload button stays disabled with the hint "Sign in required to generate captions or upload." The app itself is not gated, per the owner's decision to add the login guard only when the app is production-ready.
- **Backend** (`supabase/functions/upload-local-file/index.ts`): the function already reads `idempotency_key` and names the object after it, so a retry reuses the object; the desktop client now sends the same key. The catch block no longer hands the internal error text to the client — the detail stays in the log and the client gets "The upload failed. Please try again."

**Gate review (`code-review-and-quality`) — findings and resolutions**

| Finding | Severity | Resolution |
|---|---|---|
| An upload that answered after the user had moved to another file deleted the new job's folder and reset the screen | Critical (data loss) | `reset()` invalidates the run and aborts the request, and `completeJob(jobId)` only clears the job it belongs to. Covered by a failing-first test that was red before the fix. |
| A slow cleanup turned a finished upload into an error | Required | The cleanup runs outside the upload's try block and only logs its own failure. |
| The progress was reported per disk chunk, rebuilding the screen a thousand times for a large file | Required | The client throttles to 250 ms. |
| The edge function returned the internal Postgres/AWS error text to the client | Required (information disclosure) | A fixed message for the client, the detail in the log. |
| Every video was stored as "normalized.mp4", so the library showed the same name for every video | Required | The user's file name is kept, with the truthful `.mp4` extension for a normalized video. |
| Aborting a live request had no test | Required | A test against a local server that never answers. |
| The generated job id had to satisfy the server's idempotency rule | Required | A test pins the id to `/^[A-Za-z0-9_-]{1,128}$/`. |

- **Tests:** 31 new — client 13, controller 14, Upload screen 4, job id 1.
- **Gate:** `flutter analyze` no issues; `dart format --set-exit-if-changed lib test integration_test` clean; `flutter test` **287 passed**; `npx vitest run` **101 passed**; release build succeeded.
- **Deferred:** the manual real upload needs a session token (Phase 1), so the transport was proven against a local HTTP server instead; images go up as the untouched original, so their EXIF/GPS travels into R2; `media_providers.dart` and `upload_providers.dart` import each other.

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

**Scoped `ponytail-audit` (2026-10-29) — findings and resolutions**

The audit ran over the Phase 3.2/3.3 slice only. Every finding was checked against the code and `docs/spec/SPEC-media.md` before acting; two were rejected.

| Finding | Severity | Resolution |
|---|---|---|
| A workspace that cannot create its folder threw straight through the controller, so the Upload tab stayed on "Checking the file..." with no way out | Must-fix | `MediaController.pickFile` catches the failure and lands on `MediaFailed` with "Could not create a working folder. Check free space and try again." Only the error type is logged. Covered by a failing-first test. |
| A missing FFmpeg and a probe that hit its timeout were both reported as "This file can't be read", which sent the user looking for a corrupt file | Must-fix | `FfmpegRun.failedToStart` marks a process that never started; the probe maps it to "FFmpeg could not start. Reinstall the app." and a timeout to "Processing took too long and was stopped." |
| The pipeline took the media kind from the file extension, so a long video renamed to `.png` skipped the 180 s limit and produced one frame instead of three | Should-fix | `kindFromProbe` decides the kind from the codec ffprobe reports, and the job is updated with it. Two failing-first tests. |
| The file dialog carried its own extension list, which could drift from the validator's | Should-fix | Both read `videoMediaExtensions` and `imageMediaExtensions`. |
| The unreadable-file sentence existed in three files and could change in one copy only | Should-fix | One `mediaUnreadableMessage` constant. |
| An unexpected media failure logged the error message, which can carry the path of the user's file | Should-fix | The error type and stack trace are logged; the message never is. |
| The redaction pass turned "Error code: 1" and "state: MediaIdle" into `[redacted]`, so log lines could not be read | Should-fix | `code` and `state` are redacted only after an `=`; the OAuth query form is still handled by the first pass. |
| `createJob` drew a new id when the folder existed, but nothing proved it gives up after five tries | Nice-to-have | Covered by a test that pins the give-up. |
| The runner had no test for a timeout, a cancel, or a missing executable | Nice-to-have | Three tests against a real child process. |
| The unused `MediaStage` values and the test-only `AudioProbe` | Rejected | The stage values are named in `SPEC-media.md`'s Model section; moving `AudioProbe` to `test/` would either grow the production API or duplicate the parser in the test. |

**Gate:** `flutter analyze` no issues; `dart format --set-exit-if-changed lib test integration_test` clean; `flutter test` **210 passed**.

**Deferred to the owner**

- The LGPL attribution / About screen (ADR 0002 item 7) has no owner decision yet.
- `FLOWPOST_FFMPEG_DIR` takes precedence over the installed binaries; it is a development and fixture override only.
- `libopenh264` runs with its default thread count, which is not pinned.
- `media_page.dart` builds a new `Future` per rebuild; it is cheap today but is the next thing to revisit.
- `graphify update .` was blocked by the safety classifier and never ran; the knowledge graph is stale for this slice.

---

## Phase 4 — Publishing

- [x] **4.1** Write/approve `SPEC-publishing.md`; map upload functions/statuses
  - [x] `docs/spec/SPEC-publishing.md`: the publish unit, the two credentials, the platform contract, the limits, the status model, the duplicate rule, the error model
  - [x] The existing functions mapped: `upload-local-file`, `youtube-upload`, `instagram-upload`, `facebook-upload`, `tiktok-upload`, `linkedin-upload`, `post-story`, `process-scheduled-posts`; `transfer-ticket` and `drive-to-mega` are storage infrastructure, not the publish path
  - [x] The web app's publish path mapped: one `posts` row per (platform × account), then `{postId}` per function
  - [x] The five backend gaps that force the client's guard to be strict, each cited
  - [x] The owner's decisions (2026-10-29): refuse an over-limit caption, a story is its own option, the scheduler alone publishes a scheduled post, the backend guards come after the app ships
  - [x] Human approval of the spec
- [x] **4.2** Compose/publish UI with validation and per-platform status
  - [x] `publish_target.dart`: the platforms, the account, the feed/story choice, the caption limit, the media each platform accepts, the function each platform uses
  - [x] `publish_validation.dart`: the caption limit, the media type, the YouTube title, the schedule fields — refused, never cut
  - [x] `publish_errors.dart` and `publish_client.dart`: the call per platform, the answer, the eleven error codes
  - [x] `posts_repository.dart`: the `posts` row through PostgREST, the read back, the compare-and-set retry
  - [x] `publishing_controller.dart`: one row and one call per target, the per-platform status
  - [x] `publish_page.dart`: the compose screen, the per-platform status, the action off without a sign-in
  - [x] The `/publish` route and the Publish button after the upload
  - [x] 63 tests
- [x] **4.3** Publish-now flow with status polling
  - [x] `publish_client.dart`: the call budget, the timeout and the dropped connection as their own failures
  - [x] `publish_errors.dart`: the outcome that is unknown, the code for an upload that worked while the row did not
  - [x] `publishing_controller.dart`: the row read back after every attempt, the bounded wait for a row that is still running
  - [x] `publish_page.dart`: the phase that is not confirmed
  - [x] 13 tests
- [x] **4.4** Schedule + retry guard: refresh status before retry
  - [x] `publishing_controller.dart`: the scheduled row, the `scheduled` phase, the retry that moves a failed row, the one run at a time
  - [x] `publish_page.dart`: the scheduled label, the time it goes out, the Retry button and the sentence that explains why it is off
  - [x] 10 tests
- [ ] **4.5** Phase 4 gate
  - [x] State-machine tests for timeout/already-published
  - [ ] One real platform publish
  - [x] Duplicate guard proven
  - [x] `security-and-hardening` review
  - [x] `performance-optimization` review
  - [x] Scoped `ponytail-audit` no Must-fix
  - [ ] Human approval

### Phase 4.1 evidence (2026-10-29)

- **Spec** (`docs/spec/SPEC-publishing.md`): the publish unit is the `posts` row, not the request — the client writes one row per (platform × account) and then calls the platform function with `{"postId": …}`, exactly what the web app does (`src/pages/UploadPage.tsx:569`, `:634-704`). The caption, the media URL and the access token are never sent by the client.
- **Two credentials** (ADR 0001): the Supabase Auth access token for PostgREST — the RLS on `posts` is `user_id = auth.uid()` (`supabase/migrations/20260616000000_add_multi_user_rls.sql:54`) — and the `sessions` token for the edge functions (`supabase/functions/_shared/auth.ts:77-90`). The service-role key and `FRONTEND_API_KEY` are never used in the client: the latter carries no user scope.
- **Functions mapped:** `upload-local-file` (Phase 3.5), `youtube-upload`, `instagram-upload`, `facebook-upload`, `tiktok-upload`, `linkedin-upload`, `post-story`, `process-scheduled-posts`. `transfer-ticket` and `drive-to-mega` are storage infrastructure, not the publish path.
- **Status model:** the five values the database allows (`supabase/migrations/20260320000000_posts_status_publishing.sql:3-4`). The web app's `PostStatus` type lists only four — `publishing` is missing (`src/lib/types.ts:2`) — and its badge has no style for it (`src/components/StatusBadge.tsx:4-9`).
- **Duplicate rule:** refresh the row before a retry, and never blind-retry. No upload function looks at `post.status` before publishing (they all select it and none branch on it — `youtube-upload/index.ts:129`, `instagram-upload/index.ts:88`, `facebook-upload/index.ts:87`, `tiktok-upload/index.ts:124`, `linkedin-upload/index.ts:70`, `post-story/index.ts:89`), and the platform's state is not readable afterwards — YouTube keeps no video id (`youtube-upload/index.ts:253-319`). The retry is a compare-and-set, like the web app's (`src/pages/QueuePage.tsx:178-194`).
- **Limits:** the client refuses an over-limit caption instead of letting the function cut it silently (`instagram-upload/index.ts:118` cuts at 2200, `youtube-upload/index.ts:242` at 5000). The web app has no client-side validation at all.
- **Backend gaps found** (each needs the owner's approval and deploy access, so none are in the v1 scope): no status guard in the upload functions; no provider id for YouTube; the scheduler's claim is not atomic (`process-scheduled-posts/index.ts:82-85`); Instagram can re-send the publish call inside its 120 s window (`instagram-upload/index.ts:341-359`); TikTok can time out after the platform accepted the post (`tiktok-upload/index.ts:386-395`); the `posts` table has no `error_message` or `platform_post_id` column.
- **Also found:** the `pg_cron` job for `process-scheduled-posts` ships commented out (`supabase/migrations/20260307000300_cron_process_scheduled_posts.sql:6-22`), so the whole scheduled flow depends on a job that has to be created by hand; and the web app's story branches never run, because the row it filters on is not selected after the insert (`src/pages/UploadPage.tsx:569` selects `id, platform, account_id, status`, but `:618-624` filters on `post_type`) — a story is published as a feed post there.
- **Open for the owner:** the `process-scheduled-posts` cron — the migration ships it commented out (`supabase/migrations/20260307000300_cron_process_scheduled_posts.sql:6-22`), so the scheduled flow needs a job that may not exist in the live database.

### Phase 4.2 evidence (2026-10-29)

- **Compose screen** (`desktop-flutter/lib/features/publishing/presentation/publish_page.dart`): the media, the platform checkboxes with the connected account under each, one caption field per target with the limit under it, the YouTube title, the mode, the date and the time with the UTC instant under them, the reasons the form is not ready, and the status of every platform.
- **The unit is the row** (`posts_repository.dart`): one `posts` row per (platform × account), written through PostgREST with the Auth token, then one call per row with `{"postId": …}` — the web app's shape (`src/pages/UploadPage.tsx:569`, `:634-704`). The caption, the media and the platform token never leave the machine.
- **Two credentials**: the Auth token for the table (`posts` has RLS `user_id = auth.uid()`, `supabase/migrations/20260616000000_add_multi_user_rls.sql:54`) and the `sessions` token for the functions. Both are null until identity exists, so the action stays disabled and the contract is covered by mocked tests only.
- **The limits are refused, not cut** (`publish_validation.dart`): an over-limit caption stops the form and names the limit, and an image for YouTube or TikTok stops it too. The web app sends it and lets the function cut it (`instagram-upload/index.ts:118`).
- **The error model** (`publish_errors.dart`): eleven codes; the platform's own sentence is shown only after the links and the control bytes are taken out.
- **The row's shape**: `user_id`, `video_id`, `platform`, `account_id`, `post_type`, `caption`, `hashtags` (null), `scheduled_at` (UTC), `status` (`processing`), `captions_enabled`, `contains_altered_content` (true while the caption is still the one the AI wrote) and `metadata.youtube_video_title` for YouTube (`youtube-upload/index.ts:241`).
- **The log** carries the platform and the error code — never the caption, the media link, the platform id, the token or the account name.
- **Deviation from the spec's UI:** the spec puts the media on the left and the form on the right; the screen is one column, because the media block is only the file name and the size and a second column would stay empty.
- **Tests:** 63 new (validation, the client contract, the queue contract, the controller, the compose screen) — 350 in the suite; `flutter analyze` and the format check are clean.
- **Deferred to 4.3 and 4.4:** the read-back of the row after the call, the polling of a running status, the scheduled row, the Retry button and its compare-and-set.

### Phase 4.3 evidence (2026-10-29)

- **The row is the truth** (`publishing_controller.dart`): after every attempt the row is read back, because the function writes `published` or `failed` itself (`youtube-upload/index.ts:307-310` and the same shape in the other five). A row that carries a `published_at` counts as published even when its status says otherwise — the functions only write that time when the platform took the post, and a later failure does not clear it (`youtube-upload/index.ts:320-325` sets `failed` over a row that was already published).
- **The call budget** (`publish_client.dart`): 180 s for the whole call. The Instagram function waits on the platform for about two minutes before it answers (`instagram-upload/index.ts:232-233`: 10 attempts, 12 s apart), so a client that gave up earlier would call a finished publish a timeout.
- **A call that never came back** leaves the outcome unknown: the row is asked again, five seconds apart, twelve times at most. The wait only happens for a timeout or a dropped connection — a plain failure settles the row itself, and waiting for it would burn a minute for nothing.
- **The new phase `unconfirmed`** ("Not confirmed"): the call timed out and the row never settled. The client cannot say the post went out and cannot say it did not, so it says so — and offers no retry, because the platform may have taken it. This is the spec's success criterion 3.
- **A thirteenth error code**, `uploadSucceeded` ("The post may have gone out. Check the Queue before trying again."): the functions answer "Upload succeeded but status update failed" with a 500 (`youtube-upload/index.ts:314`, `tiktok-upload/index.ts:412`, `facebook-upload/index.ts:216`, `linkedin-upload/index.ts:218`) — the platform took the post and the row could not be written. The row's own `failed` is stale there, so the client keeps that outcome unconfirmed instead of offering a retry that would post twice. The spec's error table has twelve codes; this one is added for that sentence alone.
- **The queue call is bounded too** (`posts_repository.dart`): 30 s per call, so the read-back and the wait can never hang the window.
- **Tests:** 13 new (the timeout and the dropped connection against a real local server, the mapping of the unknown outcome, the read-back, the wait, the row that settles, the row that never settles, the published time over a failed status, the unconfirmed phase on the screen) — 363 in the suite; `flutter analyze` and the format check are clean.
- **Deferred to 4.4:** the scheduled row and its status, the Retry button, the compare-and-set that moves a row back into the queue, and the rule that the button stays disabled until the row has been refreshed.

### Phase 4.4 evidence (2026-10-29)

- **One publisher** (`publishing_controller.dart`): a scheduled post is only a row — `status = 'scheduled'` and `scheduled_at` = the chosen UTC instant — and the client sends nothing. The scheduler alone publishes it (`process-scheduled-posts/index.ts:43-48` takes the rows that are `scheduled` and due), so the client and the scheduler can never publish the same row. The web app's own retry does the same thing (`src/pages/QueuePage.tsx:178-194`).
- **The retry never sends the call again**: it moves the row back to `scheduled` with `scheduled_at = now + 60 s`, and the scheduler publishes it. A client that re-sent the function itself could post the same thing twice.
- **The compare-and-set is the duplicate guard** (`posts_repository.dart`): the move is a `PATCH … ?id=eq.<id>&status=eq.failed`, so only a row that is still failed moves. A row that went out in the meantime matches nothing, and the client reads the row again and shows the truth ("The row changed. Its status is now published."). The button is only enabled when the row was read back and still says failed — the unknown outcome (`unconfirmed`) offers no retry at all, because the platform may have taken the post.
- **One run at a time** (`_inFlight`): a second click while a run works does nothing. The first click has already written the row, and a second row would post the same thing twice.
- **The screen** (`publish_page.dart`): "Scheduled" with the local time it goes out, the Retry button under a failure, and the sentence that says why the button is off.
- **Tests:** 10 new (the scheduled row and the instant it stores, the scheduled row with no time, the retry that moves the row, the retry that changes nothing, the retry that is not offered, the second click, and the four on the screen) — 373 in the suite; `flutter analyze` and the format check are clean.
- **Known limit for the 4.5 gate:** the functions' early bail-outs (no `postId`, the wrong platform, no `account_id`, no video, no connected account) leave the row in `processing`, so such a row is not `failed` and cannot be retried from the client — the admin publishes it again from the draft the screen kept.

### Phase 4.5 evidence (2026-10-29)

**Gate checklist**

| Item | State |
|---|---|
| State-machine tests for timeout / already-published | Done |
| Duplicate guard proven | Done |
| `security-and-hardening` review | Done, no open finding |
| `performance-optimization` review | Done, no open finding |
| Scoped `ponytail-audit` | Done, no Must-fix left |
| One real platform publish | **Open — needs the owner's real accounts** |
| Human approval | Pending |

**What the gate changed**

- **The queue call cannot wedge the publish** (`posts_repository.dart`, `publish_client.dart`): the timeout is now one budget for the whole call — the connection, the answer and the body — instead of three timeouts that could add up to three times the budget, and a dropped connection is caught as a `PostsException` instead of an `IOException` that escaped the publish and left the screen on "Publishing...". The row read-back and the wait end early when the queue stops answering, so the admin is not left in front of a spinner.
- **The YouTube title has a limit** (`publish_target.dart`, `publish_validation.dart`): YouTube keeps 100 characters and the function does not cut the title, so a longer one is refused by the client with the limit named, next to the caption limit the client already enforced.
- **A path never reaches the screen** (`core/logging/app_logger.dart`): `maskPaths` is now the one masker, used by the FFmpeg reason and by the sentence of a failed publish. A platform or a tool can echo the path of the user's file back, and a path names a file on someone's disk.
- **The screen says each thing once** (`publish_page.dart`): an issue of a target is shown under that target's field and no longer repeated in the list of the form's reasons, and the platform's own id is labelled "Platform id" — it is the id the platform gave, not the id of the row.
- **The ponytail cleanups**: the caption key of a platform is now pinned by a test against the captions module, the JWT payload is decoded in one place (`jwtPayload` in `core/auth/access_token.dart`, used by the row owner and by the service-role check), the dead `PublishComposer.reset()` is gone, and the media size and duration formatters live in one place (`core/format/media_format.dart`) instead of two copies.

**The reviews and their findings**

| Finding | Severity | Resolution |
|---|---|---|
| The queue call had no timeout on the connection and the body, so the publish could hang on a half-open socket | Must-fix | One `Stopwatch` budget over the whole call. Two tests against a real local server: a dropped connection and a call that runs out of time. |
| A dropped connection threw an `IOException` that escaped the publish and left the screen on "Publishing..." | Must-fix | Caught and turned into "The queue did not answer. Try again." |
| The wait for the row kept polling a queue that was not answering | Should-fix | The wait ends at the first refused answer. |
| The retry lost the failure when the queue refused to move the row | Should-fix | The failure stays on the screen with the reason. |
| The YouTube title had no limit, so a long one failed at the platform with an opaque error | Should-fix | The limit is 100 and is refused by the client. |
| A file path in the sentence of a failure reached the screen | Should-fix | `maskPaths` is the one masker, used by both the FFmpeg reason and the failure sentence. Two tests. |
| The caption key of a platform was not pinned against the captions module, although a comment promised a test | Should-fix | `test/features/publishing/publish_target_test.dart`. |
| The JWT payload was decoded twice, in two files | Should-fix | `jwtPayload` in `core/auth/access_token.dart`. |
| A validation message was printed twice | Should-fix | The issue of a target is only shown under its field. A test. |
| The platform's own id was labelled "Post id" | Nit | "Platform id". |
| The answer of a call was not bounded in size | Rejected | The answer of the platform functions is a small JSON; the cap would be a new limit with no case behind it. |
| The targets were published one after the other | Rejected | The platforms throttle an account, so a parallel run would fail more, not less. One run at a time is also the duplicate guard. |
| The `HttpClient` was created per call and thrown away | Rejected | A kept client holds a socket for the life of the app; the table is asked a few times per publish, so the per-call client is cheaper. |
| A cancel button for a running publish | Rejected | Nothing is sent until the row is written, and a row that is written can be retried through the queue. The button would add a path that is not needed. |
| `PostRow.platform` and `PublishTarget.==` were unused | Rejected | `platform` is part of the row the client reads back; the equality is used by the selection. |
| The `posts` RLS has a backdoor owner `00000000-…` and the upload functions never compare `post.user_id` with the session user | Deferred to the owner | Both need a backend change and a deploy; the owner decided the backend guards come after the app ships. |

**Verification:** `flutter analyze` no issues; `dart format --set-exit-if-changed lib test integration_test` clean; `flutter test` **383 passed** (10 new in this gate: 2 for the transport, 2 for the path masking, 2 for the title limit, 2 for the queue that stops answering, 1 for the caption key, 1 for the message that is printed once).

**Deferred to the owner**

- **One real platform publish is still open.** It needs the owner's real YouTube/Instagram accounts, real tokens and a real video; nothing in this repo can stand in for it. Everything else in the 4.5 gate is done, but the gate itself cannot be signed without it.
- The `process-scheduled-posts` `pg_cron` job ships commented out (`supabase/migrations/20260307000300_cron_process_scheduled_posts.sql:6-22`), so the scheduled flow needs a job that may not exist in the live database.
- The RLS backdoor owner and the missing `post.user_id` check in the upload functions (see the table above).
- The functions' early bail-outs leave the row in `processing`, so such a row cannot be retried from the client.

---

## Phase 5 — Scheduling and Offline Slice

- [x] **5.1** Write/approve `SPEC-scheduling.md` + `SPEC-offline.md`; SQLite ADR
  - [x] `docs/spec/SPEC-scheduling.md`: the read model, the queue, the calendar, the timezone and the DST rules, editing and cancelling
  - [x] `docs/spec/SPEC-offline.md`: the connectivity state, the cache, the schema and the migrations, corruption, the drafts and the conflict rule
  - [x] `docs/adr/0003-local-cache-engine.md`: `package:sqlite3` directly, two databases, the version in the database, a broken file renamed and never deleted
  - [x] Human approval of the three documents and of the six scheduling and eight offline decisions (2026-10-29)
- [x] **5.2** Calendar/queue UI; timezone/DST correctness
  - [x] The `TimeZone` seam and the three cases a wall clock can have (skipped, repeated, ordinary)
  - [x] The read model and the queue list
  - [x] The calendar: month, week and list
  - [x] Editing a scheduled post and cancelling one
- [x] **5.3** SQLite cache with schema version and migration
  - [x] The spike: the engine works in the test runner and in the Windows build (ADR 0003)
  - [x] The cache database: the posts snapshot, the version inside it, the migration runner
  - [x] A file that will not open is renamed; a newer file is left alone
- [x] **5.4** Local drafts: autosave, restore, delete
  - [x] `drafts.db` with its own migrations, one draft per media
  - [x] The form saved 800 ms after the last change and restored when the screen opens
  - [x] The conflict rule: a moved time is shown and the admin picks; a time the clock no longer has is refused
  - [x] Deleted when every target wrote its row, kept when one failed
  - The offline gate on Publish needs the connectivity state, so it lands in 5.5 and is verified in 5.6
- [x] **5.5** Connectivity banner; cached reads; reconnect refresh
  - [x] The offline gate on the Publish button, with the reason
- [x] **5.6** Phase 5 gate
  - [x] Timezone/DST tests
  - [x] Cache migration and corruption tests
  - [x] Draft round-trip and restart
  - [x] Offline cannot publish
  - [x] Data-loss review
  - [x] Scoped `ponytail-audit` no Must-fix
  - [x] Human approval (2026-10-29): gate accepted, Phase 5 closed

### Phase 5.1 evidence (2026-10-29)

- **Approved by the owner on 2026-10-29.** All three documents and all fourteen proposed decisions: the platform filter, the week view, the machine's timezone, refusing a skipped hour and using the first of a repeated one, cancel-as-delete with a confirmation, 200 rows a page; and on the offline side no polling, connection-level failures only, two databases, a renamed corrupt file, no token on disk, the 500-row bound, the typed time never silently changed, and an unencrypted cache wiped on sign-out while the drafts are kept.

- **Three documents, all proposed and waiting for the owner.** `docs/spec/SPEC-scheduling.md`, `docs/spec/SPEC-offline.md` and `docs/adr/0003-local-cache-engine.md`. Each ends with the decisions that need a yes or a no; nothing is implemented on top of an unapproved spec.
- **What the web app does today, so the desktop is not guessing.** The queue is one page (`src/pages/QueuePage.tsx`) that fetches **every** row and filters it in the browser (`:65-72`), with a status filter only (`:42`) and a bulk bar (`:247-262`). The calendar is a month grid and a list (`src/pages/CalendarPage.tsx:22`), three posts a day and a count of the rest (`:127-139`), and its "Cancel Post" **deletes the row** with no confirmation (`:47-52`). The desktop follows the same shape and adds the confirmation, because a deleted row takes the caption with it.
- **The timezone is the machine's, and the DST rules are new.** The web app resolves a typed time silently (`src/pages/QueuePage.tsx:104-107`, `:123-128`), so a post written for an hour the clock skips moves by an hour with nothing on the screen to say so. The desktop **refuses** a skipped hour and names the repeated one. The rules are written against a small `TimeZone` seam so a fake zone with a daylight-saving jump can pin them on a machine whose zone has none.
- **The profile has no timezone.** The `users` table carries `id, name, email, avatar_url, is_admin, created_at` (`src/pages/ProfilePage.tsx:15-22`, `:46-50`) and the Preferences tab is a placeholder (`:376-388`), so storing the admin's zone would need a migration and a deploy. The screen shows the zone instead.
- **The engine: `package:sqlite3` 3.8.0, directly.** It binds SQLite over `dart:ffi` and gets the library through Dart build hooks, so **no `sqlite3.dll` ships and the installer does not change** — the usual objection to SQLite on Windows does not apply. `sqflite` has no Windows target, `sqflite_common_ffi` is the same engine under another name, and `drift` adds a code generator and a build step for a dataset that a few hand-written statements cover. The SDK floor is Dart ≥ 3.10 and the project is on 3.13.7.
- **Two databases, not one.** `cache.db` holds the rebuildable reads, `drafts.db` holds the compose drafts. A cache that is wiped or corrupted then never reaches a draft, and the no-data-loss rule costs nothing to keep.
- **A broken database is renamed, never deleted** (`cache.corrupt-20261029-1432.db`), and a database whose version is **newer** than the app's is not touched at all, so a downgrade cannot destroy data.
- **The cache holds no token.** The `connected_accounts` rows are read by name — `platform`, `account_id`, `account_name`, `is_connected` — so `access_token` and `refresh_token` are never fetched and can never be written down. The local account store already works the same way (`desktop-flutter/lib/features/accounts/domain/connected_account.dart:34-39`).
- **The app never polls for connectivity.** It learns the state from the calls it makes, and only a connection-level failure means offline — a timeout does not. That needs the queue error to carry its kind, which the Phase 4.5 gate merged into one sentence; 5.5 splits the kind from the message.
- **The draft keeps the time the admin typed.** A draft stores the wall clock as it was typed, the instant it resolved to and the offset. On restore the app resolves the wall clock again: if the instant moved, the screen says so and the admin chooses; the typed value is never silently replaced.
- **The web app's offline store is dead code.** `src/lib/offline-db.ts` wraps IndexedDB and is never imported (`:84`), and there is no draft, no autosave and no connectivity handling anywhere in `src/`.
- **Open for the owner:** six decisions in `SPEC-scheduling.md` and eight in `SPEC-offline.md`, of which the ones that change the work are the platform filter, the week view, the timezone source, the delete of a published row, whether the cache keeps the `videos` rows, more than one draft per media, and whether the cache is wiped on sign-out while the drafts are kept.
- **Spike before 5.3:** open a database in a temp directory under `flutter test` and under `flutter build windows`, and show that the compiled asset is inside the built app and that no `sqlite3.dll` sits next to the executable. The build hook has to run in the test runner on Windows, and that is the one thing the sources do not settle.

### Phase 5 spike and 5.2a evidence (2026-10-29)

- **The spike is done, and it corrected the ADR.** `sqlite3` 3.8.0 is added to `desktop-flutter/pubspec.yaml`. A database in a temp directory keeps its row across a close and a reopen under `flutter test`, and `flutter build windows --release` succeeds. The library lands in `build/native_assets/windows/sqlite3.dll` and is copied to `build/windows/x64/runner/Release/sqlite3.dll` (1.7 MB) — so the ADR's "no `sqlite3.dll` is shipped" was **wrong**. The conclusion survives: `installer/flowpost.iss` copies the whole `Release` folder, so the DLL ships with no change to the installer and the app needs no system SQLite. ADR 0003 now says what the build shows.
- **The timezone seam is in.** `desktop-flutter/lib/core/time/time_zone.dart` holds the `TimeZone` seam (`resolve` + `offsetAt`), the production `SystemTimeZone`, and the three outcomes a wall clock can have: ordinary, repeated, skipped. The rules live in one place, so the screens cannot disagree about what a typed time means.
- **A skipped hour is refused.** The web app resolves a typed time silently (`src/pages/QueuePage.tsx:104-107`), so a post written for the hour the clock jumps over goes out an hour later with nothing on the screen to say so. The desktop refuses it: "That time does not exist today. The clock jumps from 01:59 to 03:00." The publish button is off and **no row is written** — the controller resolves through the same seam and refuses there too, so the rule holds even if the form is bypassed.
- **A repeated hour uses the first occurrence and says so.** "That time happens twice today. The post goes out at the first one." The screen shows the zone next to the time (`UTC-05:00`), so a wrong zone is visible rather than silent — the profile has no timezone column, so the machine's zone is the only one available.
- **The cases pin on every machine.** The rules are written against the seam, not against `DateTime`, and the tests use a fake zone with a synthetic daylight-saving jump (`test/support/fake_time_zone.dart`). The skipped hour, the repeated hour, two zones with the same wall clock, and the round trip are all covered — on a machine whose own zone has no daylight saving as well.
- **One reason is shown once.** The skipped message sits under the date and the time fields; the list of reasons at the bottom of the form no longer repeats it.
- **The row stores an instant.** The controller now writes the resolved UTC instant into `scheduled_at` instead of a local `DateTime` the repository had to convert. The screen still shows the wall clock the admin typed.
- **Verification:** `dart format --set-exit-if-changed lib test integration_test` clean (97 files), `flutter analyze` no issues, `flutter test` **397 passed** (was 383).

### Phase 5.2b evidence (2026-10-29)

- **The queue is a real screen now, and the shell reaches it.** `QueuePage` (`desktop-flutter/lib/features/scheduling/presentation/queue_page.dart`) sits on `queueRoute` (`lib/core/router/app_router.dart:15`, `:53`) and is a bottom-nav destination between Upload and Calendar (`lib/core/shell/app_shell.dart:16`, `:37`). Header, a status chip row and a platform dropdown, then the list: thumbnail, media title, status, `Instagram story · @flow` or `Instagram · @flow`, the time, and two lines of caption. The empty state offers "Upload a video" only when nothing is filtered; a filtered empty says "No failed posts" and offers no upload because the media is not the problem.
- **The read model is two calls, and neither crosses a privacy line.** `PostgrestScheduledPostsRepository` (`lib/features/scheduling/data/scheduled_posts_repository.dart:40`) asks `posts` for the display columns plus `videos(title,thumbnail_url)` — a real foreign key, so one embed — ordered `scheduled_at.asc.nullslast,created_at.asc`. `connected_accounts` has no foreign key to `posts`, so the account labels come from a second call (`:118`) for **only the page's** `account_id`s, with `select=account_id,account_name,display_name` and never a token column. A failed label read leaves the name off and keeps the queue.
- **A page is 200 rows, and "more" is one extra row.** `limit` is asked as `limit + 1` (`:80`), so `hasMore` costs no count on a table the client does not own; the controller's `loadMore()` (`scheduling_controller.dart:97`) asks from `posts.length` and appends.
- **Both filters are real queries, not browser filters.** The web app fetches every row and filters in memory (`src/pages/QueuePage.tsx:65-72`); the desktop sends `status=eq.…` and `platform=eq.…` (Decision 1), so the server does the work and the page stays 200 rows.
- **Riverpod would have hidden a failed read.** Riverpod 3 retries a failing provider on its own and keeps `isLoading` true while it does, so `when()` showed the skeleton forever and the spec's "the reason, and Try again" never rendered. `queueControllerProvider` sets `retry: (retryCount, error) => null` (`scheduling_controller.dart:75`) and the page shows the sentence plus a **Try again** button that invalidates the provider.
- **A row that changes underneath is not mixed.** `build()` watches both filters, and `loadMore()` re-reads them after its await and drops the page if either moved (`scheduling_controller.dart:97-120`), so a slow page cannot land in another filter's list. A failed page keeps the rows already on screen and shows the reason under them.
- **A row this build cannot parse is left out, never guessed.** A `status` outside the allowed set or a missing `id` drops the row; an unknown platform still shows with "Unknown platform"; a row whose `videos` row is gone still reads with a placeholder thumbnail.
- **Times are shown in the admin's clock, with the offset.** `postTimeLabel` (`domain/scheduled_post.dart`) renders the stored instant through `toLocal()` and labels the offset from the same conversion, so the label always matches the clock that produced it; a published row reads "Published …".
- **Tests:** 35 in `test/features/scheduling/` — repository 18 (token gate, empty table, one-extra-row, offset, order, both filters and no filter, row fields, unknown status/platform, missing media, account names from `display_name ?? account_name`, no token field in any URL), controller 9 (rows, page size and offset, status filter, failed read, append, end of list, one load at a time, failed page, page dropped after a filter change), page 8 (a full row, a published row, both empty states, error and retry, both filters re-read, load more). `test/support/fake_scheduled_posts.dart` records every call.
- **Verification:** `dart format` clean, `flutter analyze lib test` no issues, `flutter test` **432 passed** (was 397), including the 35 scheduling tests.

### Phase 5.2c evidence (2026-10-29)

- **Three views over one read model.** `CalendarPage` (`desktop-flutter/lib/features/scheduling/presentation/calendar_page.dart`) sits on `calendarRoute` and shows a month grid, a week grid or a day-grouped list. The grid is Sunday first, up to three posts a day and `+N more`; the list shows all of them, grouped by `Thursday, 29 October 2026` headings. The empty state names the view ("No posts this month" / "No posts this week"), and **New post** goes to the upload screen because a post is always one media file plus one account.
- **One read per visible range, not per month.** `loadBetween(from, to)` asks `posts` for `scheduled_at >= from` and `< to` as two bounds on the same column (`data/scheduled_posts_repository.dart`), so the week view gets its seven days even when the week straddles two months, and a month that starts mid-week is not padded with the previous month's rows. The labels come from the same second call the queue uses, so a token column is still never named.
- **The range is wall-clock, the query is an instant.** `calendarRange` (`domain/calendar_range.dart`) builds local midnights; the repository converts them with `toUtc()` before sending. The tests build the bounds from the inputs they pass in, so they pin the rule on any machine zone.
- **The calendar opens on today, and a test can stand on a known day.** `todayProvider` is the seam: `CalendarAnchorController` starts from it, and the tests override it with 29 October 2026 instead of waiting for the real clock. Arrows move one month in the month and list views and one week in the week view — the view the admin is looking at decides what "next" means.
- **The week view has a title that names both ends.** `25–31 October 2026` inside one month, `27 December 2026 – 2 January 2027` across a year, so the arrow's effect is readable without counting cells.
- **A failed read is the same shape as the queue.** `calendarControllerProvider` also turns Riverpod's automatic retry off, so a calendar that cannot be read shows the reason and **Try again** rather than a skeleton that never ends.
- **The shell test caught the placeholder.** The navigation-rail test still expected "Coming soon in the next module." on `/calendar`; it now asserts the real screen's answer when there is no session ("Sign in required to see the calendar."), which is what keeps the rail route honest.
- **Tests:** 39 new — domain 20 (`calendar_range_test.dart`: month and week ranges, the Sunday-first grid with its blanks, a leap February, month/week steps, three title shapes, the full day label, the clock label, grouping and a row with no time), repository 4 (both bounds as instants, rows and names, the token gate, ordering), controller 7 (the opening month, rows, the week read, both arrow steps, the list step, the failed read not retrying), page 8 (a post on its day, three plus a count, the week's seven days and its read, the grouped list with all rows, the arrows re-reading, the empty state, the error and retry, the new-post button).
- **Verification:** `dart format --set-exit-if-changed lib test integration_test` clean (111 files), `flutter analyze lib test` no issues, `flutter test` **471 passed** (was 432).

### Phase 5.2d evidence (2026-10-29)

- **A row opens from both screens.** `showScheduledPost` (`lib/features/scheduling/presentation/post_actions.dart`) is the one details dialog, and the queue card (`queue_page.dart`, `InkWell` on `queue-post-<id>`) and the calendar chip and listed row (`calendar_page.dart`, `calendar-post-<id>`) all open it, so the two screens cannot drift apart on what a row can do.
- **The dialog offers only what the row allows.** Edit appears for a `scheduled` row with a time, Cancel for a `scheduled` row, Delete for a `failed` or `published` row, and a row with no status match shows nothing but Close. A published row is deletable but not cancellable — there is nothing left to cancel.
- **Cancel and delete are the same write, with a name and a confirmation.** The backend has no `cancelled` status, so cancel is the DELETE the web app already does (`src/pages/CalendarPage.tsx:47-52`) with the confirmation the web app does not have. `deleteSentence` says which row is going and adds "that went out on …" for a published row, so the caption's loss is visible before the yes.
- **Edit is a compare-and-set, not a blind write.** `updateScheduled` PATCHes with `id=eq.…&status=eq.scheduled` (`data/scheduled_posts_repository.dart`) and the transport always asks for `Prefer: return=representation`, so an empty answer means the row left `scheduled` while the form was open. The form then says "This post is no longer scheduled, so it was not changed." and keeps the dialog with the typed values rather than pretending.
- **The edit form reuses the publish rules.** `checkScheduleEdit` (`domain/post_edit.dart`) runs the same caption limit, the same `parseLocalSchedule`, the same skipped-hour refusal and the same repeated-hour acceptance as the publish screen, through the same `TimeZone` seam. A skipped hour is refused with the jump named; a repeated hour is accepted as the first one. The past check only fires when the typed time actually moved, so fixing the caption of a row that is already waiting is never blocked.
- **Only the four editable fields are sent.** `PostEdit.toRow()` writes `caption`, `hashtags`, `contains_altered_content` and `scheduled_at` as a UTC instant and nothing else — no status, no user id, no account.
- **A row this build cannot parse stays out of the calendar too.** `_shownPosts` is now the one mapping the queue and the range read share, so the two reads drop the same broken rows.
- **Tests:** 29 new — domain 13 (`post_edit_test.dart`: the three platform caption limits, an unreadable date, the skipped hour, the repeated hour resolving to 05:30Z, an ordinary time, a changed past time refused, an unchanged past time accepted, `toRow`, three confirmation sentences), repository 6 (both bounds, the range rows, the token gate for the range, the PATCH's filter and body, the compare-and-set answer, the DELETE), range 1 (`longTimeLabel`), page 9 (details and both actions, cancel asking first and deleting on a yes, keeping changing nothing, a published row's delete-only wording, an already-gone row keeping the dialog and saying so, an edit saving caption and instant, a skipped-hour edit refused, a moved-on edit not written, a calendar chip opening the dialog).
- **Verification:** `dart format --set-exit-if-changed lib test integration_test` clean (114 files), `flutter analyze lib test` no issues, `flutter test` **500 passed** (was 471).

### Phase 5.3 evidence (2026-10-29)

- **The version is inside the file, and each step is its own transaction.** `applyMigrations` (`lib/features/offline/data/local_database.dart`) reads the version from the `meta` row, runs only the steps past it, writes the new version in the same transaction, and rolls back on a throw — so a step that fails leaves the database at the version before it. The runner owns the `meta` table, so the drafts database in 5.4 gets the same version home without repeating it.
- **A file that will not open is renamed, never deleted.** `CacheStore.open()` (`data/cache_store.dart`) catches a failure to open or to read the version, renames the file to `cache.corrupt-20261029-1432.db`, and reports what happened. A second break in the same minute becomes `…-1432-2.db`, so neither file is lost. A file whose version is **higher** than this build's is closed untouched and reported as `newerVersion` — a downgrade destroys nothing.
- **The snapshot is the read, not the row set.** `savePosts` replaces the table inside one transaction, so it is called only after a read that succeeded and a failed read can never empty the cache. A read that legitimately found nothing is still a snapshot, with its own `last_read_at`; a cache that was never written returns null, so the screen can tell "no posts" from "nothing saved yet".
- **Instants are integers, not ISO strings.** `scheduled_at`, `published_at` and `fetched_at` are microseconds since the epoch. Postgres hands out microsecond precision, and an ISO string sorts wrongly the moment one row carries microseconds and another does not (`….000123Z` sorts before `….000Z`). An integer sorts correctly by construction, and the row's precision survives the round trip.
- **The bound is the queue's own order.** The cache keeps the first 500 rows in `scheduled_at ASC NULLS LAST, id` order — the rows the queue shows first — rather than the 500 most recently created, which would drop exactly the upcoming posts the screen opens on. `savePost` (after a write) re-applies the bound; `removePost` drops a deleted row. The snapshot's `last_read_at` is left alone by both: it is the time the list was read from the server.
- **A row the cache cannot read is skipped, not guessed.** The same rule as the server read: a row without an `id` or with a status outside the five allowed ones is left out, an unknown platform reads as unknown. The cache cannot render a row the app would not have shown.
- **What is not in the cache yet, and why.** The approved spec lists `accounts`, `videos` and `profile` tables. The desktop reads accounts from its local store (`accounts.json`), not the server, so an accounts table would be a table with no writer; the profile has no read at all until Settings (6.1); and the media fields the queue and calendar show (`title`, `thumbnail_url`) travel with the post row, so a separate `videos` table would only normalise 500 rows. Those tables land as migration 2+ when their reads do — that is what the migration path is for. Recorded here as a decision, not an omission.
- **The engine calls are synchronous.** `package:sqlite3` is synchronous and the dataset is bounded at 500 rows, so the store has no futures and no fake: the tests open a real file in a temp directory, which is the seam the ADR names.
- **Tests:** 19 — store 14 (`cache_store_test.dart`: first open and version, the full-field round trip across a close and a reopen, the 500-row bound, nulls last, replace, an empty read as a snapshot, a never-written cache as none, a newer file untouched, a broken file renamed with its stamp, two broken files in a minute, a row added after the read, a write past the bound, a delete, an unreadable row skipped), migrations 4 (`local_database_test.dart`: ordered steps and the version, already-applied steps skipped, a throwing step rolled back, version zero with no meta table) plus the engine spike.
- **Verification:** `dart format --set-exit-if-changed lib test integration_test` clean (117 files), `flutter analyze lib test` no issues, `flutter test` **518 passed** (was 500).

### Phase 5.4 evidence (2026-10-29)

- **The drafts are their own database.** `DraftStore` (`lib/features/offline/drafts/draft_store.dart`) opens `drafts.db` through the same `applyMigrations` runner as the cache, with a `drafts` table keyed by `video_id`, so one media has one draft and a cache rebuild can never reach the admin's words (ADR 0003, Decision 3).
- **A drafts file that will not open is left alone.** `open()` returns false instead of throwing, the file is neither renamed nor deleted, and every read answers "no draft". The salvage flow the spec describes (read-only, the admin clicks to start fresh) needs a diagnostics screen to show the drafts on, so it lands with 6.2; the rule that matters here — nothing on disk is deleted by the store — already holds and is tested.
- **The form is written 800 ms after the last change.** `PublishComposer` (`lib/features/publishing/publishing_providers.dart`) restarts a `Timer` on every change and writes on the fire, so typing is never a write per keystroke. The composer watches the published media, restores that media's draft when it appears, and treats a second change as a fresh wait.
- **A restore shows the difference before it moves anything.** `DraftRestore` carries the instant the typed time meant when the draft was saved and the instant it means now. When they differ, the screen names both ("The time you typed is … here. The draft was saved for …. Which one did you mean?") and offers **Keep the time I typed** or **Use the saved time**; the second rewrites the date and time fields to the saved instant's wall clock. The typed value is never replaced on its own.
- **A time the clock no longer has is refused, as on the publish path.** The form's existing skipped-hour message shows under the field and the Schedule button stays off, so a restored draft whose time fell into a spring-forward gap cannot be published until the admin picks another time.
- **The time field had to become replaceable.** `TextFormField.initialValue` only applies when the field is first built, so a restored or re-chosen time would have left the old text in the box. The date and time fields now sit under a `ValueKey` of their value, so a changed value rebuilds the field while the stable key stays on the input for the tests.
- **The draft is dropped when it has done its job.** After a run where every target ended published or scheduled, `PublishController` deletes the draft; a run with a failed target keeps it, because the admin may want to try again. The **Discard draft** button deletes it and empties the form. An emptied form deletes the draft rather than writing an empty one.
- **A draft failure never reaches the screen.** `LocalDraftsRepository` (`lib/features/offline/data/drafts_repository.dart`) catches every failure — a missing support folder, an unreadable file — logs the type and no content, and answers "no draft". The store is opened once, lazily, and closed when the provider is disposed.
- **Not yet: the offline publish gate.** The Publish button's "a connection is needed" state needs the connectivity kind that 5.5 introduces, so it lands there and is verified in 5.6.
- **Tests:** 20 new — store 8 (`draft_store_test.dart`: the full round trip across a close and a reopen, one draft per media, two media apart, delete one, no draft, a non-database file left on disk, a newer database untouched, the empty-form rule), repository 3 (`drafts_repository_test.dart`: save/load/delete, a missing support folder, a file that is not a database), page 9 (`publish_page_test.dart` group "a draft": restored with its caption, the 800 ms wait, a second change restarting it, discard, deleted after a clean run, kept after a failure, the moved time and both answers, the skipped time refused).
- **Verification:** `dart format --set-exit-if-changed lib test integration_test` clean (124 files), `flutter analyze lib test` no issues, `flutter test` **538 passed** (was 518).

### Phase 5.5 evidence (2026-10-29)

- **A failure carries its kind, not just a sentence.** `PostsErrorKind {connection, timeout, server}` sits on `PostsException` (`lib/features/publishing/data/posts_repository.dart`). `HttpPostsTransport` answers `connection` on `IOException`, `timeout` on `TimeoutException`, and leaves `server` for a non-2xx answer — so only a call that never reached the server can mean offline (SPEC-offline Decision 2).
- **The state comes from the calls the app already makes.** `ConnectivityController` (`lib/features/offline/connectivity.dart`) starts online and moves only on evidence. `ReportingTransport` wraps the posts transport, calls `reached()` on an answer and `lost()` on a connection failure, and is installed as `postsTransportProvider` (`lib/features/offline/offline_providers.dart`), so the queue and the calendar both report without a single extra request. Nothing polls (Decision 1).
- **A publish reports too.** `PublishController` marks the app offline when a publish fails with `PublishErrorCode.network` and online for any other outcome (`lib/features/publishing/publishing_controller.dart`), because the publish path does not go through `PostsTransport`.
- **A read is merged, not replaced.** `CacheStore.savePosts` became `mergePosts` (`lib/features/offline/data/cache_store.dart`): it upserts the rows it was given, trims to 500 in queue order and moves `last_read_at`, inside one transaction. A queue page is one status, and a calendar read is one month, so replace semantics would have shrunk the snapshot to whichever slice was read last and shown a misleading empty screen. A failed read still writes nothing.
- **The cache answers in the same shape the server did.** `PostsCache` / `LocalPostsCache` (`lib/features/offline/data/posts_cache.dart`) reads and writes `cache.db`, opens it once, and swallows every failure — logging the type only, never a path or a caption — so a broken cache never takes a screen down.
- **Only a connection failure falls back to the cache.** Both controllers catch `PostsException`, ask `_cached` only when `kind == connection`, and otherwise keep the error screen with its reason and **Try again** — a timeout says the server was reached, and showing stale rows then would hide a real fault. Cached rows are filtered again by the queue's status and platform and by the calendar's visible range, and `hasMore` is false so an offline page cannot claim there is more on the server.
- **The banner says what is on screen and when it was read.** `OfflineBanner` (`lib/features/offline/presentation/offline_banner.dart`) reads "No connection. Showing what was saved on this machine, last read at HH:MM." with a **Try again** that invalidates the controller. The empty states split too: a cache that has never been written says "Nothing was saved on this machine yet." rather than "no posts", so an empty screen offline is never mistaken for an empty queue.
- **Coming back online reads again.** Both controllers `ref.listen` the connectivity state and `invalidateSelf` on the offline → online edge when the screen is showing saved rows and not already loading, so the banner and the rows are replaced by a fresh read. A provider that is still loading is left alone, so a reconnect cannot cut a read short.
- **The Publish button is off offline, and says why.** `canPublishProvider` (`lib/features/publishing/publishing_providers.dart`) also requires `connectivityProvider != offline`; the blocked line reads "A connection is needed to publish." instead of "Sign in required to publish." (`publish_page.dart`), so the reason matches the cause. The controller still refuses on its own, so the gate cannot be bypassed by the form.
- **Riverpod 3 pauses a provider's listeners when nothing listens to the provider.** The reconnect tests kept seeing the cached rows until they held the controller open with `container.listen(queueControllerProvider, (_, _) {})`. That is a property of the framework, not of the code, and it is now written into the tests so the next reconnect test does not lose a day to it.
- **What this slice does not do, on purpose.** An edit or a delete did not write the cache yet when this slice landed; the Phase 5.6 gate found that the spec asks for it, and the write path now updates the cache (below). The `accounts`, `videos` and `profile` tables remain deferred to migration 2+ (decided in 5.3), so the cache holds the posts snapshot only. The wipe-on-sign-out (Decision 8) has no sign-out action to hang on until 6.1. The "Home" numbers are still read live, for the same missing tables.
- **Tests:** 26 new — transport 2 (a timeout means the server was reached; an error status is not offline), connectivity 5 (`connectivity_test.dart`: start, reached, connection, timeout, error), cache 1 net (`mergePosts` keeps rows it did not name and replaces the ones it did), cache wrapper 3 (`posts_cache_test.dart`: round trip, never written, corrupt file renamed with its bytes kept), queue controller 4 (merged read, cached fallback with `savedAt`, cached rows follow filter and platform, reconnect reads again), calendar controller 4 (merged month, cached month without September or no-time rows, timeout keeps the reason, reconnect reads again), queue page 2 (banner and rows, Try again), calendar page 1 (cached month), publish controller 2 (network failure goes offline, a refused platform stays online), publish page 1 (offline disables Publish and says why).
- **Verification:** `dart format --set-exit-if-changed lib test integration_test` clean (130 files), `flutter analyze lib test` no issues, `flutter test` **564 passed** (was 538), LF-only bytes checked on all 25 changed Dart files.

### Phase 5.6 gate evidence (2026-10-29)

- **Timezone/DST.** `test/core/time/time_zone_test.dart` (8 tests): a skipped hour refused with the jump named, a repeated hour resolved to the first, an ordinary time, a zone without daylight saving, one wall clock in two zones, a resolve that round-trips, the machine's zone, and the offset label. The scheduling screens pin the same rules through the seam (`post_edit_test.dart`, `publish_page_test.dart`), so the gate does not depend on the machine's zone.
- **Cache migration and corruption.** `local_database_test.dart` (5): ordered steps and the version, applied steps skipped, a throwing step rolled back, no `meta` table means version zero, and a row that survives a reopen. `cache_store_test.dart` (14): the version inside the file, the full-field round trip across a reopen, the 500-row bound and nulls last, merge semantics, a newer file left untouched, a broken file renamed with its bytes kept, and two breaks in one minute.
- **Draft round-trip and restart.** `draft_store_test.dart` reads the whole draft back after a close and a reopen, and `publish_page_test.dart` restores it when the screen opens, including the moved-time question and the skipped-hour refusal. `drafts_repository_test.dart` covers a missing support folder and a file that is not a database, in both cases without losing the file.
- **Offline cannot publish.** `canPublishProvider` needs the connection as well as both tokens, the screen shows "A connection is needed to publish." (`publish_page_test.dart`), and the controller refuses on its own — a publish attempt offline fails with `network` and never writes a row.
- **Data-loss review found two gaps, both fixed.**
  - **The cache did not follow a write.** SPEC-offline "The cache" says a row the client wrote is updated in the cache immediately, but `PostsCache.save`/`remove` had no caller. An edit now writes the row it just saved, a delete drops it, and a delete the server refused leaves the cache alone (`post_actions.dart`, 3 widget tests).
  - **A cancel could delete a row the publisher had claimed.** `delete` named only the id, so a scheduled row that moved to `processing` while the confirmation was open would still be deleted — a post that may already be going out. `delete` now takes `onlyIf`, the dialog passes the status it showed, and the repository filters on it as the edit path already did (1 repository test, 1 widget assertion).
- **Data-loss review, the rest.** A draft is deleted only when every target wrote its row, and kept on any failure; **Discard** is the only other delete and it is explicit. A corrupt cache file is renamed, a newer one is untouched, and the 500-row bound only drops rows the server still has. The edit is a compare-and-set, so a form open over a moved row cannot overwrite it.
- **One accepted window.** Draft autosave waits 800 ms, so leaving the media within that window loses the last keystrokes — the same window a crash has, which is the approved debounce and not a gate defect. Recorded so it is a decision, not a surprise.
- **Scoped `ponytail-audit`, no Must-fix left.** The one dead API (`PostsCache.save`/`remove`) is now used. The two controllers share the same fallback shape (load cache, filter, mark `savedAt`) and the same reconnect listener; with two call sites an extraction would hide the async fallback behind a helper for no reader gain, so it stays. `LocalPostsCache` deliberately mirrors `LocalDraftsRepository` (open once, swallow, log the type only), which is how the codebase already does it. No unused import, provider or test helper was left behind.
- **Verification:** `dart format --set-exit-if-changed lib test integration_test` clean (130 files), `flutter analyze lib test` no issues, `flutter test` **568 passed** (was 564), `flutter build windows --release` succeeds, LF-only bytes on every changed Dart file.
- **Owner approval: given 2026-10-29.** The gate is closed and Phase 5 is complete.
- **Still open, by design:** the cache wipe on sign-out (needs the sign-out action from 6.1), the `accounts`, `videos` and `profile` tables (migration 2+), and the Home numbers that wait on them.

---

## Phase 6 — Production Hardening

- [ ] **6.1** Settings: account, logout, version, update, log location, about
  - [ ] Approve `docs/spec/SPEC-settings.md` (7 decisions)
  - [ ] The screen at `/settings`: account, session, updates, diagnostics, about
  - [ ] One version provider shared with Home; the manual update check
  - [ ] Sign out: clear the session, wipe `cache.db`, keep `drafts.db`
  - [ ] The log folder and **Open folder**
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
