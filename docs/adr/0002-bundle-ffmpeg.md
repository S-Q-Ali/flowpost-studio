# ADR 0002: Bundle an LGPL FFmpeg build for local media processing

**Status:** Proposed (2026-10-28)
**Module:** `media`
**Deciders:** project owner

## Context

The native Windows client must probe, normalize, thumbnail, and extract audio/frames from local video without a browser. The web app does this with `<video>`, canvas, and `AudioContext` (`src/lib/captions.ts`); none of those exist in Flutter desktop. Supabase edge functions cannot run FFmpeg, and adding a media backend is outside the MVP boundary.

Constraints:

- Windows 10/11 x64, self-contained installer, no system FFmpeg requirement.
- The client must stay distributable without putting the whole app under GPL.
- H.264 is the reliable upload format for YouTube, Meta, TikTok, and LinkedIn.
- The admin machine may have no discrete GPU, so encoding cannot depend on hardware.
- The installer is unsigned and per-user; size matters but has no hard cap.

## Decision

1. **Bundle BtbN FFmpeg 8.1 LGPL shared for win64.**
   `ffmpeg-n8.1-latest-win64-lgpl-shared-8.1.zip`, pinned by SHA-256
   `092B5E24B2247A93AAC5307507FEEE412C7DC8548D6AA94E8CCAAEF3A3B1ADB5`
   (81,640,498 bytes, downloaded 2026-10-28). The fetch script rejects a mismatch.
2. **Ship only what runs:** `ffmpeg.exe`, `ffprobe.exe`, seven runtime DLLs, and
   `LICENSE.txt` — 161.2 MB uncompressed, 9 files. Exclude `ffplay.exe`, headers,
   import libraries, and presets.
3. **Install path:** `{app}\ffmpeg\bin\`. Runtime resolves it relative to the running
   executable. `FLOWPOST_FFMPEG_DIR` overrides it for development and fixture tests only.
4. **Invoke as a separate process, never a shell.** `Process.start` with an argument
   list, `-nostdin -hide_banner`, `-progress pipe:1`; stderr is captured into a bounded
   buffer for error messages.
5. **Encode H.264 with `libopenh264`** (software, deterministic), `yuv420p`, output
   Constrained Baseline. Hardware encoders (`h264_mf`, `nvenc`, `qsv`, `amf`) are not
   used in v1: their availability and output vary per machine.
6. **Audio:** AAC-LC through the native `aac` encoder; transcription audio is MP3 via
   `libmp3lame`; thumbnails/frames are MJPEG. All are in the LGPL build.
7. **LGPL compliance:** keep the libraries as separate, replaceable DLLs; ship the
   build's `LICENSE.txt`; state the FFmpeg version and source link in About/notices;
   make no FFmpeg modifications. The build is `--enable-version3 --enable-shared` with
   no `--enable-gpl`, `libx264`, or `libx265`.
8. **Do not commit binaries.** `tool/fetch_ffmpeg.ps1` downloads, hash-checks, and
   extracts into `third_party/ffmpeg/`, which is gitignored. The installer packages that
   folder.

## Licensing notes

- The build is LGPL v3 (`LICENSE.txt` verified); OpenH264 is BSD-2-Clause. Distribution
  of the binaries is permitted with the LGPL notices and replaceable DLLs.
- **Patent risk is separate from copyright.** Cisco's royalty-free H.264 binary license
  covers binaries obtained from Cisco, not a third-party build of OpenH264. This MVP is
  installed internally by the owner, so the risk is accepted for now. Before public
  distribution, the owner must choose: obtain patent coverage, ship hardware-only
  encoding through Windows Media Foundation, or license an encoder. This is a release
  blocker, not a Phase 3 blocker.
- The installer remains unsigned; SmartScreen warnings are already a known v1 constraint.

## Size evidence

| Item | Size |
|---|---|
| Upstream zip | 77.9 MB (81,640,498 bytes) |
| `bin/` without `ffplay.exe` | 161.2 MB, 9 files |
| `bin/` with `ffplay.exe` | 179.0 MB, 10 files |
| Installer growth | to be measured in 3.3; expected 55–75 MB compressed |

## Alternatives rejected

| Option | Why not |
|---|---|
| System FFmpeg on `PATH` | Absent on clean Windows; version and codec drift; support burden |
| GPL full build (e.g. gyan.dev) | Requires `libx264`/`libx265`; distributing it puts the app under GPL |
| Static LGPL build | Same size as one large exe; harder to replace libraries for LGPL compliance |
| FFmpegKit / mobile wrappers | Retired upstream; no Windows desktop target |
| Windows Media Foundation only | No parity for VP9/WebM/AV1; GPU- and driver-dependent; weak probe support |
| WebView or browser video APIs | Not self-contained; codec support varies; no clean frame/audio extraction path |
| Cloud transcoding | Adds a backend service, violating the MVP constraint |

## Consequences

- Installed footprint grows by ~161 MB; installer grows by roughly 60–80 MB.
- Encoding is CPU-bound. A 3-minute 1080p clip can take minutes; progress and
  cancellation are mandatory.
- A bundled `ffmpeg.exe` launched from `%LOCALAPPDATA%` may attract antivirus heuristics;
  signing is deferred with the rest of release hardening.
- FFmpeg updates are deliberate: bump the URL, update the hash, re-run fixtures, and
  re-check the license.
- BtbN's `latest` URL is rolling and an old build can age out. Keep a local copy of the
  pinned zip (hash-named) in `third_party/cache/` so builds stay reproducible after an
  upstream rotation; the cache is gitignored.
- Paths with spaces or non-ASCII characters must keep working; fixtures include both.

## Verification (2026-10-28)

- `ffmpeg -version`: `n8.1.3-24-g92611900bb-20261027`, `--enable-version3 --enable-shared`,
  no `--enable-gpl`, `--disable-libx264 --disable-libx265`.
- `libopenh264` encode of `portrait_2s_1080x1920_h264.mp4`: exit 0; output H.264
  Constrained Baseline level 4.0, 1080×1920, `yuv420p`, 2.005 s, 997.6 KB; full decode
  round-trip exit 0.
- `ffprobe` JSON produced the expected metadata for every fixture; `corrupt.mp4` exits 1.
- Frame extraction at 2 s / 3 s / 4 s on the 6 s fixture produced three distinct JPEGs.
- Audio extraction to 16 kHz mono MP3 and 640×360 JPEG thumbnails both succeed.
- The LGPL build has no `libx264`; fixture generation uses the system GPL build or
  `libopenh264`.

## Open questions

- Public-distribution patent position (owner).
- Measured installer growth after packaging (3.3).
- Whether to prefer `h264_mf` for speed on GPU machines after the MVP.
