# Spec: `offline` — Cached Reads and Local Drafts

**Module:** `offline` (see `docs/spec/flowpost-native-capability-map.md`)
**Status:** Proposed 2026-10-29 (Phase 5.1); implementation in 5.3–5.5
**Depends on:** `identity` (the Auth token), `media` (the `videos` row), `publishing` (the `posts` row), `scheduling` (the queue and the calendar)
**Blocks:** nothing — this is the last slice of the MVP
**ADR:** `docs/adr/0003-local-cache-engine.md` (the engine, the schema, the two databases)

---

## Objective

Let the app open, show what it knows, and keep the admin's half-written post when the machine has no connection — while never pretending that something was published that was not.

**User:** the FlowPost admin on Windows 10/11 x64.

**Success looks like:** the app opens with no connection and shows the last posts, the last accounts and the last media, each marked with when it was read; the compose form survives a restart and a crash; the Publish button is off and says why; nothing is sent, nothing is deleted and nothing is published while offline; a failed read never empties the cache; the admin's draft is never lost to a cache rebuild.

## Scope

In:

- A local cache of the admin's reads: the posts, the connected accounts and the profile.
- A local store of the compose drafts, autosaved and restored.
- A connectivity state the app knows from the calls it makes.
- Stale marking: every cached screen says when it was read.
- A schema version, a migration path, and a rule that a broken database is never deleted.

Out:

- **Publishing offline.** The publish unit is the `posts` row and the row lives on the server (`SPEC-publishing.md`); a post that is not on the server is not a post. The capability map says it too: "Offline v1: cached reads + local drafts; no queued publishing".
- **Queued publishing** — the client writing rows it will publish later when the connection returns. This is the "auto-retry" the capability map's risk 1 rules out until the upload functions have a status guard.
- **Offline sign-in.** OAuth and the first login need the internet (the capability map's out-of-scope list).
- **Editing a row offline.** A caption changed offline cannot be written back without a conflict rule the admin would have to resolve; v1 reads offline and writes online.
- A background sync service. The app refreshes when the admin asks and when the app opens.

## What the app knows about the connection

**The app does not poll.** It learns the state from the calls it already makes.

| What happened | The state |
|---|---|
| a call reached the server | online |
| the connection never opened, or was dropped | **offline** |
| the server was reached but did not answer in time | online, and the call failed |
| the server answered with an error | online, and the call failed |

Only a **connection-level** failure means offline. A timeout is not an offline state: the server was there. The two are currently merged into one message ("The queue did not answer. Try again.", `desktop-flutter/lib/features/publishing/data/posts_repository.dart`), so 5.5 gives the queue error a **kind** — connection, timeout, or server — and only the connection kind moves the app into the offline state. The screen may keep showing the same sentence for all three.

**The banner.** "No connection. Showing what was saved on this machine, last read at 14:32." with a **Try again** button that repeats the read. The banner is on every screen that shows cached data.

**A stale read never replaces a fresh one.** A refresh that fails leaves the cached rows exactly as they were, with their old timestamp. A read that fails never empties the cache — this is the rule that keeps a flaky network from looking like an empty account.

## The cache

### What the cache holds

| Table | Rows | Fields |
|---|---|---|
| `posts` | the admin's posts, newest 500 | `id`, `platform`, `account_id`, `post_type`, `video_id`, `caption`, `hashtags`, `scheduled_at`, `published_at`, `status`, `captions_enabled`, `contains_altered_content`, `created_at`, `fetched_at` |
| `videos` | the media the posts point at | `id`, `title`, `file_url`, `thumbnail_url`, `duration`, `uploaded_at`, `fetched_at` |
| `accounts` | the connected accounts | `platform`, `account_id`, `account_name`, `is_connected`, `connected_at`, `fetched_at` |
| `profile` | one row | `id`, `name`, `email`, `avatar_url`, `is_admin`, `fetched_at` |
| `meta` | one row | `schema_version`, `last_read_at` |

### What the cache never holds

- **`access_token`, `refresh_token`, `token_expiry`, `metadata`** from `connected_accounts` (`supabase/migrations/20260307000100_connected_accounts_oauth_fields.sql:1-13`). The client asks the server for the four display fields by name, so the tokens are never fetched and can never be written down. This is the same rule the local account store already follows (`desktop-flutter/lib/features/accounts/domain/connected_account.dart:34-39`).
- **The service-role key, the anon key, the session token** — none of them.
- **The caption of a draft.** Drafts live in their own database (below), not in the cache.

### How much

The newest 500 posts. The server keeps the rest, and the calendar only ever asks for one month, so the rows that fall out of the cache are the rows nobody is looking at. The same bound applies to the media: the 500 most recent.

### When it is refreshed

- When the app opens, if the last read is older than five minutes.
- When the admin presses **Refresh**, or **Try again** in the banner.
- After a write: a row the client wrote is updated in the cache immediately, so the screen does not wait for the next read.
- Never in the background. There is no timer and no service.

## The schema and the migrations

- **The version lives in the database**, in the `meta` table, not in a file name.
- **Every change is a numbered migration.** The app applies the missing ones in order, each in its own transaction, and records the new version.
- **A newer database is not touched.** If the file's version is higher than the app knows, the app starts with no cache and says so ("This cache was written by a newer version of FlowPost. It will be rebuilt."). A downgrade must not destroy data.
- **A failed migration changes nothing.** It rolls back, the old file stays as it was, and the app runs without a cache.
- **The migrations are code, not a script.** They live with the store, in order, and they are covered by a test that runs them over a database at the previous version.

## Corruption, and the no-data-loss rule

**Two databases, not one.**

| File | Holds | If it breaks |
|---|---|---|
| `cache.db` | the cached reads | it is rebuilt from the server |
| `drafts.db` | the compose drafts | they cannot be fetched from anywhere |

Keeping them apart is what makes the no-data-loss rule cheap: a cache that is wiped, rebuilt or corrupted never reaches a draft.

- **A database that will not open is renamed, never deleted.** `cache.db` becomes `cache.corrupt-20261029-1432.db`. The app opens with no cache and carries on. The file stays on the machine until the admin removes it (the diagnostics screen of Phase 6 lists them).
- **A broken drafts database is opened read-only.** The app tries to read the drafts from it. If they come out, the admin sees them and can copy them out. If the file cannot be read at all, the app says "The saved drafts could not be opened" and offers one button: **keep the old file and start fresh** — which renames the broken file and creates a new one. Nothing is deleted without that click.
- **A write never leaves a half-written file.** Every write goes through the engine's transaction; the file is only replaced by a committed transaction.

## The drafts

A draft is the compose form, and it is the one thing on the machine that the server does not have.

**What a draft holds:** the media (`videos.id`), the chosen platforms and accounts, the caption per target, the YouTube title, the mode (now or later), and the date and time **as the admin typed them**.

- **One draft per media.** The compose form is per media file, so the draft is keyed by the media id.
- **Autosaved 800 ms after the last change**, not on every keystroke.
- **Restored** when the Publish screen opens for that media. The screen says "Restored from 14:32" so the admin knows it is not what they last saw.
- **Discarded** when the admin discards it, and when the post is published — the row was written, so the draft has done its job.
- **Never published while offline.** The Publish button is off and says "A connection is needed to publish."

### The conflict rule

The draft stores the wall-clock date and time **as it was typed**, the UTC instant it resolved to, and the offset in minutes at that moment.

When the draft is restored, the app resolves the typed wall clock again, in the machine's current timezone:

| What the app finds | What it does |
|---|---|
| the same instant | nothing to say |
| a **different** instant (the machine moved to another zone, or the daylight-saving rules changed) | shows the new instant next to the typed one and asks which one the admin meant. **The typed wall clock is never silently replaced.** |
| a wall clock that **does not exist** in the current zone | marks the field "That time does not exist here" and the post cannot be published until the admin picks another time |

The rule exists because the draft is the only copy of the admin's intent. Silently moving the time by an hour would publish something the admin did not write.

## What each screen does offline

| Screen | Offline |
|---|---|
| Home | the last cached numbers, marked with the time of the read |
| Accounts | the cached accounts, marked stale; connect and disconnect are off |
| Media | the media is local already; the upload and the captions need a connection and say so |
| Publish | the draft is editable; Publish is off with the reason |
| Queue and Calendar | the cached posts, marked "saved at 14:32" |
| Captions | off — the model is remote |
| Settings | works; the update check needs a connection |

## Security and privacy

- **No token is ever written to disk.** The cache stores the display fields of the accounts, never the tokens (above).
- **The drafts hold the admin's own words.** They stay on the machine and are deleted when the draft is published or discarded.
- **The cache is not encrypted.** It holds captions, titles and file URLs — the admin's own content on the admin's own machine, in the app's own support folder. This matches the existing local account store (`%APPDATA%\com.flowpost\FlowPost\accounts.json`) and is recorded here so it is a decision and not an accident.
- **The cache is per machine and per user.** It is wiped when the admin signs out, so a shared machine does not carry one admin's posts into the next one's session.
- **The log carries no caption, no title, no URL and no token** — the same rule the publishing slice follows.

## Testing

- **The store.** Read, write, upsert and delete against a temporary file; the version is read; a migration runs over a database at the previous version.
- **Corruption.** A file that is not a database, a file with a higher version, a migration that throws, a drafts file that cannot be opened: each one ends with the app running and the file still on disk.
- **The drafts.** The round trip (compose → close → reopen → the same draft), the autosave debounce, the discard, and the conflict rule with a changed zone.
- **The connectivity.** A transport that fails with a connection error puts the app offline; a transport that times out does not; a failed read leaves the cache untouched.
- **The screens.** Each screen's offline state in a widget test, and the publish button being off with its reason.

## Success criteria

- The app opens with no connection and shows the last posts, accounts and media, each marked with when it was read.
- A failed read never empties the cache, and never changes a row that was read before.
- A draft survives a restart and a crash, and is restored with the caption, the title and the time the admin typed.
- The typed time is never silently changed; a conflict is shown and the admin chooses.
- The Publish button is off while offline, with the reason on the screen.
- A broken database is renamed, never deleted, and the app keeps working.
- A cache rebuild never touches a draft.
- No token is written to disk, and the cache is wiped on sign-out.

## Open questions

1. **The media cache.** The `videos` rows are the server's copy of the media that is already on the machine's disk. Proposed: keep the fields the queue card shows (title, thumbnail, duration), so the queue can render without the server.
2. **More than one draft per media.** Proposed: one. The compose form is per media, and a second draft for the same media would have to be merged.
3. **The cache wipe on sign-out.** Proposed: wipe the cache and keep the drafts, because a draft is the admin's own words and a sign-out is often a shared machine handover. The drafts can then be copied out.

## Decisions (proposed — confirm at approval)

| # | Decision |
|---|---|
| 1 | The app never polls for connectivity. It learns the state from its own calls. |
| 2 | Only a connection-level failure means offline. A timeout does not. |
| 3 | The cache and the drafts live in two separate databases. |
| 4 | A database that will not open is renamed, never deleted. |
| 5 | The cache holds no token of any kind, and never a draft caption. |
| 6 | The cache is bounded at 500 posts and 500 videos. |
| 7 | A draft keeps the wall clock the admin typed and never changes it silently. |
| 8 | The cache is not encrypted, and it is wiped on sign-out. |
