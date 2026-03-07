ALTER TABLE public.connected_accounts
ADD COLUMN IF NOT EXISTS account_id TEXT,
ADD COLUMN IF NOT EXISTS access_token TEXT,
ADD COLUMN IF NOT EXISTS refresh_token TEXT,
ADD COLUMN IF NOT EXISTS token_expiry TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Allow multiple accounts per platform by keying on account_id
ALTER TABLE public.connected_accounts
DROP CONSTRAINT IF EXISTS connected_accounts_user_id_platform_key;

ALTER TABLE public.connected_accounts
ADD CONSTRAINT connected_accounts_user_platform_account_id_key UNIQUE (user_id, platform, account_id);

