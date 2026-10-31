/** Attempts allowed per key inside one window. */
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MINUTES = 15;

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: string }
  | { allowed: false; resetAt: string | null };

/**
 * Counts one attempt and says whether it may go on.
 *
 * The count happens in one SQL statement (`consume_rate_limit`), so two
 * requests at the same moment cannot both read the same number. An error
 * refuses the attempt: a limit that opens when its store is down is not a
 * limit.
 */
export async function consumeRateLimit(
  supabase: any,
  key: string,
  options: { max?: number; windowMinutes?: number } = {},
): Promise<RateLimitResult> {
  const max = options.max ?? MAX_ATTEMPTS;
  const windowMinutes = options.windowMinutes ?? LOCKOUT_DURATION_MINUTES;

  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_minutes: windowMinutes,
  });

  if (error) {
    console.error("Rate limit check failed:", error);
    return { allowed: false, resetAt: null };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { allowed: false, resetAt: null };

  const resetAt = row.reset_at as string;
  return row.allowed
    ? { allowed: true, remaining: Math.max(0, max - row.attempts), resetAt }
    : { allowed: false, resetAt };
}

/** A per-subject ceiling over a fixed window, e.g. captions per user per hour. */
export function consumeQuota(
  supabase: any,
  namespace: string,
  subject: string,
  limit: number,
  windowMinutes: number,
): Promise<RateLimitResult> {
  return consumeRateLimit(supabase, `${namespace}:${subject}`, {
    max: limit,
    windowMinutes,
  });
}
