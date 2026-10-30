# Security policy

## Reporting a vulnerability

Do not open a public issue for a security problem. Use GitHub's private
[security advisory](https://github.com/S-Q-Ali/flowpost-studio/security/advisories/new)
form instead. Include the affected area (dashboard, edge function, desktop
client), the steps to reproduce, and what an attacker gains.

You can expect an acknowledgement within a few days. If the report is valid,
the fix and a coordinated disclosure date are agreed before anything is made
public.

## Scope

In scope:

- Edge functions under `supabase/functions/` — authentication, owner checks, uploads, OAuth callbacks
- Row Level Security policies in `supabase/migrations/`
- The dashboard under `src/`
- The Windows client under `desktop-flutter/`
- Both clients handling of tokens, credentials, logs and diagnostics

Out of scope:

- Reports that need a leaked credential to reproduce; rotate it and tell us where it leaked instead
- Denial of service through sustained load
- Issues that only affect a dependency whose patched version is already available upstream, unless this repository pins the vulnerable range

## Supported versions

The repository ships from `main`. Only the latest build is supported.

## Secrets

No service-role key, OAuth client secret, API key or personal access token
belongs in this repository. The client only ever holds the Supabase anon key.
If you find a secret in the code or history, report it privately; do not paste
the value into an issue, a pull request or a chat.
