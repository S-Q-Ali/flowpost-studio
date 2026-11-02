# ADR 0005: The server holds every secret; the desktop holds none of them

**Status:** Accepted (2026-11-02)
**Module:** `config` (server keys) and `accounts` (platform tokens)
**Deciders:** project owner

## Context

FlowPost can run fully from the Windows client, but the client is not where the
work happens. A publish fans out to YouTube, Instagram, Facebook, TikTok and
LinkedIn through Deno edge functions, and an AI caption goes to Groq. All of
that needs credentials — the operator's own API keys and OAuth client secrets,
and, once a platform is connected, that platform's access and refresh tokens.

The guided setup (Phase E) lets an operator enter those keys from inside the
app, and the browser connect (Phase F) lets a user link a platform from inside
the app. Neither is useful if the secrets then sit on the PC: the original plan
assumed a separate Vault for the config store. Supabase hosting has no Vault,
and a personal-use app on the free plan cannot require one. This ADR records
where the secrets actually go, and the deviation from that plan.

## Decision

Keep two kinds of secret on the **server**, both encrypted at rest with one
AES-GCM helper, and let the client hold neither.

**Encryption.** `functions/_shared/crypto.ts` seals a value with `AES-GCM` under
`TOKEN_ENCRYPTION_KEY` (a base64 256-bit key read from the edge-function
environment). Each write uses a fresh random 12-byte IV, prepended to the
ciphertext, and the pair is base64'd for the column. `decrypt` answers with the
input unchanged when it cannot open it; `secrets.ts` treats "unchanged" as an
unreadable value rather than a plaintext, so a wrong key never yields ciphertext
to a caller as if it were the secret.

**Operator config — the wizard's keys.** `public.operator_config(name, value,
updated_at, updated_by)` holds the eighteen names the guided setup collects:
`GROQ_API_KEY`, the five `R2_*` fields, and the id/secret pair for
`YT`/`GD`/`IG`/`FB`/`TIKTOK`/`LINKEDIN`. The table has RLS enabled and **no
policy** for anon or authenticated, so only the service role inside a function
can read it; a signed-in web-dashboard user cannot even list the key names.
`operator-config` writes it and `config-status` reads it back:

- `operator-config` accepts only the allowlisted names, trimmed, ≤4096 chars,
  with no control characters, one value per name. The caller must be the service
  role or a session whose `public.users.is_admin` is true — a scheduler identity
  is refused 403, because pointing a server at someone else's keys is not a job
  it should do. If sealing fails the write is aborted whole: nothing reaches the
  table in the clear.
- `config-status` selects `name` only and answers with every allowed name mapped
  to a boolean. It never returns a value; the wizard only needs to know which
  steps are satisfied.

**Platform tokens — the connect's grant.** A browser connect (`posts-api`
`connect-url`, then the platform auth function's callback) stores the platform
access/refresh token in `connected_accounts`, encrypted with the same helper
(`access_token`, `refresh_token`, and TikTok's inside `metadata.refresh_token`).
The answer that travels back to the desktop is only
`flowpost://connect-callback?platform=…&nonce=…&result=…` — a nonce and a word,
never a token. From then on:

- `account-list` reads `ACCOUNT_COLUMNS`, which deliberately excludes every
  token column, so the list the desktop shows carries platform, label, status
  and expiry only.
- `disconnect` reads `DISCONNECT_COLUMNS` (the ciphertext) through the service
  role, makes a best-effort revoke at the provider (Google and TikTok have a
  revoke endpoint; Facebook and LinkedIn do not, so theirs is the row delete
  alone), then deletes the row. No token is ever copied into a response.

**Reading a secret at run time.** `functions/_shared/secrets.ts` is the one
place a function asks "what does this deployment use for GROQ_API_KEY". The
stored (decrypted) value wins, an edge-function environment variable is the
fallback, and a name with neither raises a `SecretProblem` whose message names
what to do. Secrets are never logged and never returned to a caller.

The only secrets on the PC stay exactly the ones ADR 0001 and ADR 0004 put
there: the Supabase session and the license token in Windows Credential Manager,
and a publishable anon key in `credentials.json`.

## Consequences

- One installer works for any operator: a fresh deployment needs no CLI and no
  dashboard visit to enter its keys, yet a deployment that already keeps secrets
  in the environment is unaffected because env is still the fallback.
- `TOKEN_ENCRYPTION_KEY` becomes the root of everything sealed. Lose it, or
  rotate it, and every stored value and every platform token becomes unreadable
  — the accounts are, in effect, expired until reconnected and the keys
  re-entered. The runbook carries the rotation warning this demands.
- The service-role key is the whole trust boundary for this table. It never
  leaves the server environment and never reaches the client; a client cannot
  read or write `operator_config` directly, only through the two functions.
- The web dashboard user and the desktop user both see the same server-side
  truth; neither can extract a platform grant, so a stolen laptop holds no
  bearer secret for any connected account.

## Alternatives considered

| Alternative | Why not |
|---|---|
| A separate Vault for the config store | The original plan; Supabase hosting has no Vault, and a personal-use app on the free plan cannot require one. Encrypted `operator_config` gives the same "server holds it" guarantee with no added infra. |
| Edge-function Secrets only | Requires the dashboard or CLI for every deployment, which is exactly what the guided setup removes. Kept as the read-time fallback, not the primary store. |
| Hand the tokens to the desktop after a connect | Puts a bearer secret for each platform on the PC and in the app's memory, against ADR 0001, and lets an offline machine publish. The server already has what it needs. |
| Store the config plaintext at rest | A Postgres backup, a leaked read, or any service-role use would expose every key; AES-GCM with a per-value IV seals each row on its own. |
