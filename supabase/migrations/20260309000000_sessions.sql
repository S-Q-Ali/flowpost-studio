-- Password-gate sessions: tokens stored server-side, never expose password in frontend.
CREATE TABLE public.sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Optional: index for fast lookup by token and expiry
CREATE INDEX idx_sessions_token_expires ON public.sessions (token, expires_at);

-- RLS: no policies for anon/authenticated; only service role (edge functions) can access (bypasses RLS).
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.sessions IS 'App password-gate session tokens; managed by verify-password / verify-session edge functions.';
