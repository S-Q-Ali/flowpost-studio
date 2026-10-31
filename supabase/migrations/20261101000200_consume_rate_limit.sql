-- One atomic counter per key, so two requests at the same moment cannot both
-- read the same number and pass. Fixed window: the first attempt starts the
-- window, later attempts inside it add one.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key TEXT,
  p_max INTEGER,
  p_window_minutes INTEGER
)
RETURNS TABLE (allowed BOOLEAN, attempts INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_row public.rate_limits%ROWTYPE;
BEGIN
  INSERT INTO public.rate_limits AS r (key, attempts, reset_at)
  VALUES (p_key, 1, v_now + make_interval(mins => p_window_minutes))
  ON CONFLICT (key) DO UPDATE
    SET attempts = CASE
          WHEN r.reset_at <= v_now THEN 1
          ELSE r.attempts + 1
        END,
        reset_at = CASE
          WHEN r.reset_at <= v_now THEN v_now + make_interval(mins => p_window_minutes)
          ELSE r.reset_at
        END
  RETURNING * INTO v_row;

  RETURN QUERY SELECT v_row.attempts <= p_max, v_row.attempts, v_row.reset_at;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;
