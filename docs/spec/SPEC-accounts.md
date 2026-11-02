# Spec: `accounts` — Connected Platform Accounts

**Module:** `accounts` (see `docs/spec/flowpost-native-capability-map.md`)
**Status:** The list comes from the server since 2026-11-01. The local-only slice (2026-10-28), which seeded six placeholder accounts, is gone. Connecting an account is open work (Phase F in `tasks/plan-2026-11-01-audit-and-features.md`).
**Depends on:** `shell`, the license session, `posts-api` (the `account-list` action)
**Blocks:** `publishing` — the compose screen takes its platforms from these rows.

---

## Objective

Give the admin one place that shows the accounts the server holds for their
user, and give the publishing step the real list of platforms to pick from.

**User:** the FlowPost admin on Windows 10/11 x64, working with an activated license key.

**Success looks like:** the cards are the `connected_accounts` rows; a machine that cannot reach the server still shows what it last saw and says so; nothing is invented when no account is connected; no token ever reaches the client.

## Scope

In:

- The accounts the server names for the owner of the session.
- Status per row: connected, disconnected, expired (the stored token date has passed).
- A local cache, so a dropped connection is not an empty list.
- Loading, error, empty and offline states; keyboard-reachable controls.
- The rows the publishing module turns into targets.

Out:

- Connect, disconnect and reconnect actions. Until the browser OAuth flow exists the screen has no buttons: one that only rewrote a local file would promise a connection that does not exist.
- Token exchange, refresh and revocation. The functions hold the tokens; the client never sees them.
- Realtime updates, avatars and other account metadata.

## Model

```dart
enum SocialPlatform { youtube, meta, tiktok, linkedin, googleDrive, mega }
enum AccountStatus { disconnected, connected, expired }

class ConnectedAccount {
  final SocialPlatform platform; // the card it belongs to
  final String accountName;
  final AccountStatus status;
  final String accountId; // the platform's own id, e.g. a channel id
  final String serverPlatform; // the value the platform column holds
}
```

`socialPlatformOf(serverPlatform)` maps a row's platform onto its card. Instagram and Facebook share the `meta` card, so the server's own name is kept on the model: it decides which publish function takes the post.

## Read path

`posts-api` answers `{action: "account-list"}` with the caller's rows — `id`, `platform`, `account_id`, `account_name`, `display_name`, `is_connected`, `connected_at`, `token_expiry` and nothing else (`ACCOUNT_COLUMNS` in `supabase/functions/_shared/posts-api.ts`). `accountsFromRows` turns them into accounts and the repository answers `AccountsRead(accounts, offline)`.

- The label is `display_name`, or `account_name` when the row carries no display name.
- `is_connected` false is disconnected; a `token_expiry` in the past is expired; otherwise connected.
- A row whose platform the client does not name is skipped.
- No session, or a call that never reached the server (connection or timeout), answers the cache with `offline: true`. A server that answered and refused is an error the screen shows, not a stale list.
- A fresh answer is written to the cache; a cache write that fails does not throw the answer away.

## Storage

- `%APPDATA%\com.flowpost\FlowPost\accounts.json` is the cache, not the source.
- Saves write `accounts.json.tmp` and rename it into place, so a crash cannot leave a half-written file.
- A missing, unreadable or corrupt file is an empty cache. Nothing is seeded: an account that was never connected must not appear.
- No token or secret is written. The cache holds the platform, the account name, the state, the platform account id and the platform name the server used.

## Publishing targets

`publishTargetsFor(account)` (`lib/features/publishing/domain/publish_target.dart`) turns one row into the targets it offers:

- only a connected account;
- only a platform the client publishes to — Google Drive and MEGA hold the media, they take no post;
- the feed post and the story for one Instagram, because the server publishes them through two functions;
- nothing for a row without `account_id`: that id is what the publish function reads back.

`publishTargetsProvider` is the accounts read mapped through it, so the compose screen and the Accounts screen always agree on what is connected.

## UI

- `NavigationRail`: Home, Accounts, Upload, Calendar, Settings.
- Accounts page: responsive card grid (max 400 px per card, three columns max); cards size to content so large text never clips.
- One card per row, keyed `account-<platform>-<accountId>`, so two Instagram accounts are two cards.
- Card: platform icon, status badge (colored dot + readable text), account name when the row names it. Status is never carried by color alone.
- An offline read that kept something says the list is the copy this PC kept; a live read does not.
- Load failure shows a readable message and **Try again**, which reads from the server again.

## Error states

| Condition | Behavior |
|---|---|
| No license session | The cache answers, marked offline |
| Server unreachable (connection/timeout) | The cache answers, marked offline |
| Server refused the session or failed | Error state with **Try again**; no stale list |
| Cache missing or corrupt | Empty list; nothing is seeded |
| Cache write fails | The fresh answer still reaches the screen |
| Unknown platform in a row | That row is skipped |

## Testing

| Level | Scope | Command |
|---|---|---|
| Unit | Cache read/write, corrupt and partial files, row → account mapping, offline fallback, refused session | `flutter test test/features/accounts/accounts_repository_test.dart` |
| Widget | Cards per row, expired badge, empty state, offline note, load error, large text, rail navigation | `flutter test test/features/accounts/accounts_page_test.dart` |
| Unit | Row → publish target rules (status, platform, account id, the Instagram story) | `flutter test test/features/publishing/publish_target_test.dart` |
| Provider | The targets follow the accounts read, including after a refresh | `flutter test test/features/publishing/publish_targets_provider_test.dart` |
| Manual | Connect on a real server, then publish to it | Open — needs Phase F and a deployed `posts-api` |

## Success criteria

1. The cards are the rows the server answered; nothing is invented.
2. Losing the connection keeps the list and says it is the kept copy.
3. A refused session is shown as an error, not as an empty account list.
4. No token or secret is written to the cache, the log or the screen.
5. The compose screen offers exactly the connected accounts and blocks publishing when there is none.
6. `flutter analyze`, formatting, unit/widget tests and a clean release build pass.

## Deferred

- Browser OAuth connect, disconnect, reconnect and expiry handling (Phase F), with the platform auth contracts: `youtube-auth`, `facebook-auth`, `instagram-auth`, `tiktok-auth`, `linkedin-auth`, `google-drive-auth`, `mega-auth`.
- Realtime refresh of the list, several accounts per platform on one card, avatars.
