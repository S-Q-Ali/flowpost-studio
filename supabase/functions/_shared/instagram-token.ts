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
 * The token from the code exchange lives about an hour, so the
 * `ig_exchange_token` renewal is what makes a connection last — measured on a
 * provisioned app it returns 60 days. When the renewal refuses, the exchanged
 * token is still the one Graph accepts, so a null there is a short-lived
 * connection, not a dead one. Either way, the chosen token's stated lifetime
 * becomes `connected_accounts.token_expiry` — the desktop reads that column as
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

/** Which API issued a token, and how long it is. Never carries the token. */
export interface InstagramTokenShape {
  shape: "instagram_login" | "facebook" | "unknown";
  length: number;
}

/**
 * A diagnosis line, nothing more: the family the prefix suggests and the
 * length. This app's current tokens carry no known prefix, so "unknown" is the
 * normal answer and no conclusion about the connect should rest on it.
 */
export function instagramTokenShape(accessToken: string): InstagramTokenShape {
  const shape = accessToken.startsWith("IGQ")
    ? "instagram_login"
    : accessToken.startsWith("EAA")
      ? "facebook"
      : "unknown";

  return { shape, length: accessToken.length };
}
