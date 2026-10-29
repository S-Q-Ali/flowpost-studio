# Spec: `scheduling` — Calendar and Queue

**Module:** `scheduling` (see `docs/spec/flowpost-native-capability-map.md`)
**Status:** Proposed 2026-10-29 (Phase 5.1); implementation in 5.2
**Depends on:** `publishing` (the `posts` row), `media` (the `videos` row), `accounts` (the connected account list)
**Blocks:** `offline`
**ADR:** `docs/adr/0003-local-cache-engine.md` (where the cached copy of these rows lives)

---

## Objective

Let the admin see what is going out and when, change a scheduled post, and stop one that should not run — through the same `posts` rows the web app writes, with the times shown in the admin's own clock.

**User:** the FlowPost admin on Windows 10/11 x64.

**Success looks like:** the calendar shows the month at a glance and the queue shows the rows that need attention; a time the admin types is the time the post goes out, even across a daylight-saving change; a scheduled post can be moved or stopped without guessing what the server did; the desktop and the web app show the same post at the same local time.

## Scope

In:

- A calendar with a month, a week and a list view over the admin's `posts` rows.
- A queue: the same rows as a list, with a status filter, ordered by the time they go out.
- Reading the rows, editing a scheduled row, and cancelling one that is still `scheduled`.
- A wall-clock → UTC conversion that refuses a time the clock skips and names the time that happens twice.
- The status of every row, including the `publishing` status the web app's badge does not have.

Out:

- Bulk actions. The web app's queue has a select-all bar (`src/pages/QueuePage.tsx:247-262`); the desktop keeps it for v1.1.
- The workflow engine, the quota screen, the analytics.
- Any change to the edge functions or to the `posts` table. Every backend gap below needs the owner's approval plus deploy access, which this environment does not have.
- A second timezone setting of its own. The admin's zone is the machine's zone (see **The timezone**).

## The read model

The client reads the same rows the web app reads, and it reads them through PostgREST with the Auth token.

- **The post.** `posts` (`supabase/migrations/20260303122515_d4098f6b-24c4-4c4c-958f-01e09af625ee.sql:28-40`, widened by `20260307000200_posts_account_id.sql:1`, `20260307000400_posts_contains_altered_content.sql:1`, `20260704000000_add_post_type.sql:1`, `20260716000000_add_linkedin_support.sql:5-7`): `id`, `user_id`, `video_id`, `platform`, `caption`, `hashtags`, `scheduled_at`, `published_at`, `status`, `captions_enabled`, `created_at`, `account_id`, `contains_altered_content`, `post_type`, `workflow_item_id`.
- **The media.** `videos` (`…sql:12-20`): `id`, `title`, `file_url`, `thumbnail_url`, `duration`, `uploaded_at`. The web app joins them for the queue card (`src/pages/QueuePage.tsx:65-69`); the desktop does the same.
- **The account name.** `connected_accounts` (`…sql:67-75`, plus `20260307000100_connected_accounts_oauth_fields.sql:1-13`): `platform`, `account_id`, `account_name`/`display_name`. **Never** `access_token`, `refresh_token`, `token_expiry` or `metadata` — the client asks for the four display fields by name and never stores the rest.

**Only the admin's own rows come back.** The RLS on `posts` filters on `user_id = auth.uid()::text` (`supabase/migrations/20260616000000_add_multi_user_rls.sql:50-61`).

## The queue

A list of the admin's rows, newest time last, with the state of each one.

- **Filters: status.** `all`, `scheduled`, `processing`, `publishing`, `published`, `failed` — the same five the database allows (`supabase/migrations/20260320000000_posts_status_publishing.sql:3-4`) plus `all`, and the same four the web app offers (`src/pages/QueuePage.tsx:42`).
- **A platform filter is proposed** (see **Decisions**). The web app has none.
- **Rows.** The media thumbnail and title, the platform, the account name, the status, and the time: the published time when there is one, otherwise the scheduled time (`src/pages/QueuePage.tsx:305-345`).
- **Actions per row.** Edit, Delete, and — for a row that is still `scheduled` — Cancel.
- **Ordering.** By `scheduled_at` ascending, then by `created_at`. A row with no `scheduled_at` sorts last.
- **How many rows.** The web app fetches **every** row and filters in the browser (`src/pages/QueuePage.tsx:65-72`). The desktop reads a bounded window instead: 200 rows per page, ordered, with **Load more**. The `posts` table has no index on `scheduled_at`, `status` or `user_id` (the only index is `idx_posts_workflow_item_id`, `supabase/migrations/20260718000000_add_workflow_item_id_to_posts.sql:2`), so a full fetch is a full scan on every open.
- **States.** Loading (skeleton rows), empty ("No posts yet", with a link to the Upload screen — the web app's own empty card, `src/pages/QueuePage.tsx:281-291`), error (the reason, and **Try again** — the web app shows only a toast, `src/pages/QueuePage.tsx:135`), and stale (the rows are from the cache, see `SPEC-offline.md`).

## The calendar

- **Month view.** A seven-column grid, Sunday first, with the month's posts on their day. Up to three posts a day, then **+N more** (`src/pages/CalendarPage.tsx:114-139`). The month title and the arrows move one month at a time (`src/pages/CalendarPage.tsx:100`, `:106-107`).
- **Week view.** Seven days, the same rows as the month view. **Proposed** — the web app has no week view; the plan's 5.2 acceptance names one.
- **List view.** The same rows as the queue, grouped by day. The web app's calendar already toggles between a month grid and a list (`src/pages/CalendarPage.tsx:22`).
- **Which rows appear.** The rows whose `scheduled_at` falls in the visible month (`src/pages/CalendarPage.tsx:26-34`). A published row keeps its `scheduled_at`, so it stays on its day and shows the published time.
- **A day with many posts.** The grid shows three and counts the rest; the list shows all of them.
- **New post.** Opens the Publish screen with the media picker, because a post is always one media file plus one account (the publish unit, `SPEC-publishing.md`).

## The timezone

### The rule

The admin types a **wall-clock** date and time — `YYYY-MM-DD` and `HH:MM` — in the app's own timezone. The app turns it into a **UTC instant** and stores that in `posts.scheduled_at`, which is a `TIMESTAMPTZ`. The app shows every stored instant back in the app's own timezone.

This is what the Publish screen already does (`desktop-flutter/lib/features/publishing/domain/publish_validation.dart:158-176`), and it matches the web app, which sets the hours on a local `Date` and stores `toISOString()` (`src/pages/QueuePage.tsx:123-128`). The two clients therefore agree about what a typed time means.

### Which timezone

**The machine's timezone, read from the OS at the moment of the conversion.**

The `users` table has no timezone or locale column — the profile carries `id, name, email, avatar_url, is_admin, created_at` (`src/pages/ProfilePage.tsx:15-22`, `:46-50`), and the Preferences tab is a placeholder (`src/pages/ProfilePage.tsx:376-388`). Storing the admin's zone would need a migration and a deploy, which is outside this environment. The screen shows the zone next to every time (`UTC+05:00`), so a wrong zone is visible rather than silent.

**Decision needed** (see **Decisions**): if the owner wants the zone on the profile, this becomes a backend change and the spec changes with it.

### The three cases a wall-clock time can have

| The wall clock names | The app does |
|---|---|
| an ordinary time | stores the instant the OS resolves it to |
| a time the clock **skips** (the hour a spring-forward jump removes) | **refuses it**: "That time does not exist today. The clock jumps from 01:59 to 03:00." |
| a time that **happens twice** (the hour a fall-back jump repeats) | uses the **first** of the two, and says so under the field: "That time happens twice today. The post goes out at the first one." |

The web app resolves both silently (`src/pages/QueuePage.tsx:104-107`), so a post written for a skipped hour moves by an hour with nothing on the screen to say so. The desktop refuses instead, the way it already refuses an over-limit caption.

### How the rules are written so they can be tested

The three cases depend on the machine's timezone, and the machine may have no daylight saving at all. The conversion is therefore written against one small seam:

```dart
/// The machine's timezone, as the conversion needs it.
abstract class TimeZone {
  /// The instant the OS gives for a wall-clock time, or null when the OS
  /// cannot make one — the clock skipped that hour.
  DateTime? resolve(DateTime wall);

  /// The offset in minutes that applies around [local].
  int offsetAt(DateTime local);
}
```

The production implementation asks the OS (`DateTime`); the tests use a fake with a synthetic daylight-saving zone, so the skipped hour and the repeated hour are pinned on every machine, including one in a zone without daylight saving.

### The timezone cases the tests pin

- 02:30 on a spring-forward day → refused, and the message names the jump.
- 01:30 on a fall-back day → the earlier of the two instants, and the screen says the time happens twice.
- An ordinary time → the expected instant, in a daylight-saving zone and in one without.
- The same wall clock in two zones → two different instants.
- Round trip: an instant → its local wall clock → the same instant.
- A wall clock that does not exist → the app does not write a row.

## Editing a scheduled post

The web app's edit modal changes the caption, the hashtags, the "AI content" flag and the time, and it only rewrites `scheduled_at` while the row is still `scheduled` (`src/pages/QueuePage.tsx:123-128`, `:406-462`). The desktop does the same:

- The caption and the flag are written straight to the row.
- The time goes through the rules above, so a moved post can never land on a skipped hour.
- A row that is not `scheduled` — it is `processing`, `publishing` or `published` — is not editable. The platform may already have it, and the client does not know the platform's state.
- A `failed` row keeps its caption and is retried from the Publish screen (the retry is a compare-and-set on the row, `SPEC-publishing.md`).

## Cancelling a scheduled post

The database has no `cancelled` status: the five values are `scheduled`, `processing`, `publishing`, `published`, `failed` (`supabase/migrations/20260320000000_posts_status_publishing.sql:3-4`). **The only way to stop a scheduled post is to delete its row**, which is what the web app's calendar does (`src/pages/CalendarPage.tsx:47-52`, the button is offered only for a `scheduled` row, `:179-181`).

The desktop follows the same rule, with one addition:

- **Cancel is offered only for a `scheduled` row**, like the web app.
- **A `failed` row can be deleted** (the admin does not want it any more) but not cancelled — it never went out.
- **A `published` row is never deleted by a "cancel" action.** It can be removed from the list as an explicit delete, with a confirmation.
- **The confirmation names the row.** "Delete the Instagram post for 29 October 2026 at 10:00? The caption is deleted with it and it cannot be recovered." The web app deletes the calendar row with no confirmation at all.
- **The cache is told.** The deleted row leaves the local cache too (`SPEC-offline.md`).

## The status of a row

The desktop shows all five statuses the database allows. The web app's badge knows four (`src/components/StatusBadge.tsx:4-9`) and its `PostStatus` type omits `publishing` (`src/lib/types.ts:2`), so a row that is being published right now renders as nothing there.

| Status | The screen says | The colour |
|---|---|---|
| `scheduled` | Scheduled | the app's primary |
| `processing` | Processing | the app's primary |
| `publishing` | Publishing | the app's primary |
| `published` | Published | green |
| `failed` | Failed | the destructive colour |

The Publish screen's own phases (`waiting`, `publishing`, `published`, `failed`, `unconfirmed`, `scheduled`) are the client's view of one attempt and stay separate from the row's status.

## Security and privacy

- **The client reads only its own rows.** The RLS on `posts` filters on `user_id = auth.uid()::text` (`supabase/migrations/20260616000000_add_multi_user_rls.sql:50-61`).
- **The caption stays on the server.** It is read to show it and written to change it; the log never carries it.
- **No token is cached or logged.** The account rows are read by name, so `access_token` and `refresh_token` are never fetched, let alone stored.
- **The thumbnail is a public URL** (`storage.buckets` is public, `supabase/migrations/…sql:83`), so the calendar may load it directly. The app never logs the URL.

## Testing

- **The timezone rules.** The four cases above, against the fake zone with a synthetic daylight-saving transition, plus the ordinary cases against the machine's own zone.
- **The views.** A widget test per view: the month grid with a known month, the week view, the list, and the empty, loading and error states.
- **The filters.** The status filter, and the platform filter if it is approved.
- **The actions.** Edit writes the caption and the time; cancel deletes a `scheduled` row and refuses on any other status; the confirmation names the row.
- **The contract.** The reads and the writes against a fake transport, the way `test/features/publishing/posts_repository_test.dart` does it.

## Success criteria

- The calendar shows the admin's scheduled posts for the visible month, in the admin's own timezone, with the correct time across a daylight-saving change.
- A time the clock skips is refused with a sentence that explains it; a time that happens twice is used once, and the screen says which.
- The queue lists the same rows the web app lists, with all five statuses, and filters by status.
- A scheduled post can be moved, and the moved time is the time the admin typed.
- A scheduled post can be cancelled, and a post that is already publishing cannot be.
- The desktop and the web app show the same post at the same local time.
- No token is fetched, cached or logged.

## Deferred with identity

- The account list the queue shows comes from the local store until the real connections exist (`desktop-flutter/lib/features/accounts/domain/connected_account.dart:64-66`).
- The media of a row is a `videos` row; until the media slice writes one, the calendar has nothing to point at.

## Open questions

1. **The platform filter.** Keep the web app's status-only filter, or add the platform? Proposed: add it — the queue is per-platform work, and the client already holds the platform of every target.
2. **The week view.** The plan's 5.2 acceptance names month, week and list. The web app has month and list. Proposed: build all three.
3. **The timezone.** The machine's timezone, or a timezone on the profile? Proposed: the machine's, with the zone shown on the screen. A profile field needs a migration and a deploy.
4. **Deleting a published row.** The web app offers Delete on every row. The desktop proposes to keep Delete for `published` rows as an explicit "remove from the list", behind a confirmation.

## Decisions (proposed — confirm at approval)

| # | Decision |
|---|---|
| 1 | The queue filters by status and, if approved, by platform. A date range and a search box are deferred to v1.1. |
| 2 | The calendar has a month, a week and a list view. |
| 3 | The timezone is the machine's, read from the OS, and it is shown on the screen. |
| 4 | A skipped wall-clock time is refused; a repeated one uses the first occurrence and says so. |
| 5 | Cancel deletes the row and is offered only for a `scheduled` row. The desktop asks for a confirmation; the web app does not. |
| 6 | The queue reads 200 rows a page instead of every row, because the table has no index on the columns it sorts by. |
