# Implementation Plan: Accounts + Upload audit fixes

**Created:** 2026-11-07
**Source:** the `/ponytail-audit` report for the Accounts surface and the Upload/publish path (same session). Tasks are tracked in the Desktop task list as #199–#207.
**Not this file:** `tasks/plan.md` (Desktop MVP, 2026-10-27) and `tasks/plan-2026-11-05-workflows.md` are other, unfinished efforts. This plan adds nothing to them.

---

## Overview

The audit found eleven reportable issues. Three are costing real posts today: an index that exists only in production and refuses the `published` write, a publisher-side account lookup that never checks the owner, and a web publish-now path that sorts Instagram stories into the feed bucket. The rest are drift and swallowed errors. Fix all of them, in dependency order, one commit each, test-first where the logic is a branch rather than a string.

## Scope

In: `posts` index hygiene, the six publishers' `connected_accounts` lookups, the web publish-now routing, Meta token expiry and Graph host/version, the workflow runner's inserts, the web disconnect path, three stale strings.

Out (deliberately, named in one line each):
- **The seven per-platform reads in `AccountsPage.tsx`** stay as they are. `posts-api`'s `account-list` returns `ACCOUNT_COLUMNS`, which carries no `metadata`, and the page renders `subscriber_count`, `category`, `followers_count` and `email` out of that column. Widening it would put TikTok's sealed refresh token in a browser response. No fix, no new API surface.
- **Renewing a Meta token** is not implemented; an expired one now fails early instead of failing at Graph. Instagram-Login renewal (`ig_exchange_token`) is its own change.
- **Anything outside the audited surface.**

## Architecture decisions

1. **The ownership fix goes in the publishers, not at insert.** `insertRow` cannot be the boundary because the web writes `posts` straight through Supabase with RLS and never calls `posts-api`. One `.eq("user_id", post.user_id)` per lookup closes both clients and rows already in the table.
2. **The invariant is guarded by a source test, not a new abstraction.** 22 files read `connected_accounts`; most legitimately cross owners (auth upserts, service-role admin paths). A helper would need an allowlist to be universal, so instead one test names the six publishers and asserts each `connected_accounts` lookup in their source carries a `user_id` filter. It fails the day an eighth publisher is added without one.
3. **Graph versions are decided in one module.** `graph.instagram.com/v27.0` (Instagram Login) and `graph.facebook.com/v25.0` (everything Facebook-hosted) become two exported constants used by `instagram-upload`, `facebook-upload` and `post-story`. `post-story` currently calls `v18.0` for `video_stories` — past Meta's two-year window. Unifying it on v25 is a live-behaviour change and needs the owner's test.
4. **A missing `graph_host` keeps falling back to the Facebook host.** `facebook-auth` writes `metadata: { standalone, profile_picture }` with no host for page-linked Instagram, and those accounts work today. Making it an error would break them, so `facebook-auth` now stamps `graph_host: "facebook"` and the fallback stays for rows written before this.
5. **`isTokenExpired` moves out of `youtube-upload`.** Three publishers need the same predicate; youtube keeps its refresh, the Meta pair gains an early refusal.

## Definition of Done (every task)

- The change is preceded by a test that fails without it, or is a string/one-word change with no branch to test.
- `npx vitest run supabase/functions/_shared` green; `npm run lint` at 0 errors; `npm run build` green.
- Deno type-check (`cd supabase/functions && deno check --no-lock …`) is CI's gate — Deno is not installed on this machine, so the change must avoid anything CI would reject: no new `any` at a boundary, no unused import.
- `graphify update .` after the code settles; the graph refresh is its own commit.
- No production action (migration apply, function deploy, push) without a fresh owner go.

## Task list

| # | Task | Gate |
|---|---|---|
| #199 | A1 — drop `posts_unique_per_account`, make `settlePost` report a DB error | migration review, vitest |
| #200 | A2 — `user_id` in six publisher lookups + the source guard test + `post-story` null id | red→green test |
| #201 | A3 — `post_type` in the web insert select, drop dead `?? []` | build + read the diff |
| #202 | A4 — `isTokenExpired` in `_shared`, Meta publishers refuse early | red→green test |
| #203 | A5 — one Graph host/version module, `facebook-auth` stamps the host | red→green test |
| #204 | A6 — `process-workflow` insert errors + duplicate pre-check | read the diff |
| #205 | A7 — web disconnects go through `posts-api disconnect` | build |
| #206 | A8 — two stale Instagram strings | grep |
| #207 | A9 — gates, graph refresh, commits, deploy/runbook notes | full suite |

## Verification checkpoint

After #200–#204: full `_shared` suite green, lint 0 errors, build green, and every publisher's account lookup greppable with a `user_id` filter. Then the owner:

1. applies the #199 migration on production and re-runs the row counters (expect `processing`/`publishing` to drain through the reaper),
2. deploys the touched functions,
3. publishes one feed post and one story from web publish-now, and from a scheduled run, and disconnects one Google account from the web to prove the revoke reaches Google.

## State (2026-11-07)

A1–A8 are implemented, gated and committed locally; nothing is pushed, deployed or applied.

- Gates: `npx vitest run supabase/functions/_shared` 26 files / 386 tests, `npm test` 37 files / 470 tests, `deno check --no-lock` over every function 0 errors (Deno 2.9.8 at `E:\tmp\deno\deno.exe`), `npx tsc -b` 0 errors, `npm run lint` 0 errors / 186 warnings, `npm run build` green.
- Found while fixing: `process-workflow`'s follow-up metadata update overwrote the whole `metadata` column from a read-back that never selected it, erasing `youtube_video_title` from every scheduled post. Sheet info now rides on the insert (in the #204 commit).
- Found and deliberately left: nine `graph.facebook.com/v23.0` strings in `facebook-auth`. That is the connect route the owner proved live on 2026-11-07; changing a working connect without a verification run is the worse trade. The two insights functions did move onto the module (`v25.0`, same value).
- The wedged rows are not settled by the migration. 263 `processing` + 74 `publishing` rows need the owner's decision per row (see **Posts wedged on a live status** in `docs/runbook.md`); `posts` has no `updated_at`, so that read-back sorts on `created_at`.
- Not covered by a test: the live-target filter inside `process-workflow`. It is four inline lines in a 1200-line function with no unit tests at all; extracting it into `_shared` would be tested in isolation while the real path stayed unguarded.
