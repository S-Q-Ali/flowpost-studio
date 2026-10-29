# FlowPost Studio — Native Windows Shell

Flutter Windows client for FlowPost Studio. Phase 0 is the shell: window, tray,
single instance, `flowpost://` links, logging, config, theme, a placeholder home
screen, and an Inno Setup installer. Product modules (identity, accounts, media,
publishing, scheduling) land in later phases.

Windows 10 1809+ / Windows 11, x64 only.

## Toolchain

| Tool | Version used |
|---|---|
| Flutter | 3.47.8 (stable) |
| Dart | 3.13.7 |
| Visual Studio | C++ desktop development workload |
| Inno Setup | 6 (`%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe`) |

`pubspec.lock` pins package versions.

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

Quit the tray app before a build: Windows locks `cnativeapi.dll` while it runs.

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
local Accounts screen with six platform cards and persisted connect/disconnect.

Out: identity, real platform OAuth/token exchange, media, publishing, scheduling,
offline data, workflows, insights, admin, silent updates, MSIX, code signing,
macOS/Linux/mobile.
