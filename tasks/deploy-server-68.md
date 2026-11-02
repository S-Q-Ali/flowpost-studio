# Deploy the merged server side (#68), then verify the browser connect (#69)

Written 2026-11-03 against `feature/license-access`, updated the same day for the
two audit fixes on this branch (a peppered license hash and the own-profile RLS
policy). Every claim here was checked against the files in this branch; the
deploy itself is owner-side, because it needs the project's Supabase credentials.

Nothing in this branch is safe to deploy out of order: some edge functions read
columns that only exist after a migration, every stored platform token is sealed
with a key that only exists once it is set as a secret, and `verify-license`
answers 503 until its pepper secret is set.

## What is actually waiting

| Kind | Count | Names |
|---|---|---|
| Migrations | 7 | `20261031000000_licenses`, `20261101000000_post_claim_and_unique`, `20261101000100_license_owner`, `20261101000200_consume_rate_limit`, `20261101000300_operator_config`, `20261102000000_oauth_state_return_to`, `20261103000000_users_own_profile_only` |
| New edge functions | 4 | `posts-api`, `operator-config`, `config-status`, `verify-license` |
| Changed edge functions | 25 | every `*-auth` and `*-upload`, `post-story`, `process-scheduled-posts`, `process-workflow`, `upload-local-file`, `generate-ai-captions`, `get-quota-usage`, `transfer-ticket`, `drive-to-mega`, `fetch-facebook-insights`, `fetch-instagram-insights`, `verify-password`, `verify-security-questions`, `verify-session` |
| Changed shared modules | 12 | `supabase/functions/_shared/*` — pulled in by the functions that import them, not deployed on their own |
| Config | 1 | `supabase/config.toml` — JWT verification off for the four new functions, and **no longer off for `verify-password`** |

## Step 0 — Before touching anything

```bash
npx supabase --version          # any 2.x
npx supabase login
npx supabase link --project-ref <ref>
```

Take a database backup from the dashboard (**Database → Backups**) and note the
time. Migrations here are forward-only and one of them writes rows (Step 3).

## Step 1 — `TOKEN_ENCRYPTION_KEY`, before any function goes out

`supabase/functions/_shared/crypto.ts` reads this at every token write and read,
so a function deployed without it fails the moment it touches a stored key. It
must be **base64 of 32 random bytes** — `crypto.ts` does `atob(raw)` and hands
the result to `importKey("raw", …, AES-GCM)`, so a wrong length or a non-base64
value throws at first use, not at deploy time.

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[System.Convert]::ToBase64String($bytes)   # keep a copy in the password manager
```

```bash
npx supabase secrets set TOKEN_ENCRYPTION_KEY="<that base64>"
```

Two rules, from ADR 0005 and the runbook:

- **Set it once and never rotate it.** There is no rewrap. Changing it makes
  every stored platform token unreadable (every account shows *expired*) and
  every wizard-stored key unreadable.
- If the project already has a value here (an earlier deploy of
  `connected_accounts` tokens), **do not set a new one** — read the existing
  value with `npx supabase secrets get TOKEN_ENCRYPTION_KEY` and reuse it. That
  command prints the key to the terminal: look at it, do not paste it into an
  issue, a commit or this file.

Also confirm these exist, since the changed functions now read them through the
`_shared/secrets.ts` reader (operator config first, environment fallback):
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatic; `ALLOWED_ORIGIN`
should be the web origin (`https://flowpost-studio.vercel.app`) — the four new
functions fall back to that exact value when it is unset, so a different origin
means setting it.

### `LICENSE_PEPPER`, same step

`verify-license` hashes a submitted key as `HMAC-SHA-256(LICENSE_PEPPER, key)`.
The pepper is what makes a database dump useless: without it an attacker can
test guessed keys offline, with it they cannot. The value is any secret of **at
least 16 characters** — 32 random hex characters is the obvious choice — and it
is only ever read from the environment, never stored in a table.

```powershell
(-join ((1..32) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) }))  # 32 hex chars
```

```bash
npx supabase secrets set LICENSE_PEPPER="<that value>"
```

- **Set it before Step 6.** Keys hashed under one pepper never match another, so
  a pepper that changes mid-way invalidates every license already issued.
- With the pepper unset or too short, `verify-license` answers **503** and every
  desktop stops at the license screen — it fails closed rather than guessing.
- Same rule as the encryption key: set once, do not rotate, and never paste the
  value into an issue, a commit or this file.

## Step 2 — Read the database before it changes

`20261101000000` turns duplicate live rows into `failed` so a unique index can
be built. Count what that will touch first (**SQL Editor**):

```sql
select user_id, video_id, platform, coalesce(account_id, '') as account,
       post_type, count(*), min(created_at)
from public.posts
where status in ('scheduled', 'processing', 'publishing')
group by 1, 2, 3, 4, 5
having count(*) > 1
order by count(*) desc;
```

Empty result — normal, go ahead. Rows — decide first: each of those targets has
more than one post queued for the same platform, and after Step 3 all but the
oldest will read as *failed* in the queue. Export the list if the owner wants to
re-schedule any of them by hand afterwards.

## Step 3 — Migrations

```bash
npx supabase db push
```

The CLI applies them in filename order, which is the dependency order here:
`licenses` → `posts.claimed_at` + the unique index → `licenses.user_id` →
`consume_rate_limit()` → `operator_config` → `oauth_states.return_to` →
`users_select` narrowed to the owner's own row.

Verify all seven landed:

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('licenses', 'operator_config');

select column_name from information_schema.columns
where table_schema = 'public'
  and (table_name = 'posts'    and column_name = 'claimed_at'
    or table_name = 'licenses' and column_name = 'user_id'
    or table_name = 'oauth_states' and column_name = 'return_to');

select indexname from pg_indexes
where schemaname = 'public' and indexname = 'posts_one_live_per_target';

select pg_proc.proname from pg_proc join pg_namespace n on n.oid = pg_proc.pronamespace
where n.nspname = 'public' and proname = 'consume_rate_limit';

select policyname, qual from pg_policies
where schemaname = 'public' and tablename = 'users' and policyname = 'users_select';
```

Expected row counts: 2 tables, then 3 columns, then 1 index, then 1 function,
then 1 policy whose `qual` is `(auth.uid() = id)` — not `true`, which is what
every signed-in role could read before this branch.
`licenses` and `operator_config` have RLS on and **no policies** — that is
intended: only the service role inside the edge functions may read them. The SQL
Editor cannot prove that (it runs as a superuser role), so read them the way a
signed-in browser would:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://<ref>.supabase.co/rest/v1/licenses?select=id" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>"

curl -s -o /dev/null -w '%{http_code}\n' \
  "https://<ref>.supabase.co/rest/v1/operator_config?select=name" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>"

curl -s "https://<ref>.supabase.co/rest/v1/users?select=id&limit=5" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>"
```

The first two must answer **401/403**, not a list of names. A `200 []` there
would mean RLS is on with a permissive policy — the one thing that would leak the
server's key names. The third answers **200 with `[]`**: the `users` policy
matches rows rather than blocking the table, and an anonymous caller owns no row.
Anything else — a list of ids — means `20261103000000` did not apply.

## Step 4 — Edge functions

```bash
npx supabase functions deploy
```

The plain command deploys every function and takes the JWT setting for each from
`supabase/config.toml`, which this branch already updated. Do **not** run it with
a blanket `--no-verify-jwt`: 30 of the 32 functions are listed there as
`verify_jwt = false`, and the two that are not — `get-quota-usage` and
`verify-password` — are remote-default **on**. The flag would silently switch
those two off, which is not part of this change.

Two consequences worth knowing before the run:

- The four new functions are new to the project, so their URLs
  (`/functions/v1/posts-api`, `…/operator-config`, `…/config-status`,
  `…/verify-license`) only answer after this step. The desktop app already
  points at `posts-api` for posts and accounts, so it is broken against a
  server that has not run Step 4 — do not split Step 4 across days.
- **`verify-password` loses its JWT exemption** in this branch's `config.toml`.
  Nothing in `src/`, `desktop-flutter/lib/` or the functions references it
  (checked by grep), so it is a dead path. If it is still deployed, it now
  requires a Supabase JWT; delete it, or leave it and expect 401 from any old
  caller.

Then confirm each deploy actually took, and that the four new ones answer with no
JWT (they should — `config.toml` lists them as `verify_jwt = false`):

```bash
npx supabase functions list

for f in posts-api operator-config config-status verify-license; do
  curl -s -o /dev/null -w "$f %{http_code}\n" \
    "https://<ref>.supabase.co/functions/v1/$f" -X POST -H 'Content-Type: application/json' -d '{}'
done
```

Four numbers, none of them `401`. A `401` on a new function means the CLI did not
pick up `config.toml` for it — redeploy that one alone with
`npx supabase functions deploy <name> --no-verify-jwt`. A `400` or a `500` with a
short message is the function answering, which is what is being proved here. A
`503` from `verify-license` is also it answering: `LICENSE_PEPPER` (Step 1) is
unset or shorter than 16 characters, and the function refuses to compare against
hashes it cannot reproduce — fix that before Step 6.

## Step 5 — The scheduler

`process-scheduled-posts` changed (it now clears `claimed_at` and only re-drives
rows claimed before a stale cutoff), but its name and URL did not, so the
`pg_cron` job created by `20260307000300_cron_process_scheduled_posts.sql` keeps
pointing at it. Nothing to re-create — just prove it still fires:

```sql
select d.jobid, d.runid, j.jobname, d.status, d.return_message, d.start_time
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where j.jobname = 'process-scheduled-posts'
order by d.start_time desc limit 5;
```

`status = 'SUCCEEDED'` on the newest row, within the last minute. A
`return_message` with `401` means the service-role bearer the job sends is no
longer accepted — check Step 4 did not leave that function needing a different
credential.

## Step 6 — The first license key

`verify-license` compares `HMAC-SHA-256(LICENSE_PEPPER, key)` against
`licenses.key_hash` (lowercase hex, key length 16–256 after trimming). Make the
key and its digest locally with the pepper from Step 1, then insert only the
digest — the commands live in the runbook, **License keys → Issue a key**
([docs/runbook.md](../docs/runbook.md)), so there is one copy of them.

For this first key set `user_id` to the admin `public.users` uuid instead of
leaving it null: a key without an owner shares the admin session, so activating
it on a desktop signs out the web admin gate.

Then unlock once from the app before Step 8, and read the two facts it should
have left behind:

```sql
select label, active, expires_at, last_used_at, user_id from public.licenses;
select user_id, expires_at from public.sessions order by expires_at desc;
```

`last_used_at` a few seconds old, and exactly one live `sessions` row for that
user. No row in `sessions` means the activation never reached the function — go
back to Step 4.

## Step 7 — Point the desktop at the server it just deployed

On one machine: the setup wizard (**first run**, or **Settings → Set up again**)
should reach `config-status` and list zero stored names, then store the platform
keys through `operator-config`. Success looks like:

- `config-status` answers names only — never values.
- A key saved by the wizard reads back as *set* with an empty field, and the
  next publish uses it (proof the sealed value opened).
- Re-entering the same name overwrites it, and `updated_by` on
  `public.operator_config` records who.

## Step 8 — Smoke, in this order

1. Web dashboard: sign in with an existing `public.users` row (signups are
   closed), open **Profile**, then list posts. The profile read is the proof that
   the narrowed `users_select` still returns the signed-in user's own row. A 401
   on the post list means `verify-session` did not deploy.
2. Desktop: unlock with the license key from Step 6, then let the queue load
   through `posts-api`. A refusal here after Step 4 passed means the key was
   hashed with a different pepper.
3. Publish one image to one platform. This is the run that exercises
   `claimed_at`, the duplicate index, and the operator key path.
4. Deactivate this PC (Settings → License), then unlock again with the same key:
   the second activation must succeed, which proves the stored digest is
   reproducible.
5. Offline check: cut the network, open the queue and calendar, restore —
   the cached rows read and the banner clears.

## Step 9 — #69, the live browser connect

Prerequisite, per platform: the OAuth app allowlists the redirect URI the
function actually sends — `https://<ref>.supabase.co/functions/v1/<platform>-auth`,
with `?action=callback` on the end for YouTube, Facebook, LinkedIn and Google
Drive and bare for Instagram and TikTok (`mega-auth` sends no redirect URI at
all). The desktop hands the browser a `return_to` of
`flowpost://connect-callback?platform=<p>&nonce=<64 lowercase hex>`, which
`_shared/oauth-state.ts` accepts only in that exact shape.

For one platform (YouTube is the least surprising to eyeball):

- [ ] Accounts → **Connect** → the browser opens on the platform consent screen,
      and the URL's `state` is 48 lowercase hex characters (`randomHex(24)`).
- [ ] Approve → the browser lands back on the app (web origin), **not** on a
      `supabase.co` URL that stays open.
- [ ] Desktop comes to the front on its own and the account card appears with
      the right label and `active` — the `flowpost://connect-callback` was
      dispatched and the nonce matched.
- [ ] `select state, used_at, return_to, expires_at from public.oauth_states
      order by created_at desc limit 3;` → that state row has `used_at` set and
      the `return_to` we sent. A row with `used_at` NULL is a walk-away: the
      state dies ten minutes after it is written, and the next connect sweeps
      expired rows out of the table (`_shared/oauth-state.ts:115`) — not a bug.
- [ ] Publish to that account from the Publish screen; the target list came from
      the server, so the row appears without any local account entry.
- [ ] Publish a second time to the same target while the first is still
      scheduled → **rejected** by `posts_one_live_per_target`, with the app's
      own sentence, not a raw Postgres error.
- [ ] Accounts → **Disconnect** → the card leaves, the platform target is gone
      from Publish, and the server's grant is dropped.
- [ ] Sign out **in the browser** at the platform afterwards → the desktop
      changes nothing (documented in `docs/runbook.md`); this is expected, not a
      regression.
- [ ] Revoke access at the platform → the card shows **expired** and offers
      **Reconnect**; Reconnect returns it to `active`.
- [ ] Quit the app, reopen, and connect a *second* platform: the deep-link
      handler still routes the callback (HKCU registration survives a restart).

Capture for the issue: the `oauth_states` row from the fourth box, a screenshot
of the expired → reconnect pair, and the Publish rejection message.

## Rollback

- **Functions.** `git checkout main -- supabase/functions supabase/config.toml
  && npx supabase functions deploy && git checkout HEAD -- supabase/functions
  supabase/config.toml`.
  This puts the old `posts-api`-less server back, so the desktop stops working —
  it is a rollback of the *web* only in practice.
- **Database.** Forward-only. `licenses`/`operator_config` are additive and
  harmless if left in place. `posts.claimed_at` is nullable and ignored by the
  old code. Two things can be undone, each only on a proven need:
  `drop index if exists public.posts_one_live_per_target;` if the old publish path
  must run again and the owner has re-opened those `failed` rows, and
  `drop policy if exists "users_select" on public.users;` if some real client
  turns out to need another user's row — the replacement for it reads every user
  row to any signed-in role, so put it back only with a `TO` clause that names
  who.
- **Secrets.** Leaving `TOKEN_ENCRYPTION_KEY` set harms nothing; deleting it
  breaks every stored token read. Deleting `LICENSE_PEPPER` (or changing it)
  makes every issued key stop matching, so unlocking then fails closed until a
  key is re-hashed under the new value.

## What this runbook does not cover

- The Vercel dashboard deploy (unchanged web build; #68 is the server side).
- `verify-password`'s removal from the project — a separate decision.
- Anything the owner alone can do: the actual commands above need their Supabase
  login, their project ref and their service role.
