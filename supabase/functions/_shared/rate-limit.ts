export const MAX_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MINUTES = 15;

export async function checkRateLimit(
  supabase: any,
  namespace: string,
  ip: string,
): Promise<{ allowed: boolean; remainingAttempts?: number; lockoutUntil?: string }> {
  const now = new Date().toISOString();
  const key = `${namespace}:${ip}`;

  const { data: rateLimit, error } = await supabase
    .from("rate_limits")
    .select("*")
    .eq("key", key)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Rate limit check error:", error);
    return { allowed: true };
  }

  if (!rateLimit) {
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
  }

  if (new Date(rateLimit.reset_at) > new Date()) {
    return {
      allowed: false,
      lockoutUntil: rateLimit.reset_at,
      remainingAttempts: 0,
    };
  }

  // Lockout window has expired — reset the counter so the user isn't locked
  // out forever (previously attempts stayed at MAX_ATTEMPTS with no expiry).
  if (rateLimit.attempts >= MAX_ATTEMPTS) {
    await supabase
      .from("rate_limits")
      .update({ attempts: 0 })
      .eq("key", key);
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
  }

  const remaining = MAX_ATTEMPTS - rateLimit.attempts;
  return { allowed: remaining > 0, remainingAttempts: remaining };
}

export async function recordFailedAttempt(
  supabase: any,
  namespace: string,
  ip: string,
) {
  const now = new Date();
  const key = `${namespace}:${ip}`;

  const { data: existing } = await supabase
    .from("rate_limits")
    .select("*")
    .eq("key", key)
    .single();

  if (existing) {
    const newAttempts = existing.attempts + 1;
    if (newAttempts >= MAX_ATTEMPTS) {
      const lockoutUntil = new Date(
        now.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000,
      );
      await supabase
        .from("rate_limits")
        .update({
          attempts: newAttempts,
          reset_at: lockoutUntil.toISOString(),
        })
        .eq("key", key);
    } else {
      await supabase
        .from("rate_limits")
        .update({ attempts: newAttempts })
        .eq("key", key);
    }
  } else {
    await supabase
      .from("rate_limits")
      .insert({
        key,
        attempts: 1,
        reset_at: now.toISOString(),
      });
  }
}

export async function resetRateLimit(
  supabase: any,
  namespace: string,
  ip: string,
) {
  const key = `${namespace}:${ip}`;
  await supabase
    .from("rate_limits")
    .delete()
    .eq("key", key);
}

/**
 * Counts one request against a fixed window per subject.
 *
 * The read and the write are separate, so a burst can go slightly over the
 * limit; the point is a ceiling per user, not exact accounting.
 */
export async function consumeQuota(
  supabase: any,
  namespace: string,
  subject: string,
  limit: number,
  windowMinutes: number,
): Promise<{ allowed: boolean; resetAt?: string }> {
  const key = `${namespace}:${subject}`;
  const now = new Date();
  const { data, error } = await supabase
    .from("rate_limits")
    .select("attempts, reset_at")
    .eq("key", key)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("Quota check error:", error);
    return { allowed: true };
  }

  if (!data || new Date(data.reset_at) <= now) {
    const resetAt = new Date(now.getTime() + windowMinutes * 60 * 1000).toISOString();
    if (data) {
      await supabase
        .from("rate_limits")
        .update({ attempts: 1, reset_at: resetAt })
        .eq("key", key);
    } else {
      await supabase
        .from("rate_limits")
        .insert({ key, attempts: 1, reset_at: resetAt });
    }
    return { allowed: true, resetAt };
  }

  if (data.attempts >= limit) {
    return { allowed: false, resetAt: data.reset_at };
  }

  await supabase
    .from("rate_limits")
    .update({ attempts: data.attempts + 1 })
    .eq("key", key);
  return { allowed: true, resetAt: data.reset_at };
}
