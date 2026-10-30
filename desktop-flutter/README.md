# FlowPost Studio — Native Windows Shell

Flutter Windows client for FlowPost Studio. The shell provides the window,
tray, single instance, `flowpost://` links, logging, config and theme; the
Accounts screen manages the six publish targets locally, the Upload screen
picks a local video or image and processes it with a bundled FFmpeg, and the
Queue, Calendar, Compose, Drafts and Settings screens cover publishing and
scheduling, including an offline cache and local drafts. An Inno Setup
installer ships the app.

Windows 10 1809+ / Windows 11, x64 only.

## Toolchain

| Tool | Version used |
|---|---|
| Flutter | 3.47.8 (stable) |
| Dart | 3.13.7 |
| Visual Studio | C++ desktop development workload |
| Inno Setup | 6 (`%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe`) |

`pubspec.lock` pins package versions.

## FFmpeg

Media processing needs the bundled FFmpeg build. Fetch it once before running
the media tests or packaging the installer:

```powershell
tool\fetch_ffmpeg.ps1
```

The script downloads the pinned LGPL build, verifies its SHA-256, keeps only
the files that ship, and refuses a build that is GPL or carries `libx264`.
The result lands in `third_party\ffmpeg\bin` (gitignored); the installer
packages it as `{app}\ffmpeg\bin`, and the app resolves it next to its own
executable. `FLOWPOST_FFMPEG_DIR` overrides the lookup for development and
fixture tests.

## Configure

`config/dev.json` is gitignored. Start from the template:

```powershell
Copy-Item config\dev.example.json config\dev.json
```

Fill in the Supabase project URL and **public anon/publishable** key. Never put a
service-role or secret key in the client. `UPDATE_MANIFEST_URL` may stay empty
until release hosting exists.

Config is validated at startup: both Supabase values are required, URLs must be
HTTPS, and a service-role/secret key is rejected.

## Run

```powershell
flutter pub get
flutter run -d windows --dart-define-from-file=config/dev.json
```

## Test

```powershell
flutter analyze
dart format --set-exit-if-changed lib test integration_test
flutter test
flutter test integration_test -d windows --dart-define-from-file=config/dev.json
```

The media tests under `test\features\media\ffmpeg` run the real FFmpeg
against the committed fixtures and fail with a setup message when the build
is missing. They need `tool\fetch_ffmpeg.ps1` to have run.

`integration_test\app_test.dart` drives the real app on Windows: it launches
the shell, runs the pipeline over a fixture with the real FFmpeg, and cancels a
second job to prove no FFmpeg process outlives it. It lives in one file on
purpose — the shell takes a single-instance lock, so a second launch in the
same run would hand off and exit. Point it at the build explicitly:

```powershell
$env:FLOWPOST_FFMPEG_DIR = "$PWD\third_party\ffmpeg\bin"
flutter test integration_test -d windows --dart-define-from-file=config/dev.json
```

Quit the tray app before a build: Windows locks `cnativeapi.dll` while it runs.
Do not run `flutter test` and `flutter build` at the same time — they share
`build\unit_test_assets` and race over the compiled shaders.

## Build

```powershell
flutter clean
flutter build windows --release --dart-define-from-file=config/prod.json
```

Run `flutter clean` before a release build: Flutter caches the tree-shaken
Material icon font, so an incremental build after adding icons can keep the old
subset and render blank icons.

The executable is `build\windows\x64\runner\Release\flowpost.exe`.

## Installer

```powershell
& "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe" installer\flowpost.iss
```

Output: `..\dist-desktop\FlowPostNativeSetup.exe` (repository root).

The installer is per-user (no admin), installs under
`%LOCALAPPDATA%\Programs\FlowPost Studio`, adds a Start Menu entry (desktop
shortcut optional), and registers `HKCU\Software\Classes\flowpost`. Uninstall
removes the protocol entry. User data and logs are left in place.

v1 is **unsigned**. Windows SmartScreen shows "Windows protected your PC"; use
**More info → Run anyway** only for a build whose checksum you trust.

## Logs and data

- Data root: `%APPDATA%\com.flowpost\FlowPost`
- Local account state: `accounts.json` (platform, placeholder name, status only)
- Log: `%APPDATA%\com.flowpost\FlowPost\logs\app.log` (rotates to `app.log.1` at 1 MB)
- Media workspace: `%LOCALAPPDATA%\com.flowpost\FlowPost\media\jobs\<job-id>`
  (one folder per picked file; removed at startup and when the file is replaced)
- Media jobs are logged by id only; a path would leak the user's folders.
- Tokens, OAuth codes/states, and keys are redacted before writing.

The old Pake app uses a different data root and is not migrated.

## Deep link

The installed app registers `flowpost://`. Auth callbacks use:

```text
flowpost://auth-callback?code=...&state=...
```

Only `/` and `/auth-callback` are routed; unknown paths are rejected and logged
without their query string. A second launch hands its link to the running
instance and exits.

## Updates

v1 checks a JSON manifest manually; it does not auto-update. The placeholder
home screen shows the current version and, when configured, checks:

```json
{
  "version": "1.1.0",
  "downloadUrl": "https://example.com/FlowPostNativeSetup.exe"
}
```

Both fields are required; `downloadUrl` must be HTTPS. A newer version shows a
Download button that opens the URL in the system browser.

## Scope

In: shell, tray, single instance, deep links, installer, logging, update check,
local Accounts screen with six platform cards and persisted connect/disconnect,
Upload screen with a native file picker, extension/size/duration validation,
and local media processing (probe, normalize to MP4, thumbnail, caption frames,
transcription audio) through the bundled FFmpeg.

Out: identity, real platform OAuth/token exchange, caption generation, upload,
publishing, scheduling, offline data, workflows, insights, admin, silent
updates, MSIX, code signing, macOS/Linux/mobile.
