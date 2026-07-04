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
