export interface OAuthStateValue {
  state: string;
  expiresAt: string;
}

const CONNECT_CALLBACK_HOST = "connect-callback";

/// The shipped web app. Each auth function keeps its own copy of this as the
/// `ALLOWED_ORIGIN` fallback; a deployment that sets the env must pass it in.
export const DEFAULT_APP_ORIGIN = "https://flowpost-studio.vercel.app";

export const CONNECT_PLATFORMS = new Set([
  "youtube",
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "google_drive",
  "mega",
]);

/// The link the desktop waits for, naming the platform and its nonce.
export function desktopReturnTo(platform: string, nonce: string): string {
  return `flowpost://${CONNECT_CALLBACK_HOST}?platform=${platform}&nonce=${nonce}`;
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newOAuthStateValue(): OAuthStateValue {
  const state = randomHex(24);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  return { state, expiresAt };
}

/// The only places a connect may come back to, or null.
///
/// A `flowpost://connect-callback?platform=<known>&nonce=<32 bytes hex>` link
/// is accepted whole (minus any result the caller tried to pre-fill); an
/// http(s) URL must be on [appOrigin] exactly. Anything else is refused, so a
/// hand-written `return_to` can never steer the 302 to another host.
export function normalizeReturnTo(
  raw: string,
  appOrigin: string,
  mode?: string | null,
): string | null {
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol === "flowpost:") {
    if (parsed.host !== CONNECT_CALLBACK_HOST) return null;
    if (parsed.pathname !== "" && parsed.pathname !== "/") return null;
    const query = parsed.searchParams;
    if (!CONNECT_PLATFORMS.has(query.get("platform") ?? "")) return null;
    const nonce = query.get("nonce") ?? "";
    if (!/^[0-9a-f]{64}$/.test(nonce)) return null;
    // The state row is keyed by mode, so a youtube row must not answer for a
    // tiktok wait: the platform has to be the one that starts with this nonce.
    if (mode && query.get("platform") !== mode) return null;
    if (query.has("result")) return null;
    return raw;
  }
  if (parsed.protocol === "http:" || parsed.protocol === "https:") {
    if (parsed.username || parsed.password) return null;
    let origin: string;
    try {
      origin = new URL(appOrigin).origin;
    } catch {
      return null;
    }
    return parsed.origin === origin ? raw : null;
  }
  return null;
}

/// Where a finished connect sends the browser.
///
/// A desktop wait gets its own link back plus the result; a web flow returns
/// to [appOrigin]. The stored value is re-checked here, because a row written
/// before this rule must not become an open redirect.
export function callbackLocation(
  returnTo: string | null,
  appOrigin: string,
  platform: string,
): string {
  const fallback = `${appOrigin}/accounts?connected=${encodeURIComponent(platform)}`;
  if (!returnTo) return fallback;
  const trusted = normalizeReturnTo(returnTo, appOrigin, platform);
  if (trusted === null) return fallback;
  if (trusted.startsWith("flowpost://")) {
    const sep = trusted.endsWith("?") || trusted.endsWith("&") ? "" : "&";
    return `${trusted}${sep}result=connected`;
  }
  const sep = trusted.includes("?") ? "&" : "?";
  return `${trusted}${sep}connected=${encodeURIComponent(platform)}`;
}

/// Forget waits a day past their minute.
///
/// The row is dead the moment it expires — consume only claims live ones — so
/// a day of grace is pure safety margin. This deletes the abandoned waits the
/// browser never came back for and the used ones the callback left behind;
/// without it the table only ever grows. Best-effort by design: a purge that
/// fails must not refuse a connect that is about to start.
async function purgeExpiredStates(supabase: any): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    await supabase.from("oauth_states").delete().lt("expires_at", cutoff);
  } catch {
    // The next connect sweeps again.
  }
}

export async function createOAuthState(
  supabase: any,
  args: { userId: string; mode?: string; returnTo?: string | null; appOrigin?: string },
): Promise<string> {
  const { state, expiresAt } = newOAuthStateValue();
  const trusted = args.returnTo
    ? normalizeReturnTo(args.returnTo, args.appOrigin ?? DEFAULT_APP_ORIGIN, args.mode)
    : null;
  await purgeExpiredStates(supabase);
  const { error } = await supabase.from("oauth_states").insert({
    user_id: args.userId,
    state,
    mode: args.mode ?? null,
    return_to: trusted,
    expires_at: expiresAt,
    used_at: null,
  });
  if (error) throw error;
  return state;
}

export async function consumeOAuthState(
  supabase: any,
  state: string,
): Promise<{ userId: string; mode?: string | null; returnTo: string | null } | null> {
  if (!state) return null;
  const { data, error } = await supabase
    .from("oauth_states")
    .update({ used_at: new Date().toISOString() })
    .eq("state", state)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id, mode, return_to")
    .maybeSingle();
  if (error || !data) return null;
  return { userId: data.user_id, mode: data.mode, returnTo: data.return_to ?? null };
}
