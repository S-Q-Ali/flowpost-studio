-- The keys an operator stores from the guided setup, so a deployment needs no
-- CLI and no dashboard visit. `value` holds AES-GCM ciphertext written by the
-- operator-config function with TOKEN_ENCRYPTION_KEY; the plaintext never
-- reaches this table, and no client ever reads it back.
CREATE TABLE IF NOT EXISTS public.operator_config (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  CONSTRAINT operator_config_name_shape CHECK (name ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  CONSTRAINT operator_config_value_shape CHECK (value <> '')
);

-- RLS: no policies for anon or authenticated. Only the service role inside the
-- operator-config, config-status and secrets helper reads this table, so a
-- signed-in user of the web dashboard cannot list the server's key names.
ALTER TABLE public.operator_config ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.operator_config IS
  'Server-side credentials, encrypted at rest; written by the operator-config edge function.';
