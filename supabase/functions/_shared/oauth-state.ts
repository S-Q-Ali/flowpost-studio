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

/// How a desktop connect ended, as the app is told and as the row stores it.
export type ConnectResult = "connected" | "denied" | "failed";

export const CONNECT_RESULTS: readonly ConnectResult[] = ["connected", "denied", "failed"];

/// Where a finished desktop connect leaves the browser tab.
///
/// It has to be the shipped web app: Supabase rewrites a text/html body from an
/// edge function to text/plain behind a sandbox CSP, so a page served here would
/// show the visitor its own source and never hand the link to the OS.
const CONNECT_DONE_PATH = "/connect-done";

/// The app's done page for one outcome, built only from validated parts.
export function connectDoneUrl(
  appOrigin: string,
  platform: string,
  nonce: string,
  result: ConnectResult,
): string {
  return (
    `${appOrigin}${CONNECT_DONE_PATH}?platform=${encodeURIComponent(platform)}` +
    `&nonce=${nonce}&result=${result}`
  );
}

/// Where a finished connect sends the browser.
///
/// A web flow returns to [appOrigin] with the connected flag. A desktop wait
/// cannot be handed a `flowpost://` 302 — the browser starts a navigation to a
/// custom protocol, the OS opens the app, and the tab never completes, so it
/// spins. It goes to the app's own done page, which can render and fire the link
/// from there. The stored value is re-checked here, because a row written before
/// this rule must not become an open redirect.
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
    const nonce = new URL(trusted).searchParams.get("nonce") ?? "";
    return connectDoneUrl(appOrigin, platform, nonce, "connected");
  }
  const sep = trusted.includes("?") ? "&" : "?";
  return `${trusted}${sep}connected=${encodeURIComponent(platform)}`;
}

/// How the provider reports that the visitor refused the consent.
///
/// Anything outside this list is the provider's own breakage, which the app
/// should hear about as a failure rather than a cancellation.
const REFUSED_CONSENT = new Set([
  "access_denied",
  "user_denied",
  "consent_required",
  "interaction_required",
  "login_required",
]);

/// Write down how a connect ended, for the app that started it.
///
/// The browser link is the fast path, but a tab the user closed, a browser that
/// blocks the jump, or an OS that never delivers it all leave the app waiting on
/// nothing. It asks this row instead. Best effort: a status that did not save
/// must not break a connect the browser already finished.
export async function reportConnectResult(
  supabase: any,
  state: string,
  result: ConnectResult,
): Promise<void> {
  if (!state) return;
  try {
    await supabase.from("oauth_states").update({ result }).eq("state", state);
  } catch {
    // The browser link still carries the answer.
  }
}

/// The answer to a callback that came back without a code.
///
/// A visitor who clicks Cancel on the consent screen gets `?error=access_denied`
/// on this same callback URL. Before, that was an inline HTML page: the desktop
/// never heard, so its connect sat until the timeout. Now the outcome goes on
/// the state row and the tab is sent somewhere that can actually render — the
/// app's done page for a desktop wait, its accounts page for a web flow. The
/// provider's error text is never used, because it is caller-supplied.
export async function connectDeclineResponse(input: {
  supabase: any;
  state: string;
  error: string;
  returnTo: string | null;
  appOrigin: string;
  platform: string;
}): Promise<Response> {
  const { supabase, state, error, returnTo, appOrigin, platform } = input;
  const outcome: ConnectResult = REFUSED_CONSENT.has(error) ? "denied" : "failed";
  await reportConnectResult(supabase, state, outcome);
  const trusted = returnTo ? normalizeReturnTo(returnTo, appOrigin, platform) : null;
  if (trusted && trusted.startsWith("flowpost://")) {
    const nonce = new URL(trusted).searchParams.get("nonce") ?? "";
    return redirect(connectDoneUrl(appOrigin, platform, nonce, outcome));
  }
  return redirect(`${appOrigin}/accounts?declined=${encodeURIComponent(platform)}`);
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
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
