# ADR 0004: Credentials entered in Settings, not only at build time

**Status:** Accepted (2026-10-30)
**Module:** `config`
**Deciders:** project owner

## Context

The Windows client needs a Supabase URL and an anon key before it can sign in, and an optional update-manifest URL for the manual update check. Phase 3 shipped these as compile-time `--dart-define` values from `config/dev.json`, so a build was tied to one project and one operator: anyone who downloaded the app had to rebuild it to point it at their own Supabase project.

The owner asked for the values to be enterable in the app instead, so a user can add whichever credentials they need.

## Decision

Keep three ways to supply the config, in this order:

1. **Saved values** in `credentials.json` beside `accounts.json` in the app support folder (`%APPDATA%\com.flowpost\FlowPost`), written through a `.tmp` file and a rename so a crash cannot leave a half-written file.
2. **Compiled values** from `--dart-define` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `UPDATE_MANIFEST_URL`).
3. **First run** at `/setup` outside the app shell when neither exists.

Rules that follow from that:

- The saved file wins; a backend change (save or clear) signs the user out and wipes `cache.db`, so no row from the old project survives the switch.
- An unreadable or invalid saved file is an error, never a silent fallback to compiled values: a project has to be chosen, not guessed.
- Validation is shared (`configFieldProblem`): HTTPS URLs, a non-empty anon key, and a key shaped like `sb_secret_`/`service_role` is refused by name.
- The anon key is masked in the UI with a Show toggle, and values are excluded from logs and the diagnostics export.

## Consequences

- One installer works against any Supabase project; the operator no longer rebuilds to change backends.
- The anon key is public by design; the service-role key never reaches the client, so saving one is refused rather than ignored.
- `credentials.json` sits on disk in plain text. It holds only a publishable key; the session and the admin token stay in memory (ADR 0001), so nothing here is a bearer secret.
- A user who loses the file returns to `/setup`; there is no recovery path because there is nothing secret to recover.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Compile-time values only | Requires a rebuild per backend; blocks the open-source installer. |
| `flutter_secure_storage` for the config | Protects a value that is public by definition, and adds a Windows plugin for no gain. |
| Store config in `cache.db` | Mixes configuration with throwaway cache; clearing the cache would silently reset the backend. |
| Prompt on every start | Repeats work the user already did; a typo is discovered late. |
