# Spec: `shell` — FlowPost Native Windows Bootstrap

**Module:** `shell` (see `docs/spec/flowpost-native-capability-map.md`)
**Status:** Approved — implementation may start (2026-10-26)
**Created:** 2026-10-26
**Depends on:** none
**Blocks:** `identity`, and every later module

---

## Objective

Create the installable Flutter Windows application that every later module plugs into: a real window, tray, single-instance behaviour, `flowpost://` deep links, logging, configuration, theme, routing skeleton, and an Inno Setup installer. It ships with a placeholder home screen; no product features yet.

**User:** the existing FlowPost admin on Windows 10/11 x64.

**Why now:** the current Pake shell loads the deployed website. The native client must own its UI and startup so the rest of the rewrite has a foundation.

**Success looks like:** a signed-in user can install the app, launch it from the Start Menu, see FlowPost branding, close it to the tray, relaunch it without a duplicate process, and the app is ready for the `identity` module to mount a login screen.

## Assumptions (correct before implementation)

1. **Flutter stable 3.47.8 is installed at `E:\BuildTools\flutter`.** Task 0 verifies it via `flutter doctor -v` and records the exact version in `desktop-flutter/README.md`. Exact package versions are pinned by `pubspec.lock`.
2. **Visual Studio C++ desktop workload is available.** Rust MSVC builds already work here; `flutter doctor -v` confirms it before scaffolding.
3. **Inno Setup 6** produces the installer. If a code-signing certificate is unavailable, v1 ships unsigned and the SmartScreen warning is documented.
4. **Updates are manual in v1:** check a JSON manifest, show the version, and open the download URL. Silent auto-update is v1.1.
5. **Brand theme:** port the colour tokens from `src/index.css` (primary, background, surface, border) into a Material 3 `ColorScheme`; use Material 3 components everywhere else.
6. **App identity:** display name `FlowPost Studio`, package `flowpost_desktop`, identifier `com.flowpost.desktop`, protocol `flowpost://`, data root `%APPDATA%\com.flowpost\FlowPost\` (company metadata remains `com.flowpost` so the path stays stable).
7. **One window.** Close hides to tray; tray Quit exits. No multi-window.
8. **No WebView for app UI.** The only browser use is the system browser for OAuth in `identity`.
9. **Windows 10 64-bit 1809+ and Windows 11.** No macOS, Linux, or mobile.
10. **No secrets in the repository.** Supabase URL/key come from `--dart-define-from-file`; the anon key is not a service key.

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Language / UI | Flutter stable, Dart 3.x | Material 3, Windows desktop target |
| State | `flutter_riverpod` | Providers own config, API, and feature state |
| Routing | `go_router` | Placeholder routes for later modules |
| Window / tray | `window_manager`, `tray_manager` | Min size, centre, close-to-tray |
| Deep links | `app_links` | `flowpost://` registration and stream; spike in week 1 |
| Logging | `logging` + `path_provider` | Rotating file, no tokens |
| Version | `package_info_plus` | Version shown in Settings/About |
| Updates | `url_launcher` + JSON manifest | Manual check in v1 |
| Tests | `flutter_test`, `integration_test` | Unit + widget; manual Windows smoke |
| Installer | Inno Setup 6 | `.exe`, Start Menu shortcut, protocol registry entry |

Exact versions are chosen at scaffold time and locked in `pubspec.lock`. New dependencies need approval (see Boundaries).

## Commands

```powershell
# From the repository root
cd desktop-flutter
flutter pub get
flutter analyze
dart format --set-exit-if-changed lib test
flutter test
flutter run -d windows --dart-define-from-file=config/dev.json
flutter build windows --release --dart-define-from-file=config/prod.json
iscc installer/flowpost.iss
```

Build output: `desktop-flutter/build/windows/x64/runner/Release/flowpost.exe` (confirm the exact folder on first build). Installer output: `dist-desktop/FlowPostNativeSetup.exe`.

Repository-wide checks stay unchanged: `npm test`, `npm run build`.

## Project Structure

```
desktop-flutter/
  lib/
    main.dart                  # bindings, error handling, Supabase init later
    app.dart                   # MaterialApp.router + theme
    core/
      config/                  # AppConfig.fromEnvironment, validation
      router/                  # GoRouter, route names, deep-link mapping
      shell/                   # window, tray, single instance, lifecycle
      logging/                 # logger setup + rotation
      theme/                   # FlowPost ColorScheme, typography
      widgets/                 # shared shell widgets (error screen, splash)
    features/
      home/                    # placeholder screen for v1
  test/
    core/                      # config, deep-link parser, version check
    features/home/             # widget smoke tests
  integration_test/
    shell_test.dart            # launch + tray + deep link (Windows runner)
  windows/                     # generated Flutter runner
  installer/
    flowpost.iss               # Inno Setup script
    flowpost.ico               # generated from public/logo.png
  config/
    dev.example.json           # committed template, no real keys
  pubspec.yaml
  README.md                    # toolchain versions + commands
```

`config/dev.json` and `config/prod.json` are gitignored. `config/dev.example.json` documents the keys.

## Code Style

- `flutter_lints` defaults, plus `avoid_print` and `prefer_const_constructors`.
- Feature-first folders; one public widget/class per file.
- No `dynamic` in the API/config layer. Parse once at the boundary into typed models.
- Fail fast: invalid or missing configuration shows a readable error screen, never a silent default.
- One-line comments only for non-obvious decisions.

```dart
class AppConfig {
  const AppConfig({
    required this.supabaseUrl,
    required this.supabaseAnonKey,
    required this.updateManifestUrl,
  });

  final String supabaseUrl;
  final String supabaseAnonKey;
  final String updateManifestUrl;

  factory AppConfig.fromEnvironment() {
    const url = String.fromEnvironment('SUPABASE_URL');
    const anonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
    const manifest = String.fromEnvironment('UPDATE_MANIFEST_URL');
    if (url.isEmpty || anonKey.isEmpty) {
      throw const ConfigException('SUPABASE_URL and SUPABASE_ANON_KEY are required');
    }
    return AppConfig(supabaseUrl: url, supabaseAnonKey: anonKey, updateManifestUrl: manifest);
  }
}
```

## Testing Strategy

| Level | Scope | Command |
|---|---|---|
| Unit | `AppConfig` validation; deep-link parser (`flowpost://auth-callback?...` → route, unknown paths rejected); version comparison | `flutter test` |
| Widget | App boots to the placeholder home; error screen on bad config; tray menu builder returns Show/Quit | `flutter test` |
| Integration | Launch, second-instance focus, close-to-tray, deep-link delivery, clean shutdown | `flutter test integration_test -d windows` |
| Manual smoke | Installer install/uninstall, Start Menu shortcut, protocol registration, SmartScreen behaviour, cold start | `desktop-flutter/README.md` checklist |

No coverage percentage in v1; every new branch in the shell gets one test. Existing web tests must stay green.

## Boundaries

- **Always:** run `flutter analyze`, `dart format --set-exit-if-changed`, and `flutter test` before a commit; log without access tokens or keys; validate deep links against an allowlist of hosts/paths; keep `config/*.json` out of git.
- **Ask first:** adding a dependency; changing the installer, registry entries, or update manifest; code-signing configuration; CI changes; touching the Supabase backend.
- **Never:** place the service-role key or platform OAuth tokens in the client; disable RLS; use a WebView for app UI; commit secrets; remove or skip a failing test to get green.

## Success Criteria

1. `flutter doctor -v` reports no blocking issues for the Windows desktop target.
2. `flutter run -d windows` opens a 1280×800 window with FlowPost branding and no red screen.
3. `flutter analyze` reports zero issues; `flutter test` is green; formatting check passes.
4. A second launch focuses the existing window and exits the new process.
5. Close button hides to tray; tray **Show** restores; tray **Quit** exits.
6. `flowpost://auth-callback?code=...` opens or focuses the app and is handed to the router; an unknown `flowpost://` path is rejected and logged.
7. Logs are written to `%APPDATA%\com.flowpost\FlowPost\logs\app.log`; no token or key appears in them.
8. Inno Setup produces `FlowPostNativeSetup.exe`; install, Start Menu launch, and uninstall work; the protocol registry entry is removed on uninstall.
9. Update check shows the current version and opens the download URL when the manifest version is newer (manifest mocked in tests).
10. Cold start on this machine is under 3 seconds.

## Out of Scope

`identity`, `accounts`, `media`, `publishing`, `scheduling`, `offline` data, `workflows`, `insights`, `admin`; silent/automatic updates; MSIX; code signing (unless a certificate is provided); macOS/Linux/mobile; any new product feature.

## Resolved Questions (2026-10-26)

1. **Code-signing certificate:** v1 ships **unsigned**; the SmartScreen warning is documented. Revisit when a certificate is provided.
2. **Installer:** **Inno Setup `.exe`** as specified. No MSIX.
3. **Brand icon:** a dedicated `.ico` is **derived from `public/logo.png`** during scaffold and committed under `desktop-flutter/windows/runner/resources/`; used for exe, tray, and installer.

## Approval

Approved by the project owner on 2026-10-26 with the three decisions above. Implementation starts with Task 0: `flutter doctor -v` verification of the Windows desktop target, before any project scaffold.
