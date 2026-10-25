-- Secure token storage for OAuth tokens
-- Tokens stored server-side only, not in browser
-- Encrypted at rest with AES-GCM

CREATE TABLE IF NOT EXISTS public.oauth_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'youtube', 'tiktok', 'linkedin', 'google_drive', 'mega')),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry TIMESTAMPTZ NOT NULL,
  device_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_oauth_tokens_user_platform ON public.oauth_tokens(user_id, platform);
CREATE INDEX idx_oauth_tokens_device ON public.oauth_tokens(device_id);
CREATE INDEX idx_oauth_tokens_expiry ON public.oauth_tokens(expires_at);

-- RLS: Only service role can access (via edge functions)
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Only allow edge functions to read/write (no direct user access)
-- This table is accessed via verify-session / oauth-token-exchange functions
-- No public policies needed - all access goes through edge functions

COMMENT ON TABLE public.oauth_tokens IS 'Server-side encrypted OAuth tokens - never exposed to browser';
COMMENT ON COLUMN public.oauth_tokens.access_token IS 'AES-GCM encrypted access token';
COMMENT ON COLUMN public.oauth_tokens.refresh_token IS 'AES-GCM encrypted refresh token (if available)';
COMMENT ON COLUMN public.oauth_tokens.device_id IS 'Optional device identifier for token management';

-- Create token rotation trigger
CREATE OR REPLACE FUNCTION public.handle_oauth_token_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  -- Update expiry if not set
  IF NEW.expires_at IS NULL AND NEW.token_expiry IS NOT NULL THEN
    NEW.expires_at = NEW.token_expiry;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER oauth_tokens_update_trigger
  BEFORE UPDATE ON public.oauth_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_oauth_token_update();

-- Create auto-cleanup function for expired tokens
CREATE OR REPLACE FUNCTION public.cleanup_expired_oauth_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.oauth_tokens
  WHERE expires_at < now();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SET search_path = public;

COMMENT ON FUNCTION public.cleanup_expired_oauth_tokens() IS 'Cleanup function to remove expired OAuth tokens - run periodically via cron or manual';
