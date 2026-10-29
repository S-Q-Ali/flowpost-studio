# Spec: `media` — Local Media Pipeline

**Module:** `media` (see `docs/spec/flowpost-native-capability-map.md`)
**Status:** Proposed 2026-10-28 (Phase 3.1); implementation in 3.2–3.5
**Depends on:** `shell`; real caption/upload calls depend on `identity` (deferred)
**Blocks:** `publishing`, `scheduling`
**ADR:** `docs/adr/0002-bundle-ffmpeg.md`

---

## Objective

Let the admin pick one local video or image, validate it, normalize it for social upload, and produce the thumbnail, caption frames, and transcription audio that the existing web pipeline produces. Processing runs locally through the bundled FFmpeg so the screen works without a browser or backend.

**User:** the FlowPost admin on Windows 10/11 x64, using the app without a login gate (owner override).

**Success looks like:** a supported fixture goes from picked to ready on a clean install; a corrupt or unsupported file gets a clear message instead of a crash; the UI stays responsive and can cancel; no temporary output survives a cancel or a restart; no secret, full path, or media content is logged.

## Scope

In:

- Pick one video or image with the native Windows file picker.
- Validate by extension, size, duration, and a real `ffprobe` read.
- Probe duration, dimensions, codecs, pixel format, frame rate, and audio presence.
- Normalize video to MP4 (H.264/AAC, `yuv420p`, ≤1920 px, faststart).
- Generate a 640×360 thumbnail, three caption frames, and mono transcription audio.
- Per-job workspace with deterministic cleanup and crash recovery.
- Typed clients and mocked contract tests for `generate-ai-captions` and `upload-local-file`.
- Progress, cancel, retry, and readable errors.

Out:

- Batch/folder import, trimming, cropping, filters, subtitles, transitions.
- Multiple simultaneous jobs (one active job at a time).
- Hardware encoders and HDR/10-bit output.
- Real caption or upload calls, OAuth, publishing, scheduling (deferred with identity).
- Resumable jobs after an app restart.
- Files above 100 MB or videos longer than 180 seconds.

## Formats and limits

| Kind | Extensions (case-insensitive) | Limits |
|---|---|---|
| Video | `.mp4`, `.m4v`, `.mov`, `.webm`, `.mkv` | ≤100 MB, >0 s and ≤180 s, one decodable video stream, ≤33.2 MP per frame |
| Image | `.jpg`, `.jpeg`, `.png`, `.webp` | ≤100 MB, decodable, ≥1×1 px, ≤33.2 MP per frame |

- The extension list is a fast filter; `ffprobe` is authoritative. A wrong extension still works if FFmpeg can decode it; a supported extension with no decodable stream is rejected.
- Decoders available in the bundled LGPL build include H.264, HEVC, VP9, AV1, MPEG-4, AAC, MP3, Opus, and PCM. HEIC/AVIF and DRM-protected files are not supported in v1.
- Audio is optional. A silent video still produces a thumbnail and caption frames; the transcript is empty.
- The 100 MB and 180 s caps are deliberately below the web's 200 MB input gate: `upload-local-file` buffers the whole multipart body in a 256 MB worker. Raising them requires the presigned direct-to-R2 path described under **Upload contract**.
- A 180 s video normalized at 4 Mbps is ~90 MB, which stays under the upload ceiling.
- The 33.2 MP pixel cap (8K) bounds what the decoder allocates. A crafted image declares its resolution in a few bytes and the decoder allocates the whole frame before touching a pixel, so the size of a file is not a bound on its memory cost.

## Model

```dart
enum MediaKind { video, image }
enum MediaStage {
  picked, probing, ready, processing, readyToUpload, uploading, done, failed, cancelled,
}

class MediaProbe {
  final Duration duration;
  final int width;
  final int height;
  final String videoCodec;
  final String? audioCodec;
  final String pixelFormat;
  final double fps;
  final int? bitrate;
  final bool hasAudio;
}

class MediaJob {
  final String id;
  final String sourcePath;   // absolute, never logged
  final String displayName;  // basename for UI
  final MediaKind kind;
  final int sourceBytes;
  final MediaProbe probe;
  final String workspacePath;
  final MediaOutputs? outputs;
  final MediaStage stage;
}
```

`MediaOutputs` holds fixed paths for `normalized.mp4`, `thumb.jpg`, `frame_1..3.jpg`, and `audio.mp3`. Missing outputs are `null`, not empty strings.

## Pipeline

1. **Pick** — `file_selector` with the extension filter above. Empty selection is a no-op.
2. **Pre-check** — exists, regular file, readable, non-zero, ≤100 MB, allowed extension.
3. **Probe** — `ffprobe -v error -print_format json -show_format -show_streams -protocol_whitelist file -- <source>` with a 30 s timeout. Parse strings and rationals defensively; reject missing or zero duration/dimensions.
4. **Workspace** — create the per-job folder only after validation passes.
5. **Normalize** — video only (see below). Images pass through unchanged.
6. **Outputs** — thumbnail, caption frames, audio.
7. **Ready** — show metadata, thumbnail, and actions. Captions and upload stay disabled until identity exists.

Processing runs on one job at a time. FFmpeg work happens in a separate process; the Dart isolate only reads progress and never blocks the UI.

## Video normalization

Compliant source (MP4/MOV/M4V, H.264 video, no audio or AAC, `yuv420p`, both dimensions ≤1920, duration ≤180 s) is remuxed without re-encoding:

```
ffmpeg -hide_banner -nostdin -y -protocol_whitelist file -i <source> \
  -map 0:v:0 -map 0:a:0? -c copy -movflags +faststart -map_metadata -1 -map_chapters -1 <out>
```

Anything else is encoded:

```
ffmpeg -hide_banner -nostdin -y -protocol_whitelist file -i <source> \
  -map 0:v:0 -map 0:a:0? \
  -vf "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2" \
  -c:v libopenh264 -b:v 4M -maxrate 5M -bufsize 8M -pix_fmt yuv420p -g 60 \
  -c:a aac -b:a 128k -ar 48000 \
  -movflags +faststart -map_metadata -1 -map_chapters -1 -progress pipe:1 -nostats <out>
```

- No upscaling; aspect ratio preserved; output dimensions forced even.
- Frame rate is preserved up to 60 fps; no frame-rate conversion in v1.
- Rotation metadata is honored: re-encodes autorotate and drop the tag; remuxes keep the tag so players still rotate correctly.
- HDR/10-bit sources are converted to 8-bit `yuv420p`; colors may shift (documented limitation).
- Remux failure falls back to one encode attempt.
- If the source has no audio, the `-c:a` options are harmless and no audio stream is written.
- All commands use argument lists and the fixed `file` protocol allowlist; no shell and no user-controlled filter strings.

## Thumbnail, frames, audio

**Thumbnail** — at `min(1 s, duration / 2)`, 640×360, letterboxed, JPEG quality ~6:

```
ffmpeg -hide_banner -nostdin -y -protocol_whitelist file -ss <t> -i <source> \
  -frames:v 1 \
  -vf "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:color=black" \
  -q:v 6 -map_metadata -1 -map_chapters -1 <thumb.jpg>
```

**Caption frames** — timestamps match the web (`src/lib/captions.ts`): `min(2, d/2)`, `d/2`, `max(d-2, d/2)`. For a 2 s clip all three land at 1 s (same as web). Images produce one frame. Longest side is 640 px, aspect preserved; this intentionally avoids the web's 640×360 stretch that distorts portrait video.

```
ffmpeg -hide_banner -nostdin -y -protocol_whitelist file -ss <t> -i <source> \
  -frames:v 1 -vf "scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2" \
  -q:v 6 -map_metadata -1 -map_chapters -1 <frame_n.jpg>
```

**Audio** — only when an audio stream exists; 32 kbps MP3, 16 kHz, mono (3 minutes ≈ 720 KB, ≈960 KB base64):

```
ffmpeg -hide_banner -nostdin -y -protocol_whitelist file -i <source> \
  -map 0:a:0 -vn -c:a libmp3lame -b:a 32k -ar 16000 -ac 1 \
  -map_metadata -1 -map_chapters -1 <audio.mp3>
```

**Progress** — parse `out_time_us` from `-progress pipe:1`, clamp to duration, emit at most 4 updates per second. `progress=end` sets 100%. Thumbnail/audio/frame steps are short and may report only start/finish.

**Cancel/timeout** — `kill()` the FFmpeg process and wait up to 2 s; a job is abandoned after 10 minutes per FFmpeg operation and after 15 minutes for the whole job. Cancellation deletes the workspace. No orphan process may remain.

## Workspace and cleanup

Root: `getApplicationCacheDirectory()/media/jobs/`, which maps to
`%LOCALAPPDATA%\com.flowpost\FlowPost\media\jobs\` on Windows.

```
<jobId>\
  normalized.mp4   (video only)
  thumb.jpg
  frame_1.jpg
  frame_2.jpg
  frame_3.jpg      (one frame for images)
  audio.mp3        (only when audio exists)
```

- `jobId` is generated internally: `yyyyMMddTHHmmss-<6 hex>`. Output names are fixed; nothing user-supplied becomes a path.
- The source file is never copied, moved, or deleted. FFmpeg reads it in place.
- The folder is deleted on upload success, cancel, picking another file, leaving the Upload page, and app start.
- A processing/caption/upload error keeps the folder so the action can be retried. Picking another file or restarting removes it.
- At startup, delete every child of `jobs/` (v1 does not resume). Locked files get one retry after 250 ms; a still-locked folder is left for the next start and logged by job id only.
- A quit during processing kills the process first, then best-effort deletes. Startup handles anything left.
- Cleanup refuses to delete a path that does not resolve inside the jobs root.

## Captions contract

Both steps call the existing function through `AppConfig.supabaseUrl`; no API key is stored or sent by the client.

`POST /functions/v1/generate-ai-captions`
Headers: `Content-Type: application/json`, `Authorization: Bearer <session token>` (deferred).

1. **Transcribe** (skip when no audio):

```json
{ "mode": "groq-transcribe", "audio_base64": "<base64 mp3>", "filename": "audio.mp3" }
```

Response: `{ "transcript": "..." }`.

2. **Describe frames**:

```json
{
  "mode": "groq-chat",
  "model": "qwen/qwen3.6-27b",
  "messages": [{ "role": "user", "content": [
    { "type": "text", "text": "<same analysis prompt as src/lib/captions.ts>" },
    { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }
  ]}],
  "temperature": 0.6,
  "max_tokens": 512
}
```

3. **Generate captions**:

```json
{
  "mode": "groq-chat",
  "model": "openai/gpt-oss-120b",
  "messages": [
    { "role": "system", "content": "<default master prompt as JSON + platform hint>" },
    { "role": "user", "content": "Audio transcript:\n\n...\n\nVisual description:\n\n..." }
  ],
  "temperature": 0.7,
  "max_tokens": 4096
}
```

- The default master prompt and platform→key mapping mirror `src/lib/prompt-templates.ts` and `src/lib/captions.ts`. The native copy lives in one Dart file; do not fork the prompt text.
- Parse `choices[0].message.content`; strip ```` ``` ```` fences; parse JSON; drop keys not allowed for the selected platforms.
- Progress stages: preparing, transcribing, analyzing visuals, generating captions, done.
- Until identity exists, the action is disabled with "Sign in required" and the contract is covered by mocked tests only.

## Upload contract

`POST /functions/v1/upload-local-file`
Headers: `Authorization: Bearer <session token>` (deferred).
Body: `multipart/form-data` with one `file` field containing `normalized.mp4` (or the original image).

Response:

```json
{ "success": true, "videoId": "uuid", "url": "https://...", "filename": "clip.mp4", "size": 12345 }
```

- Progress comes from a byte-counting stream wrapper; the request is cancellable.
- 100 MB client cap, matching the worker's memory budget.
- Until identity exists, the action is disabled and covered by mocked tests only.
- **Duplicate-free retry requires one backend change, deferred to 3.5:** add an optional `idempotency_key` to `upload-local-file`; use it in the R2 key (`<userId>/<idempotency_key>.<ext>`) and return the existing `videos` row when that URL already exists. Without it, a retry after an ambiguous failure creates a new object and row.
- Files above 100 MB require presigned direct-to-R2 upload (client PUT + finalize call), which is out of scope for v1.

## UI

- **Empty:** "Choose a video or image", supported formats, 100 MB / 3 minute limits, keyboard-focusable button.
- **Picked/processing:** file name, size, dimensions, duration, stage label, determinate progress, **Cancel**.
- **Ready:** thumbnail, probe summary, output list, **Generate captions** and **Upload** (both disabled with "Sign in required"), **Choose another file**.
- **Failed:** readable message, **Try again**, **Choose another file**.
- Errors never replace the whole page and never dump FFmpeg stderr.
- Layout works at 1024×640 and 1.6× text; controls have labels and visible focus.
- Progress is stated in text, not color alone.

## Error states

| Condition | Behavior |
|---|---|
| Extension not allowed | "Unsupported file type…" before any work |
| Size >100 MB | "File is too large (max 100 MB)." |
| Duration 0 or >180 s | "Videos must be 3 minutes or shorter." |
| Corrupt / unreadable / fake extension | "This file can't be read. It may be damaged." |
| No video stream | "No video track found." |
| Resolution over 33.2 MP | "This file's resolution is too large to process." |
| No audio stream | Continue; note captions use visuals only |
| Disk full / permission denied | "Couldn't write temporary files. Check free space and try again." |
| FFmpeg non-zero exit | Short sanitized reason + **Try again** |
| Cancelled | Back to empty/picked; workspace deleted; no error |
| Operation timeout | "Processing took too long and was stopped." |
| Caption/upload without session | Disabled action labeled "Sign in required" |
| Network/HTTP error | Status-aware message; retry keeps local outputs |

## Security and privacy

- Fixed argument lists, `-protocol_whitelist file`, no shell, no user-controlled filters or output paths.
- The outputs carry no metadata and no chapters from the source, so nothing about the picked file travels into the upload.
- The bundled FFmpeg keeps the ISO-BMFF external-track option off, so a demuxer chosen by the content cannot read a file outside the picked one (ADR 0002).
- Picker paths are only passed as arguments; logs contain job id, stage, byte counts, duration, dimensions, exit code, and sanitized error code — never the full path or media content.
- Temp files live under the user's `%LOCALAPPDATA%` and inherit its ACL.
- Cleanup is confined to the jobs root.
- The client never stores or sends provider API keys; the Supabase anon key is public and the session token stays in secure storage (deferred).
- No service-role key is used anywhere in the client.

## Testing

| Level | Scope | Location |
|---|---|---|
| Unit | Extension/size/duration validation, probe parsing, frame timestamp math, scale math, cleanup guard, idempotency-key format | `test/features/media/` |
| Integration | Real FFmpeg on all fixtures: probe, remux, encode, thumbnail, 3 frames, audio, corrupt error, Unicode path, cancel leaves no process | `test/features/media/ffmpeg/` |
| Widget | Pick, processing, cancel, ready, error, disabled auth actions, 1.6× text at 1024×640 | `test/features/media/` |
| Contract (mocked) | Transcribe request/response, frames request, caption parse/filter, upload multipart + retry key | `test/features/media/` |
| Manual | 100 MB file, cancel mid-encode, kill app mid-job, restart cleanup, installed build | Recorded in `tasks/todo.md` |

Fixture expectations live in `test/fixtures/media/expected.json`. Integration tests locate FFmpeg from `FLOWPOST_FFMPEG_DIR` or `third_party/ffmpeg/bin`; they fail with a clear setup message rather than skipping silently.

## Success criteria

1. Every committed fixture probes to the values in `expected.json`; `corrupt.mp4` and `unsupported.txt` are rejected with the messages above.
2. Normalized output is MP4, H.264 (`yuv420p`, ≤1920 px), AAC when audio exists, and `+faststart`; it plays in Windows.
3. Thumbnail is 640×360; three distinct frames appear for the 6 s fixture; audio is 16 kHz mono MP3; a silent file still completes.
4. The UI stays responsive during a 3-minute encode; cancel kills FFmpeg and removes the workspace within 2 s.
5. A killed app leaves no resumable state; the next start deletes stale job folders.
6. Logs contain no full paths, media content, tokens, or keys.
7. `flutter analyze`, formatting, unit/widget/integration tests pass with the bundled FFmpeg.
8. Caption and upload clients pass mocked contract tests; live calls remain deferred.

## Deferred with identity

- Real session token, `Authorization` headers, and live caption/upload calls.
- Idempotent retry change in `upload-local-file`.
- Presigned direct-to-R2 upload for files above 100 MB.
- Audio chunking for videos longer than 3 minutes.
- Platform-specific crops, HDR tone mapping, hardware encoding, batch jobs.

## Open questions

- Public-distribution H.264 patent position (ADR 0002).
- Whether 100 MB / 3 minutes matches the owner's real input material.
- Installing/updating FFmpeg: fetch script cache location and update procedure (3.3).
- Upload idempotency response shape and whether R2 orphan cleanup needs a scheduled job (3.5).
