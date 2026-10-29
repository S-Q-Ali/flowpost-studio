# Spec: `publishing` — Publish Now and Schedule

**Module:** `publishing` (see `docs/spec/flowpost-native-capability-map.md`)
**Status:** Proposed 2026-10-29 (Phase 4.1); implementation in 4.2–4.4
**Depends on:** `media` (the `videos` row), `accounts` (the connected account list); the live calls depend on `identity` (deferred)
**Blocks:** `scheduling`, `offline`
**ADR:** `docs/adr/0001-dual-auth-session.md` (two credentials)

---

## Objective

Let the admin take the finished media from the Upload screen, choose the platforms and accounts, write the caption, and publish it now or schedule it — through the existing edge functions, with a visible per-platform status, and with a rule that makes a double publish impossible from the client's side.

**User:** the FlowPost admin on Windows 10/11 x64, using the app without a login gate (owner override).

**Success looks like:** a finished video goes to a selected account and the screen says which platform answered and with what; a failure reads as a sentence the admin can act on; a retry never publishes a post that already went out; a scheduled post shows its time in the admin's own timezone; no token, key or post id is logged.

## Scope

In:

- One post per (platform × account), matching the web app's row shape.
- Publish now, and schedule for a local wall-clock time.
- Per-platform status and a readable error for every attempt.
- The duplicate guard: refresh the row before a retry, never blind-retry.
- Client-side validation of the platform's own caption and media limits.
- Typed clients over the existing edge functions, with mocked contract tests.

Out:

- Carousels (the function supports them; the client does not offer them yet).
- Bulk operations beyond the one media file the Upload screen holds.
- The workflow engine, the quota screen, the analytics.
- Changing the edge functions. The backend gaps are listed under **Known backend gaps** and each needs the owner's approval plus deploy access, which this environment does not have.

## The publish unit is the row, not the request

The client never sends a caption, a media URL or a token to a publish function. It writes the `posts` row first and then calls the function with that row's id — exactly what the web app does (`src/pages/UploadPage.tsx:569`, then `src/pages/UploadPage.tsx:634-704`).

The flow, in order:

1. **Media** — `upload-local-file` (Phase 3.5) stored the file and wrote the `videos` row. The client holds that `videoId`.
2. **Accounts** — the connected accounts are read for the chosen platform. The client never holds an access token; the edge function decrypts it.
3. **Rows** — one `posts` row per selected (platform, account):

   | Column | Value |
   |---|---|
   | `user_id` | the signed-in user's id |
   | `video_id` | the `videos.id` from step 1 |
   | `platform` | `facebook` \| `instagram` \| `youtube` \| `tiktok` \| `linkedin` |
   | `account_id` | the platform account id (`posts.account_id`), not the `connected_accounts.id` |
   | `caption` | the caption for that platform, trimmed, or `null` |
   | `hashtags` | `null` for now — the web app's hashtag input is commented out (`src/pages/UploadPage.tsx:47`) |
   | `post_type` | `feed` or `story` (`supabase/migrations/20260704000000_add_post_type.sql:1`) |
   | `scheduled_at` | the UTC instant (see **Scheduling**) |
   | `status` | `processing` for publish-now, `scheduled` for a schedule |
   | `captions_enabled` | `true` |
   | `contains_altered_content` | `true` while the caption came from the AI (`youtube-upload/index.ts:249` maps it to YouTube's `containsSyntheticMedia`) |

   The web app also inserts a fan-out row per workflow item (`src/pages/UploadPage.tsx:590-604`). The desktop client does not: the workflow engine is out of the MVP scope.

4. **Publish** — one call per row, body `{"postId": "<uuid>"}`, to the function that belongs to the platform.
5. **Status** — the function itself writes `published`/`failed` and `published_at` (`supabase/functions/youtube-upload/index.ts:307-310` and the same shape in every other function). The client reads the row back to show the truth.

## Credentials: two, and both are needed

Per ADR 0001, the client carries two tokens and they do different jobs:

| Credential | Used for | Why |
|---|---|---|
| Supabase Auth access token | PostgREST: reading `connected_accounts`, inserting and re-reading `posts` | RLS on `posts` is `user_id = auth.uid()` (`supabase/migrations/20260616000000_add_multi_user_rls.sql:54`) — a row can only be written with a real Auth identity |
| `sessions` token | `Authorization: Bearer …` on the edge functions | The shared authorizer looks the bearer up in the `sessions` table (`supabase/functions/_shared/auth.ts:77-90`); the anon key is rejected by design (`supabase/functions/_shared/auth.ts:49-51`) |

The service-role key is never used in the client. `FRONTEND_API_KEY` would authorize the calls but carries no user scope, so a row written by one user could be published by another — the client must use the session token.

Until identity exists, both are behind the same seam as the caption and upload clients (`sessionTokenProvider` is null), the action stays disabled, and the contract is covered by mocked tests only.

## Platform contract

Every function is `POST /functions/v1/<name>` with `Content-Type: application/json` and the body `{"postId": "<uuid>"}`. The caption, hashtags, title, media URL and access token are read by the function from the `posts`, `videos` and `connected_accounts` rows.

| Platform | Function | Success body | Media it accepts |
|---|---|---|---|
| YouTube | `youtube-upload` | `{success, postId}` (`youtube-upload/index.ts:319`) | Video only — an image is refused with "YouTube does not support image posts" (`youtube-upload/index.ts:153-155`) |
| Instagram | `instagram-upload` | `{success, instagram_post_id, container_id}` (`instagram-upload/index.ts:386`) | Image or reel |
| Facebook | `facebook-upload` | `{success, postId, facebook_id}` (`facebook-upload/index.ts:223`) | Image or video |
| TikTok | `tiktok-upload` | `{success, publish_id}` (`tiktok-upload/index.ts:417`) | Video only — "TikTok does not support image uploads" (`tiktok-upload/index.ts:150-157`) |
| LinkedIn | `linkedin-upload` | `{success, postId, linkedin_post_id}` (`linkedin-upload/index.ts:221`) | Image or video, a person only — never an organization page (`linkedin-upload/index.ts:130, 186`) |
| Facebook / Instagram story | `post-story` | Facebook `{success, video_id}` (`post-story/index.ts:224`), Instagram `{success, storyId}` (`post-story/index.ts:322`) | Facebook story is video only; Instagram story is image or video |

Stories are a separate function because they take their media from the video row instead of the feed path (`post-story/index.ts:84-121`). The web app's story branches never run — the row it filters on is not selected after the insert (`src/pages/UploadPage.tsx:569` selects `id, platform, account_id, status`, but `:618-624` filters on `post_type`), so a story is published as a feed post. The desktop client selects `post_type` and sends stories to `post-story`.

## Limits the client enforces

The functions truncate what they receive (`instagram-upload/index.ts:118` cuts the caption at 2200, `youtube-upload/index.ts:242` cuts the description at 5000). The web app has no client-side validation at all, so its captions are silently cut. The desktop client refuses instead of cutting, because a cut caption can change the meaning of a post:

| Platform | Caption limit | Where the number comes from | Media |
|---|---|---|---|
| YouTube | description ≤ 5000; title required and ≤ 100 | description cut at 5000 (`youtube-upload/index.ts:242`); the title is `metadata.youtube_video_title` or "Uploaded Video" (`youtube-upload/index.ts:241`) and YouTube's own limit is 100 characters | video |
| Instagram | ≤ 2200 | `instagram-upload/index.ts:118` | image or video |
| Facebook | none enforced by the function | `facebook-upload/index.ts:177, 191` | image or video |
| TikTok | ≤ 2200 | `tiktok-upload/index.ts:256` | video |
| LinkedIn | none enforced by the function | `linkedin-upload/index.ts:187` | image or video |

The AI prompt suggests far shorter captions (100–300 characters, `src/lib/prompt-templates.ts`), so the limits above are a ceiling, not a target.

## Status model

The database allows five values, and the client carries all five (`supabase/migrations/20260320000000_posts_status_publishing.sql:3-4`):

```dart
enum PostStatus { scheduled, processing, publishing, published, failed }
```

The web app's `PostStatus` type lists only four — `publishing` is missing (`src/lib/types.ts:2`) — and its status badge has no style for it (`src/components/StatusBadge.tsx:4-9`). The client shows all five.

| Status | Meaning | Who sets it |
|---|---|---|
| `scheduled` | waiting for its time | the client, and the retry that reschedules a failed post |
| `processing` | claimed, the publish call is in flight | the client before the call, and the cron before it dispatches (`process-scheduled-posts/index.ts:82-85`) |
| `publishing` | the platform has accepted the media and is still processing it (Instagram) | the function (`instagram-upload/index.ts:272`) |
| `published` | done, `published_at` set | the function |
| `failed` | the attempt failed | the function |

The client keeps its own view of the attempt next to the row status: the platform's answer id (`instagram_post_id`, `facebook_id`, `linkedin_post_id`, `publish_id`) and the error text. The web app throws the answer body away (`src/pages/UploadPage.tsx:646-651` reads only the error flag), and the `posts` table has no column for either — the only provider id the database keeps is TikTok's `metadata.tiktok_publish_id` (`tiktok-upload/index.ts:403-407`). The client therefore keeps the ids in its own state and shows them; Phase 5's cache can persist them.

## The duplicate rule

**Refresh the row before a retry, and never blind-retry.** This is the whole rule, and it is not optional: no upload function looks at `post.status` before publishing (they all select it and none branch on it — `youtube-upload/index.ts:129`, `instagram-upload/index.ts:87-88`, `facebook-upload/index.ts:87`, `tiktok-upload/index.ts:124`, `linkedin-upload/index.ts:70`, `post-story/index.ts:89`), and the platform's own state is not readable afterwards — YouTube does not even keep the video id (`youtube-upload/index.ts:253-319`).

So the client behaves like this:

1. **Before the first call** the row is `processing`. If the call times out or the connection drops, the outcome is unknown: the platform may have published it.
2. **After an unknown outcome** the client re-reads the row. `published` means it went out — the client says so and offers no retry. `failed` means it did not, and the client re-reads the row once more before offering Retry.
3. **Retry is a compare-and-set**, like the web app's (`src/pages/QueuePage.tsx:178-194`): the client updates the row to `scheduled` with `scheduled_at = now + 60 s` **only where the status is still `failed`**, and only a row that actually changed is retried.
4. **A retry never re-sends the same call directly.** It goes back through the scheduler, so one publisher is always in charge.
5. **The retry button stays disabled** until the row has been refreshed. A button that fires on a stale status is how a post goes out twice.

The `posts` table has no `platform_post_id` and no `error_message` column, so the client cannot rebuild this guard from the database alone — it needs the refreshed status, which is why the refresh is part of the rule and not a nicety.

## Scheduling

- The client shows the admin's **local** time and stores the **UTC instant**: `scheduled_at` is `TIMESTAMPTZ` and the web app writes `new Date(...).toISOString()` (`src/pages/UploadPage.tsx:412-415`). The instant is the only record — the row has no timezone column.
- A publish-now row also gets `scheduled_at = now` (`src/pages/UploadPage.tsx:410`), so `scheduled_at` does not mean "was scheduled".
- **One publisher.** A scheduled row is published by the scheduler, not by the client. The client writes the row, shows "Scheduled", and shows the real status when it reads the row back. If the client also published due rows, it would race the scheduler and could publish twice.
- The scheduler is the existing `process-scheduled-posts` function, driven by a `pg_cron`/`pg_net` job every minute (`supabase/migrations/20260307000300_cron_process_scheduled_posts.sql:7-21`). **That migration's SQL is commented out** — the job has to be created by hand in the live database. Whether it exists is an open question below.
- The scheduler claims a row by writing `processing`, but the claim is not atomic — the update carries no `.eq("status", "scheduled")` (`process-scheduled-posts/index.ts:82-85`), so two runs could claim the same row. The client cannot fix this from its side; it is listed under **Known backend gaps**.

## Error model

Every function answers a failure with `{"error": "<sentence>"}` and a status code. The client turns that into one small set of codes, so the screen shows a sentence the admin can act on rather than whatever the platform said:

| Code | When | Message on screen |
|---|---|---|
| `unauthorized` | 401 | "Sign in again to publish." |
| `notSignedIn` | no credential locally | "Sign in required to publish." |
| `invalidRequest` | 400 with a body the client built wrongly | "The post could not be prepared." |
| `postNotFound` | 404 "Post not found" | "The post is no longer in the queue." |
| `accountNotConnected` | 404 "Connected … account not found" | "That account is no longer connected. Connect it again." |
| `mediaMissing` | 404 "Video not found or missing file_url" | "The media for this post is missing. Upload it again." |
| `wrongPlatform` | 400 "Post is not for …" | "That post belongs to another platform." |
| `alreadyPublished` | the refreshed row says `published` | "This post is already published." |
| `platformRejected` | 502/500 with the platform's own text | the platform's sentence, cleaned of URLs and control bytes |
| `timeout` | the call took longer than the budget | "The publish timed out. Check the Queue before trying again." |
| `network` | the connection failed | "No connection to the server." |
| `unknown` | anything else | "The publish failed. Try again." |

The platform's own text is shown only after it is stripped of anything that could carry a path, a URL or a control byte — the same treatment the media pipeline gives FFmpeg's stderr (`stripControlCharacters`).

## UI

- **Compose:** the finished media on the left; on the right the platform checkboxes with the connected accounts under each, the caption field, and the mode (Publish now / Schedule).
- **Per platform:** the caption can differ per platform, as in the web app (`src/pages/UploadPage.tsx:420-559`). The caption the AI wrote is the starting point for each selected platform.
- **Validation:** the caption limit and the media type are checked before the button is enabled, and the reason is shown next to the field.
- **Schedule:** a date and a time in the admin's timezone, with the UTC instant shown underneath so there is no doubt about what was stored.
- **Publishing:** one row per platform with its own state — waiting, publishing, published, failed — and the platform's id under the success.
- **Retry:** offered only for a `failed` row whose status has just been refreshed, and only after the refresh.
- **Draft:** the caption and the platform selection survive a failed attempt, and the file can be re-picked without losing them. A failed publish never loses the draft.
- Layout works at 1024×640 and 1.6× text; the controls have labels and visible focus.

## Known backend gaps

These are the reasons the client's guard has to be the strict one. Each needs the owner's approval and deploy access, which this environment does not have, so none of them are in the v1 scope:

| Gap | Effect | Where |
|---|---|---|
| No upload function checks `post.status` | A manual retry can publish twice | `youtube-upload/index.ts:129` and the same shape in the other five |
| YouTube keeps no provider id | A published video is only visible through the row's status | `youtube-upload/index.ts:253-319` |
| The scheduler's claim is not atomic | Two runs can claim the same row | `process-scheduled-posts/index.ts:82-85` |
| Instagram re-sends the publish call while the container stays FINISHED | The same container can be published more than once inside the 120 s window | `instagram-upload/index.ts:341-359` |
| TikTok's upload can time out after the platform accepted it | The row is marked `failed` while the post may exist | `tiktok-upload/index.ts:386-395` |
| The `posts` table has no `error_message` or `platform_post_id` column | The reason and the platform id exist only in the session | `supabase/migrations/20260320000000_posts_status_publishing.sql` |

The capability map already names the first one as the v1 rule: "refresh the post status before offering Retry, and never blind-retry" (`docs/spec/flowpost-native-capability-map.md:76`).

## Security and privacy

- The client holds no platform token. The functions read and decrypt the tokens themselves (`youtube-upload/index.ts:157-179`, `instagram-upload/index.ts:104-117`, `tiktok-upload/index.ts:161-203`).
- The service-role key is never in the client. `FRONTEND_API_KEY` is not used: it carries no user scope.
- The log carries the post id, the platform, the status and the error code — never the caption, the media URL, the platform id, the token or the account name.
- A platform's error text is cleaned before it reaches the screen or the log.
- The client reads `connected_accounts` without the token columns, exactly like the web app (`src/pages/UploadPage.tsx:90-172`).

## Testing

| Level | Scope | Location |
|---|---|---|
| Unit | Caption-limit and media-type validation, the status machine, the duplicate rule, the error mapping, the scheduled-at conversion | `test/features/publishing/` |
| Contract (mocked) | One request per platform with the right body, the answer parsing, the retry compare-and-set | `test/features/publishing/` |
| Widget | Compose, per-platform selection, the disabled action without a token, the validation messages, the per-platform status, the retry button's rule | `test/features/publishing/` |
| Manual | One real publish to one test account, one scheduled row, one timeout | Recorded in `tasks/todo.md` |

The live publish cannot be run before identity exists, so the contract tests use a fake transport, the way the caption and upload clients do.

## Success criteria

1. One finished video publishes to the selected accounts and the screen names the platform that answered and with what id.
2. A caption over the platform's limit is refused before the call, with the limit named.
3. A timeout leaves the outcome unknown: the client re-reads the row, and a published row offers no retry.
4. A retry only moves a row that is still `failed`, and only after a fresh read.
5. A scheduled row shows the local time in the client and the UTC instant in the row.
6. A failed attempt keeps the caption, the platform selection and the media.
7. The log holds no caption, no media URL, no platform id, no token and no account name.
8. `flutter analyze`, formatting and the unit/widget tests pass; the mocked contract tests cover every platform function.

## Deferred with identity

- The live publish and schedule calls, and the real status refresh.
- The `pg_cron` job for `process-scheduled-posts`, if it is not already in the live database.
- Carousels, the workflow fan-out rows, bulk publishing.
- Persisting the platform id and the failure reason (a column, or the Phase 5 cache).

## Open questions

1. Does the `process-scheduled-posts` cron exist in the live database? The migration ships it commented out (`supabase/migrations/20260307000300_cron_process_scheduled_posts.sql:6-22`), and the whole scheduled flow depends on it.
2. Should the client refuse an over-limit caption (this spec) or cut it like the functions do? This spec refuses; the web app cuts silently.
3. Is a story a separate choice in the compose screen, or a mode of the Facebook/Instagram choice?
4. Should the client publish a scheduled post itself when the app is running, or leave every scheduled post to the scheduler? This spec leaves them all to the scheduler, so one publisher is always in charge.
5. The atomic claim in the scheduler and the status guard in the upload functions are backend changes; do they go on the v1 list, or stay after the app ships?
