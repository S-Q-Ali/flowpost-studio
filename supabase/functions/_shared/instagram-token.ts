/** A token as Meta's Instagram endpoints return it: the value and, when Meta
 *  states one, its lifetime in seconds. */
export interface InstagramIssuedToken {
  access_token: string;
  expires_in?: number | null;
}

export interface InstagramTokenRecord {
  access_token: string;
  token_expiry: string | null;
  token_source: "long_lived_exchange" | "authorization_code";
}

/**
 * The token to store for an Instagram-login account and the deadline it
 * really has.
 *
 * The `ig_exchange_token` renewal belongs to the older Instagram product: a
 * token from the current Instagram Login code exchange gets
 * "Unsupported request" (code 100, IGApiException) from it, so a refused
 * renewal is normal and the exchanged token is the one the Graph calls
 * accept. Whichever token wins, its stated lifetime becomes
 * `connected_accounts.token_expiry` — the desktop reads that column as
 * connection health, and an account whose token is due to die has to read
 * as Expired rather than as connected forever.
 */
export function instagramTokenRecord(
  issued: InstagramIssuedToken,
  renewed: InstagramIssuedToken | null,
  nowMs: number,
): InstagramTokenRecord {
  const chosen = renewed ?? issued;
  const expiresIn = chosen.expires_in;

  return {
    access_token: chosen.access_token,
    token_expiry:
      typeof expiresIn === "number" && Number.isFinite(expiresIn)
        ? new Date(nowMs + expiresIn * 1000).toISOString()
        : null,
    token_source: renewed ? "long_lived_exchange" : "authorization_code",
  };
}
