-- Desktop access licenses. Only the HMAC-SHA-256 hash of a key, made under the
-- server's LICENSE_PEPPER secret, is stored; the plaintext key is handed to the
-- holder and never written here. The hash is deterministic, so a lookup by
-- key_hash finds exactly one row and the pepper never has to be stored.
CREATE TABLE public.licenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

-- RLS: no policies for anon/authenticated; only the service role in the
-- verify-license edge function reads this table.
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.licenses IS 'Desktop access licenses (peppered HMAC-SHA-256 hashes); managed by the verify-license edge function.';
