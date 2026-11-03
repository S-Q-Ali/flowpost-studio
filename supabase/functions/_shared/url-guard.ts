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

/// Whether a URL may be fetched with the user's Google token.
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

/// Whether a URL points at the Google APIs host.
///
/// Substring checks (`url.includes("googleapis.com")`) also match a path or
/// query on another host, which would still receive the bearer token.
export function isGoogleApiUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      (url.hostname === "googleapis.com" || url.hostname.endsWith(".googleapis.com"))
    );
  } catch {
    return false;
  }
}

/// Hosts the media of this app's own users can be stored on.
const MEDIA_HOSTS = ["www.googleapis.com", "drive.google.com", "storage.googleapis.com", "mega.nz"];

function hostnameOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    // `R2_PUBLIC_URL` is configured as a bare host, `SUPABASE_URL` with its scheme.
    return new URL(value.includes("://") ? value : `https://${value}`).hostname;
  } catch {
    return null;
  }
}

/// Whether a publisher may download this URL as the user's media.
///
/// Every publisher takes a media URL from the database or a request body, and a
/// Drive fetch carries the owner's Google bearer, so the host list is the guard
/// against the server being pointed at anything else — including the cloud
/// metadata address. The app's own hosts come from the environment: the R2
/// bucket and the `get-file` proxy this server mints tokens for.
export function isAllowedMediaUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const hosts = [...MEDIA_HOSTS];
  for (const host of [
    hostnameOf(Deno.env.get("R2_PUBLIC_URL")),
    hostnameOf(Deno.env.get("SUPABASE_URL")),
  ]) {
    if (host) hosts.push(host);
  }
  return hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}
