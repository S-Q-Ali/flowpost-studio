/// Trust checks for URLs that come from a request or a token.

/// Resolves the post-login redirect.
///
/// Only an absolute URL on an allowed origin or a single-slash path under
/// [appOrigin] is accepted; `//host` and `/\host` are protocol-relative and
/// would carry the token to someone else. Returns null when refused.
export function resolveAllowedRedirect(
  rawRedirect: string,
  appOrigin: string,
  allowedOrigins: string[],
): URL | null {
  if (/^https?:\/\//i.test(rawRedirect)) {
    let parsed: URL;
    try {
      parsed = new URL(rawRedirect);
    } catch {
      return null;
    }
    return allowedOrigins.includes(parsed.origin) ? parsed : null;
  }
  if (!/^\/(?![/\\])/.test(rawRedirect)) return null;
  try {
    return new URL(rawRedirect, appOrigin);
  } catch {
    return null;
  }
}

const DRIVE_HOSTS = new Set([
  "www.googleapis.com",
  "drive.google.com",
  "lh3.googleusercontent.com",
]);

/// Whether a Drive download URL may be fetched with the user's Google token.
///
/// The URL can arrive in a request body, so a token carrying it is still
/// untrusted: the bearer never goes to a host outside Google's.
export function isAllowedDriveUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && DRIVE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
