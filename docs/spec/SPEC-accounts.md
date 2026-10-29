# Spec: `accounts` — Connected Platform Accounts (local slice)

**Module:** `accounts` (see `docs/spec/flowpost-native-capability-map.md`)
**Status:** Local slice implemented 2026-10-28; real platform flow deferred with identity
**Depends on:** `shell`; real backend wiring depends on `identity` (deferred)
**Blocks:** `publishing`, `scheduling`

---

## Objective

Give the admin one place to see the six publishing/storage destinations and their connection state, and to connect or disconnect them. This slice builds the real screen and state handling against a local repository. Real OAuth/platform connections stay deferred until identity and dashboard access exist.

**User:** the FlowPost admin on Windows 10/11 x64, using the app without a login gate (owner override).

**Success looks like:** the Accounts tab shows six cards; connect/disconnect updates the card immediately; the state survives an app restart and reinstall; the app never crashes on a missing or corrupt local file; no secret is written anywhere.

## Scope

In:

- Six destinations: YouTube, Instagram & Facebook (Meta), TikTok, LinkedIn, Google Drive, MEGA.
- Status per destination: connected, disconnected, expired.
- Connect, disconnect, reconnect actions with error feedback.
- Local JSON persistence in the app data root.
- Loading, error, empty states; keyboard-reachable controls.

Out:

- Real OAuth, token exchange, token refresh, revocation.
- Supabase `connected_accounts` reads/writes and realtime updates.
- Publishing, uploads, scheduling, and account metadata (avatars, handles).

## Model

```dart
enum SocialPlatform { youtube, meta, tiktok, linkedin, googleDrive, mega }
enum AccountStatus { disconnected, connected, expired }

class ConnectedAccount {
  final SocialPlatform platform;
  final String accountName;
  final AccountStatus status;
}
```

`accountName` is a placeholder until real connections return the platform handle. Unknown platforms or statuses in the file are ignored; an empty result reseeds the six defaults. A corrupted JSON file reseeds instead of failing.

## Storage

- Repository interface: `AccountsRepository.load()` / `save()`.
- Local implementation: `%APPDATA%\com.flowpost\FlowPost\accounts.json`.
- Saves write `accounts.json.tmp` and rename it into place, so a crash cannot leave a half-written file.
- No tokens, secrets, or personal data are stored in this slice.
- The Supabase implementation will replace `LocalAccountsRepository` behind the same interface; the UI and controller do not change.

## UI

- `NavigationRail`: Home, Accounts, Upload, Calendar, Settings.
- Accounts page: responsive card grid (max 400 px per card, three columns max); cards size to content so large text never clips.
- Card: platform icon, status badge (colored dot + readable text), account name, primary action.
- Connected → **Disconnect**; disconnected → **Connect**; expired → **Reconnect**.
- The write completes before the card changes: a save failure leaves the card unchanged and shows a snackbar.
- Load failure shows a readable message and **Try again** (retries the repository and the controller).
- Status is never conveyed by color alone (label + dot).

## Error states

| Condition | Behavior |
|---|---|
| Store missing | Seed six defaults and write the file |
| Store corrupt / unexpected shape | Reseed and overwrite |
| Store partial (fewer than six platforms) | Merge missing platforms back in seed order |
| Store unreadable (permissions/disk) | Show error state; no crash |
| Save fails | Card keeps its previous state; snackbar |
| Unknown platform/status entry | Ignore that entry; reseed if nothing valid remains |

## Testing

| Level | Scope | Command |
|---|---|---|
| Unit | Seed, persist/reload, atomic overwrite, partial-file merge, unknown-platform filtering, corrupt-file reseed | `flutter test test/features/accounts/accounts_repository_test.dart` |
| Widget | Six cards, connect/disconnect state, expired/reconnect, load error, save failure, large text, rail navigation | `flutter test test/features/accounts/accounts_page_test.dart` |
| Manual | Installed build: open Accounts, connect YouTube, inspect `accounts.json`, restart, confirm state | Recorded in `tasks/todo.md` |

## Success criteria

1. Accounts tab renders six cards on the installed build.
2. Connect/disconnect updates the card and `accounts.json`; the state survives restart and reinstall.
3. Corrupt or missing data reseeds without a crash.
4. No token or secret is written to the accounts file or log.
5. `flutter analyze`, formatting, unit/widget tests, clean release build, and installer pass.

## Deferred with identity

- `SPEC-accounts` real contracts: `youtube-auth`, `facebook-auth`, `instagram-auth`, `tiktok-auth`, `linkedin-auth`, `google-drive-auth`, `mega-auth`.
- System-browser OAuth, callback handling, `connected_accounts` reads, realtime refresh, token expiry/revocation.
- Real account names/avatars and multi-account support.
