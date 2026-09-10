-- OAuth state hardening: server-issued, single-use, time-limited state records
-- used to bind an authorization code exchange to the user who started it.
create table if not exists oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  state text not null unique,
  mode text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists oauth_states_state_idx on oauth_states (state);
create index if not exists oauth_states_user_id_idx on oauth_states (user_id);

alter table oauth_states enable row level security;