/**
 * Whether a stored token is past the deadline its row states.
 *
 * A blank deadline states nothing, so it is not expired: a Facebook Page token
 * is issued without one. A caller that renews on refresh — Google and TikTok —
 * has its own reason to treat a missing deadline as a reason to refresh.
 */
export function hasExpired(tokenExpiry: string | null, now: Date = new Date()): boolean {
  if (!tokenExpiry) return false;
  const deadline = new Date(tokenExpiry);
  return !Number.isNaN(deadline.getTime()) && deadline <= now;
}
