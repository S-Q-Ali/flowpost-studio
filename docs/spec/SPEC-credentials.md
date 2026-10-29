# Spec: `credentials` — Backend Values the User Can Enter (Phase 6.4)

**Module:** `credentials` (see `docs/spec/flowpost-native-capability-map.md`)
**Status:** Proposed 2026-10-30 (Phase 6.4); awaiting the owner's approval
**Depends on:** `shell` (the startup sequence and the router), `settings` (the section that hosts the form)
**Blocks:** 6.5 (cold start is measured on this path), 6.6 (the security review reads this store), 6.7 (the README's setup step)

---

## Objective

Let any user point the app at their own backend from the UI — no rebuild, no `--dart-define-from-file` — while keeping the existing validation and keeping secrets out of the client.

**User:** anyone who installs the app and has a Supabase project and, optionally, an update manifest.

**Success looks like:** a build with no compiled values opens a setup screen, the user types a URL and a key, saves, and the app works; the same fields in Settings change the backend later; a pasted service-role key is refused with a sentence that says why.

## Scope

In:

- A **Credentials** section in Settings: Supabase URL, anon/publishable key, update manifest URL.
- A first-run **setup screen** for a build whose compiled values are absent or invalid.
- A local store that survives restart, plus clear.
- One optional **Test connection** action.

Out:

- **Platform API secrets** (YouTube, Instagram, TikTok, Facebook, LinkedIn). They live in the edge functions; the client never holds them and does not accept them.
- **A service account or any Supabase secret.** A key that looks like one is refused, not stored.
- **Per-account credential profiles.** One set per machine; switching backends is a manual edit.
- **Editing the session.** Sign-in stays with the identity module.
- **An in-app proxy or custom edge-function host.** The function URLs are derived from the Supabase URL.

## Where the values live

`%APPDATA%\flowpost_desktop\credentials.json` — the support folder, beside `accounts.json`, `cache.db` and `drafts.db`.

```json
{
  "supabaseUrl": "https://project.supabase.co",
  "supabaseAnonKey": "eyJ…",
  "updateManifestUrl": "https://example.com/update.json"
}
```

Written `.tmp` then renamed, the same rule as the diagnostics export, so a half-write never replaces a good file. Read once at startup; the whole file is replaced on save and deleted on clear.

## Precedence

| Saved file | Compiled (`--dart-define-from-file`) | What the app uses |
|---|---|---|
| valid | any | the saved file |
| absent | valid | the compiled values (today's behaviour, no visible change) |
| invalid | any | nothing — the setup screen names the problem |
| absent | absent or invalid | the setup screen |

An invalid saved file is **never** silently bypassed: falling back to the compiled values would send requests to a different backend than the user asked for.

## The Settings section

Between **Session** and **Updates** (the manifest URL feeds that section):

| Field | Rule | Required |
|---|---|---|
| Supabase URL | https, has a host | yes |
| Anon / publishable key | not empty; refused if it is a service-role or secret key | yes |
| Update manifest URL | https, or empty | no |

The form starts from the values in use. Fields are obscured with a **Show** toggle, because the key is long and easy to mistype. Two lines of state say which source is live: "Using the values saved on this machine" or "Using the build's defaults".

Actions: **Test connection**, **Save**, and **Clear saved values** (only when a file exists). Clear asks first, naming what happens: the build's defaults come back, or the setup screen if there are none. Clearing counts as a backend change: with a session it signs out and wipes `cache.db`, the same rule as saving.

## States

- **First run.** No usable values: the app starts on `/setup`, outside the app shell — a title, the three fields, the validation messages, and **Save and continue**. There is no skip: every network feature needs the address, and the release build ships compiled defaults, so this screen is a recovery path, not the normal first run.
- **Invalid saved file.** The setup screen opens with one line above the fields: "The saved credentials could not be used: <reason>", and the fields are empty. The file is left on disk until the user saves or clears.
- **Validation.** Messages name the fix, not the rule: "Use an https address, for example https://project.supabase.co", "This looks like a service-role key. The app only accepts the public anon/publishable key."
- **Save.** Checks the fields when pressed: an invalid field is named under it and nothing is written. On success a quiet "Saved" line and the source line changes. A write failure keeps the previous values live and says the file could not be written; nothing in memory changes.
- **Test connection.** Calls `GET <supabaseUrl>/rest/v1/` with the `apikey` header and the manifest URL (when set) through the existing checker. Answers: "The server answered.", "The server answered but refused this key.", "The server answered with <status>.", "Could not reach the server." Testing is optional; Save works offline.
- **A backend change while signed in.** Saving a different URL or key — or clearing saved values that differ from the defaults that come back — signs out and wipes `cache.db` (SPEC-settings Decision 3); `drafts.db` is kept (SPEC-offline Decision 8), because a post from the old backend must not look like one from the new one.

## Decisions (need the owner's yes)

| # | Decision |
|---|---|
| 1 | The client accepts exactly three values: Supabase URL, anon/publishable key, update manifest URL. Platform API secrets stay in the edge functions and are not fields. |
| 2 | Saved values win over compiled values; compiled values are the default when no file exists; an invalid file stops the app at setup instead of falling back. |
| 3 | Storage is a plain JSON file beside `accounts.json`, written `.tmp` then renamed. DPAPI is rejected: the anon key is public by design, it already ships inside the release binary, and Windows DPAPI would add a native call to protect a non-secret — a real secret is refused at the field instead. |
| 4 | Validation reuses `AppConfig.fromValues` (https only, non-empty, refuses `sb_secret_`, `service_role`, and a JWT whose role is `service_role`) so the file and the compiled path cannot drift. A trailing `/` is trimmed before saving. |
| 5 | `appConfigProvider` stays the single `Provider<AppConfig>` seam at its current type, so the existing tests and consumers do not change; its value now comes from a `configControllerProvider` that main loads from the file, and saving rebuilds every watcher (captions, upload, publishing, scheduling, the posts transport, Home's update check). |
| 6 | The setup screen replaces `ConfigErrorApp`; the old widget and its test are deleted, and the compiled-invalid case shows the same screen with the reason. |
| 7 | The router gains `/setup` outside the `ShellRoute` and a redirect that keeps every screen on it while no config exists, and away from it once one does. |
| 8 | Fields are obscured with a Show toggle; no value is logged, and the report never contains one — the diagnostics collector reads `cache.db` and `drafts.db` by name only, so `credentials.json` is not in an export. |
| 9 | Test connection is optional and never gates Save; it reports reachability, and a 401/403 is reported as a refused key rather than a network failure. |
| 10 | `--dart-define-from-file` stays: development, tests, and the compiled defaults in the release build. The README gains a "point the app at your project" step. |

## Tests

- Unit: the store round-trips, replaces, clears, and treats a corrupt file as invalid; precedence table above, one test per row; trimming; each validation message (http URL, empty field, `sb_secret_`, service-role JWT, non-key text); the log carries no value.
- Controller: saving changes what `appConfigProvider` answers; saving a different URL while signed in clears the session and wipes the cache (fake cache, fake drafts untouched); clearing to a different backend does the same; a failed write leaves the old values live.
- Widget: `/setup` renders when nothing is configured and saving lands on Home; the Settings section shows the compiled defaults, the saved values, and the Show toggle; an invalid field is named and nothing is written; Clear asks first and puts the defaults back; the same backend keeps the session; each Test connection answer through an injected transport.
- Diagnostics: the report is built from facts that carry no config, and the existing redaction test keeps a key or token that reached a log line out of the file.
- Manual: clean the support folder, start the installed build, save values, restart, and confirm the source line and a working update check.

## Verification

`dart format --set-exit-if-changed lib test integration_test` clean, `flutter analyze lib test` no issues, `flutter test` green, `flutter build windows --release` succeeds.

## Open questions

None. The three that mattered — which values the client may hold, that a saved file wins and an invalid one stops, and that storage is a plain file — are decisions 1, 2 and 3.
