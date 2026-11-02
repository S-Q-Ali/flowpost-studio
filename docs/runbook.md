# Runbook

Support, release and rollback notes for the web dashboard and the Windows client.

## Where the desktop client keeps things

| Item | Path |
|---|---|
| Data root | `%APPDATA%\com.flowpost\FlowPost` |
| Supabase URL, anon key, update manifest URL | `credentials.json` in the data root |
| Local account list (platform, label, status only) | `accounts.json` in the data root |
| Read cache | `cache.db` in the data root |
| Offline drafts | `drafts.db` in the data root |
| Log | `logs\app.log`, rotates to `app.log.1` at 1 MB |
| Diagnostics export | `flowpost-diagnostics-<stamp>.txt` in the folder the user picks in Settings |
| Media workspace | `%LOCALAPPDATA%\com.flowpost\FlowPost\media\jobs\<job-id>` |
| Installation | `%LOCALAPPDATA%\Programs\FlowPost Studio` |

Tokens are kept in Windows Credential Manager through `flutter_secure_storage` (the Supabase session, the PKCE verifier and the `flowpost_token`); nothing token-like is written to the data root, SQLite or the log. OAuth codes, states, keys and paths are redacted before anything reaches the log. Signing out removes every stored record.

## Platform accounts and browser sign-out

A platform connection (YouTube, Instagram, Facebook, TikTok, LinkedIn) is an OAuth grant the **server** holds; the desktop keeps only the platform, the account label and its status — never the platform token. Connecting is a one-time browser sign-in that hands that grant to the server.

Because of that, signing out of the platform **in the browser** does nothing to the connection: the desktop still lists the account and still publishes, because publishing runs on the server's stored grant, not on a browser session. The connection only ends when one of these happens:

- **Disconnect** in the app — the server drops the grant and the account leaves the publish targets.
- The user **revokes this app's access** at the platform, or the platform's refresh token expires — the next server call fails, the account shows **expired**, its card reads "Nothing publishes until it is connected again", and **Reconnect** appears. Signing in again mints a fresh grant.

Signing out of the **desktop app** is separate: it removes every local record as above and returns to sign-in; it does not touch the server's platform grants, so a later sign-in sees the same connected accounts.

## First-line support

1. Ask for the version shown in **Settings → About**.
2. Ask for a **Settings → Diagnostics → Export** file. It carries the version, the state of `cache.db`, `drafts.db`, `credentials.json` and the tail of `app.log`, with secrets and paths already cleaned.
3. For a start that dies before the window appears, Windows shows a message box with the exit code; the crash handler has already written the reason to `app.log`.
4. Only after the log is captured, ask the user to restart the client.

## Symptoms

| Symptom | Likely cause | What to do |
|---|---|---|
| Window never appears; message box about the start | Unreadable `credentials.json`, or another instance holds the lock | Read `app.log`. If the file is invalid, the client refuses to start rather than guessing: fix or delete `credentials.json` and reopen the setup wizard |
| "Checking the file…" never ends | FFmpeg missing or a probe timeout | Confirm `third_party\ffmpeg\bin\ffmpeg.exe` shipped next to the executable; the log distinguishes a missing build from a damaged file |
| Sign-in rejected | Signups are closed, or the password is wrong | Only an existing `public.users` row may sign in; check the account in Supabase |
| Edge calls return 401 | The admin session token expired or another client minted a newer one | Sign in again through the security-questions gate (a new token invalidates the others) |
| Queue row stuck on "processing" | The publish call died mid-flight | Delete the row after 30 minutes; the app offers it, then re-run the publish |
| "Update check failed" | `UPDATE_MANIFEST_URL` empty or unreachable | Empty is valid before release hosting exists; the check is manual and non-blocking |
| Deep link ignored | Path outside `/` and `/auth-callback`, or the app never ran for this user | The link is rejected and logged without its query string; launch the app once to re-register `flowpost://` |
| Publish fails with a short sentence | The platform refused the upload | The service text is cleaned (no URLs or paths) before it reaches the screen and the log; retry from the row menu |
| An account shows expired and will not publish | The platform grant was revoked or the refresh token expired — not a browser sign-out | See **Platform accounts and browser sign-out**; a browser sign-out changes nothing, so use **Reconnect** on the card to mint a fresh grant |

## Release checklist (desktop)

1. `cd desktop-flutter`
2. `dart format --set-exit-if-changed lib test integration_test`
3. `flutter analyze lib test integration_test`
4. `flutter test`
5. `flutter test integration_test -d windows --dart-define-from-file=config/dev.json`
6. `tool\fetch_ffmpeg.ps1` once per checkout
7. `flutter clean`, then `flutter build windows --release --dart-define-from-file=config/prod.json`
8. `& "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe" installer\flowpost.iss`
9. Install the output on a clean Windows 10 and 11 machine; check Start Menu, uninstall, and that `flowpost://auth-callback` reaches the app
10. Record the installer checksum next to the release

Quit the tray app before a build: Windows locks `cnativeapi.dll` while it runs. The installer is unsigned, so SmartScreen shows "Windows protected your PC"; publish the checksum and tell users to trust it before choosing **More info → Run anyway**.

## Release checklist (web and backend)

1. `npm run build`, `npm run lint`, `npm test`
2. `npx supabase db push` if migrations are new
3. `npx supabase functions deploy` (or name the changed functions)
4. Deploy the dashboard through the usual Vercel pipeline
5. Sign in, connect one account, publish one post end to end

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
