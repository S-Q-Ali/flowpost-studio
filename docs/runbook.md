# Runbook

Support, release and rollback notes for the web dashboard and the Windows client.

## Where the desktop client keeps things

| Item | Path |
|---|---|
| Data root | `%APPDATA%\com.flowpost\FlowPost` |
| Supabase URL, publishable key, update manifest URL | `credentials.json` in the data root |
| Local account list (platform, label, status only) | `accounts.json` in the data root |
| Read cache | `cache.db` in the data root |
| Offline drafts | `drafts.db` in the data root |
| Log | `logs\app.log`, rotates to `app.log.1` at 1 MB |
| Diagnostics export | `flowpost-diagnostics-<stamp>.txt` in the folder the user picks in Settings |
| Media workspace | `%LOCALAPPDATA%\com.flowpost\FlowPost\media\jobs\<job-id>` |
| Installation | `%LOCALAPPDATA%\Programs\FlowPost Studio` |

Tokens are kept in Windows Credential Manager through `flutter_secure_storage` — since the license pivot that means exactly three records: `flowpost.license.token`, `flowpost.license.expires_at` and `flowpost.license.key`. Nothing token-like is written to the data root, SQLite or the log. OAuth codes, states, keys and paths are redacted before anything reaches the log. **Deactivate this PC** removes those three records and wipes the read cache.

## Platform accounts and browser sign-out

A platform connection (YouTube, Instagram, Facebook, TikTok, LinkedIn) is an OAuth grant the **server** holds; the desktop keeps only the platform, the account label and its status — never the platform token. Connecting is a one-time browser sign-in that hands that grant to the server.

Because of that, signing out of the platform **in the browser** does nothing to the connection: the desktop still lists the account and still publishes, because publishing runs on the server's stored grant, not on a browser session. The connection only ends when one of these happens:

- **Disconnect** in the app — the server drops the grant and the account leaves the publish targets.
- The user **revokes this app's access** at the platform, or the platform's refresh token expires — the next server call fails, the account shows **expired**, its card reads "Nothing publishes until it is connected again", and **Reconnect** appears. Signing in again mints a fresh grant.

Signing out of the **desktop app** is separate: there is no sign-out, only **Settings → License → Deactivate this PC**, which removes the license records above, ends the session and wipes the read cache (`drafts.db` is kept on purpose, so an unpublished draft survives). It does not touch the server's platform grants, and it does not delete the session row the key minted — that expires on its own within seven days. A later activation on the same PC sees the same connected accounts.

## License keys

The desktop has no account. It unlocks with a key the owner issues, and only the
`HMAC-SHA-256(LICENSE_PEPPER, key)` digest is stored — the plaintext key exists
in the hand-off and on the user's PC. One key mints one live session per user,
for seven days. Full design: [ADR 0006](adr/0006-license-key-desktop-access.md),
behaviour and threat model: [SPEC-license](spec/SPEC-license.md).

### Issue a key

Make the key and its digest **locally**, with the pepper that is already set as
an edge-function secret — a digest made with a different pepper never matches:

```powershell
$key = "FLOWPOST-" + [guid]::NewGuid().ToString("N").ToUpper()
$pepper = "<the LICENSE_PEPPER value>"        # never commit, paste into an issue, or store in a file
$hmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($pepper))
$hash = -join ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($key)) | ForEach-Object { $_.ToString("x2") })
"$key`n$hash"                                  # give $key to the holder, insert $hash
```

```sql
insert into public.licenses (key_hash, label, active, user_id)
values ('<hash>', '<who it is for>', true, '<auth.users uuid>');
```

`label` is the only human-readable thing in the row — fill it in, it is how you
recognise the key later. `user_id` is optional but recommended: with it the
session is that user's and other users' sessions are untouched; without it every
such key shares the admin session, so a second activation signs out the first
(and the web admin gate). A key holder types the value into the app's
**Unlock FlowPost** screen; send it over a channel you trust, because the digest
cannot be turned back into it but the key itself is the credential.

### Check what a key is doing

```sql
select l.label, l.active, l.expires_at, l.last_used_at,
       (s.token is not null) as session_live, s.expires_at as session_until
from public.licenses l
left join public.sessions s on s.user_id = l.user_id
order by l.created_at desc;
```

`last_used_at` moves on every successful activation, which is the only clue that
a key is being shared. The app never sends the key to anyone but
`verify-license`, and it is never in a log or a diagnostics export.

### Stop a key

```sql
update public.licenses set active = false where label = '<who>';
delete from public.sessions where user_id = '<that user uuid>';
```

`active = false` blocks the next activation at once, but a session already
minted keeps working until its own expiry — so delete the row too when the reason
is a lost PC or a person who should stop today. The user's app then lands on the
license screen with "This license key is not valid." on its next call. Set
`expires_at` instead when the stop was always scheduled; `null` means no expiry.

To let a holder start over with a new key, `update … set active = true` and give
them a fresh digest; deleting the `licenses` row forgets the key entirely.

### The pepper rule

`LICENSE_PEPPER` (≥16 characters) is set-once, like `TOKEN_ENCRYPTION_KEY`: a
digest cannot be recomputed under a second pepper and there is no rewrap. If it
is unset or too short, `verify-license` answers **503** and every desktop stops
at the license screen — it fails closed rather than guessing. If it is genuinely
lost or rotated, re-issue every key: delete the `licenses` rows, hash new keys
under the new pepper, and tell each holder to type the new one.

## First-line support

1. Ask for the version shown in **Settings → About**.
2. Ask what **Settings → License** shows — an expiry, the word "offline", or a sentence. That separates a key problem from a backend problem before anything else is touched.
3. Ask for a **Settings → Diagnostics → Export** file. It carries the version, the state of `cache.db`, `drafts.db`, `credentials.json` and the tail of `app.log`, with secrets and paths already cleaned.
4. For a start that dies before the window appears, Windows shows a message box with the exit code; the crash handler has already written the reason to `app.log`.
5. Only after the log is captured, ask the user to restart the client.

## Symptoms

| Symptom | Likely cause | What to do |
|---|---|---|
| Window never appears; message box about the start | Unreadable `credentials.json`, or another instance holds the lock | Read `app.log`. If the file is invalid, the client refuses to start rather than guessing: fix or delete `credentials.json` and reopen the setup wizard |
| "FFmpeg is missing. Reinstall the app to process media." or "Checking the file…" never ends | The build shipped without FFmpeg, or a probe timed out | The app looks for `ffmpeg.exe` and `ffprobe.exe` in `<exe folder>\ffmpeg\bin` — see the note under the desktop checklist; the log distinguishes a missing build from a damaged file |
| Dashboard sign-in rejected | Signups are closed, or the password is wrong | Only an existing `public.users` row may sign in; check the account in Supabase. The desktop has no sign-in — see **License keys** |
| "This license key is not valid." | No row matches, the row is inactive, its expiry passed, or the key is under 16 or over 256 characters | Look the key up (License keys → **Check what a key is doing**). A 401 never says which of those it was, on purpose |
| "Too many attempts…" | One of the two `verify-license` buckets spent (10 per 15 minutes per IP, per key) | Wait out the countdown the app shows; check nothing is looping activations from one machine |
| The license screen appears while the user works | The stored key was refused: the row went inactive, its `expires_at` passed, or another machine took the same user's session | The app already tried to renew silently and the server said no. Check the row, then issue or re-activate |
| Edge calls return 401 | The minted session expired, or a newer activation replaced it | Both `verify-license` and `verify-security-questions` mint that user's one live session; the desktop renews from its stored key, so a persistent 401 means the key is gone |
| A workflow appears to have run but nothing published | No ready rows, a source failure, or posts still being processed | Read **Workflow run history** below; `posts_created` is not proof of publication |
| Queue row stuck on "processing" | The publish call died mid-flight, or the row was wedged by the orphan index (see **Posts wedged on a live status**) | Read the status counts below before touching a row; deleting or retrying one that already reached the platform publishes twice |
| "Update check failed" | `UPDATE_MANIFEST_URL` empty or unreachable | Empty is valid before release hosting exists; the check is manual and non-blocking |
| Deep link ignored | Anything but `/` (the router's allowlist) or `flowpost://connect-callback` (the connect dispatcher), or the app never ran for this user | The link is rejected and logged without its query string; launch the app once to re-register `flowpost://` |
| Everyone stops at the license screen, each seeing "Something went wrong. Try again." | `LICENSE_PEPPER` is unset or shorter than 16 characters, so `verify-license` answers 503 and refuses to guess | Set the pepper in **Edge Functions → Secrets**. Do not change a pepper that issued keys already — see **License keys** |
| Publish fails with a short sentence | The platform refused the upload | The service text is cleaned (no URLs or paths) before it reaches the screen and the log; retry from the row menu |
| An account shows expired and will not publish | The platform grant was revoked or the refresh token expired — not a browser sign-out | See **Platform accounts and browser sign-out**; a browser sign-out changes nothing, so use **Reconnect** on the card to mint a fresh grant |

## Posts wedged on a live status

`posts_unique_per_account` on `(video_id, platform, account_id, status)` existed
only in production: no migration in this repo creates it, and it made the second
post of one video to one account refuse its `published` write with 23505. The
platform call had already succeeded, so the row stayed `processing` or
`publishing` forever and the reaper reported the same index every cron run.

`20261107000000_drop_orphan_posts_unique_index.sql` removes it.
`posts_one_live_per_target` stays: it is the repo's own rule, it covers only
live statuses, and `process-workflow` now filters live targets before inserting.

Apply the migration first, then count what it freed. Neither number is a
published count, and nothing here settles rows automatically — a retry of a row
that already reached the platform publishes it twice:

```sql
select status, count(*)
from public.posts
where status in ('scheduled', 'processing', 'publishing')
group by status
order by status;

select id, platform, account_id, status, claimed_at, created_at
from public.posts
where status in ('processing', 'publishing')
order by created_at
limit 50;
```

For each row the owner decides: mark it `published` when the post is live on the
platform, or `failed` when it is not. `failed` is what makes the row retryable
from the Queue.

## Workflow run history

After the W2 migrations and deployments, each entered workflow has a best-effort
row in `workflow_runs`. Schedule skips and lock conflicts create no row.

- `completed`, zero ready rows: nothing was ready; old trigger timestamps can remain unchanged.
- `posts_created`: inserted target posts, including tracked Instagram stories. This is **not a published count**; inspect the posts' status before retrying to avoid duplicates.
- `failed`: read `message`. Counts can be nonzero if failure followed a successful insert.
- `still running`: no close has been recorded. A successful later tick marks rows older than 20 minutes failed with "the run stopped answering". This is a heuristic, not a guaranteed total runtime limit.
- `Run history unavailable`: the card's read failed or timed out. Check that the table and `latest_workflow_runs()` RPC were deployed; do not infer that the workflow never ran.

History writes and maintenance use one-second abort deadlines and do not fail
publishing. Missing history therefore does not prove missing work. Retention is
90 days, purged on successful scheduler maintenance.

Authorized read-back in the project's SQL editor (do not invoke **Run now** to test history):

```sql
select workflow_id, triggered_by, status, rows_seen, posts_created,
       message, started_at, finished_at
from public.workflow_runs
order by started_at desc
limit 20;
```

Deploy only after a fresh approval, in order:

1. Apply `20261105120000_workflow_drift.sql`, `20261105130000_workflow_runs.sql`, then `20261105140000_latest_workflow_runs.sql`. Use `db push` when reachable, or the ordered Management API procedure in `tasks/deploy-server-68.md`; preserve migration tracking.
2. Deploy `process-workflow`, then the web dashboard. No other publisher needs redeployment for W2.
3. Wait for a naturally due cron tick; read back entered runs and their close statuses. A scheduled skip is not missing history.
4. Owner checks the cards in the signed-in browser and confirms that another user's runs are not visible. Live publishing remains an owner-run check.

**State as of 2026-11-05:** step 1 and the `process-workflow` half of step 2 are
live on this project — the three migrations are applied and recorded under their
filename versions (`db push` sees no drift), and the function is at v158. The
dashboard half of step 2 and steps 3–4 are still open. `workflow_runs` is empty
in production because the first tick after the deploy (18:15 UTC) fell outside
both active workflows' `custom_ranges`, which are UTC hours; an un-entered
workflow writes no row. Re-applying step 1 is not needed and is a no-op anyway —
every statement in those files is guarded. Evidence:
`tasks/todo-2026-11-05-workflows.md`, section **DP**.

Local tests, a web build and `supabase functions deploy` do not type-check the
Deno entry points — deployment bundles the code without checking it. The CI
**Edge Functions** job does, and its very first run reported 77 type errors, at
least eight of them defects that would have broken a live function. Read ADR
`0007-workflow-run-history.md` and the workflow todo, then see **What CI proves**
below for the gates that stay manual.

### What CI proves

The pipeline runs four jobs on every push and pull request:

- **Web** — `npx tsc -b`, `npm test` (vitest, including the `_shared/*.test.ts`
  Deno-source harnesses), `npm run build`, `npm audit --omit=dev`.
- **Lint** — `npm run lint`.
- **Edge Functions** — `deno check` over every deployed function.
- **Desktop** — `dart format`, `flutter analyze`, `flutter test`.

That is compile-time truth plus pure-logic tests. CI never proves that the
deployed schema matches what a query assumes, that RLS still hides another user's
rows, that a platform API answers the way the client expects, that a scheduled
cron tick fires, or that a secret is actually set in production. Those stay
release gates: the read-back above and the owner's live checks.

A pull request needs **Web**, **Lint**, **Desktop** and **Edge Functions** to pass
before it can merge, with `strict: true` so a branch behind `main` has to be
updated first. `enforce_admins` is off, so a direct push to `main` runs the same
jobs but is not gated by them; check the run before deploying.

## Release checklist (desktop)

1. `cd desktop-flutter`
2. `dart format --set-exit-if-changed lib test integration_test`
3. `flutter analyze lib test integration_test`
4. `flutter test`
5. `flutter test integration_test -d windows --dart-define-from-file=config/dev.json`
6. `tool\fetch_ffmpeg.ps1` once per checkout
7. `flutter clean`, then `flutter build windows --release --dart-define-from-file=config/prod.json`
8. `& "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe" installer\flowpost.iss`
9. Install the output on a clean Windows 10 and 11 machine; check Start Menu, uninstall, that the guided setup reaches `config-status`, that a license key unlocks the app, and that `flowpost://connect-callback` brings the app to the front
10. Record the installer checksum next to the release

Quit the tray app before a build: Windows locks `cnativeapi.dll` while it runs. The installer is unsigned, so SmartScreen shows "Windows protected your PC"; publish the checksum and tell users to trust it before choosing **More info → Run anyway**.

Step 7 alone leaves `build\windows\x64\runner\Release` without FFmpeg — only the installer and the portable stage in `scripts\build-desktop.ps1` copy `third_party\ffmpeg\bin` next to the exe. Running that bare `flowpost.exe` gives "FFmpeg is missing"; for a local run copy the folder yourself:

```powershell
Copy-Item -Recurse -Force desktop-flutter\third_party\ffmpeg\bin desktop-flutter\build\windows\x64\runner\Release\ffmpeg
```

The provider resolves FFmpeg once and caches it, so an app that already showed that message keeps it until it is restarted.

## Release checklist (web and backend)

1. `npm run build`, `npm run lint`, `npm test`
2. Type-check the Edge Functions (see below)
3. `npx supabase db push` if migrations are new
4. `npx supabase functions deploy` (or name the changed functions)
5. Deploy the dashboard through the usual Vercel pipeline
6. Sign in, connect one account, publish one post end to end

### Type-checking the Edge Functions locally

The gate is the CI `functions` job. Run the same command locally before a deploy:

```bash
cd supabase/functions
deno check --no-lock $(ls */index.ts) $(ls _shared/*.ts | grep -v '\.test\.ts$')
```

`supabase/functions/deno.json` turns on `nodeModulesDir: "auto"`. Without it
Deno 2.9.8 refuses to resolve the `npm:` specifiers the functions import; with
it, the first run installs them into `supabase/functions/node_modules`
(gitignored). The file pins nothing — every function keeps its own
`npm:@supabase/supabase-js@2.49.0` specifier — so there is no dependency setting
for a deploy bundle to pick up, which is the thing Supabase's docs warn against
putting in a global `deno.json`. The `*.test.ts` files import vitest, which only
Node resolves; vitest runs them in the web job, this job checks the code that is
actually deployed.

Deno is not installed on this machine. Put the official Windows build outside the
repo and use it by path; the version must match the pin in
`.github/workflows/ci.yml`, because Deno's bundled TypeScript and lib types move
between minors.

```powershell
Invoke-WebRequest -OutFile deno.zip https://github.com/denoland/deno/releases/download/v2.9.8/deno-x86_64-pc-windows-msvc.zip
Expand-Archive .\deno.zip -DestinationPath E:\tmp\deno
E:\tmp\deno\deno.exe --version
```

Check the download before using it. GitHub's `.zip.sha256sum` is PowerShell
output, not the `sha256sum -c` format, so compare the two digests by hand against
`Get-FileHash .\deno.zip`.

## Rollback

**Desktop.** Keep the previous installer artifact. Run it over the current install; the data root (`%APPDATA%\com.flowpost\FlowPost`) is untouched. If the new build migrated a local database, the older build may refuse the file: move `cache.db` (safe, it is rebuilt) or `drafts.db` aside only after exporting the drafts. Deleting `credentials.json` sends the next start to the setup wizard.

**Edge functions.** The previous code is in git:

```bash
git checkout <previous-commit> -- supabase/functions
npx supabase functions deploy <function-name>
git checkout HEAD -- supabase/functions
```

**Database.** Migrations are forward-only. A rollback plan for data changes must be written before the migration is pushed; otherwise restore from a Supabase backup.

**Web.** Vercel keeps every deployment; promote the previous one.

## Rotating a credential

1. Revoke the value at the provider (Google, Meta, TikTok, LinkedIn, Groq, Cloudflare R2, Supabase).
2. Issue a new one.
3. Edge function secrets: update in **Supabase Dashboard → Edge Functions → Secrets**; the next isolate picks the new value up, no redeploy needed.
4. Client-side credentials: the owner enters them in **Settings → Credentials** on the desktop or in `.env.local` for the dashboard.
5. Never paste a secret into an issue, a commit, or `.env.example`; that file ships with the repository.

### TOKEN_ENCRYPTION_KEY is different

`TOKEN_ENCRYPTION_KEY` (see ADR 0005) is the AES-GCM key that seals every operator key in `operator_config` and every platform token in `connected_accounts`. It is not a credential you rotate for hygiene — rotating or replacing it makes all previously stored values unreadable, because they were sealed with the old key and there is no rewrap.

If the key is changed or lost:

1. Every connected account becomes, in effect, expired: the server can no longer open its token. Each one must be **Reconnect**ed from the Accounts screen.
2. Every operator key the guided setup stored is unreadable. The `secrets` reader treats an unopenable stored value as missing and falls back to the environment, so a value that is *also* still an edge-function secret keeps working; a value stored *only* in `operator_config` must be re-entered in the wizard.
3. Set the new key under **Edge Functions → Secrets** before the next publish, and expect failures until the accounts and stored keys are re-supplied.

Do not rotate it routinely. Keep it stable, and back it up as part of the project's secrets.

### LICENSE_PEPPER is the same kind of secret

`LICENSE_PEPPER` is not rotated for hygiene either, and losing it is not a
credential leak — it is a re-issue. See **License keys → The pepper rule** for
what happens when it is unset (every desktop stops at the license screen) and
what changing it costs (every key re-issued).
