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
/// A web flow returns to [appOrigin] with the connected flag. A desktop wait
/// cannot be handed a `flowpost://` 302 — the browser starts a navigation to a
/// custom protocol, the OS opens the app, and the tab never completes, so it
/// spins. Instead the desktop wait is sent to the function's own done page
/// ([doneUrl], built from the callback's own URL), which shows the outcome and
/// fires the app link from script. The stored value is re-checked here, because
/// a row written before this rule must not become an open redirect.
export function callbackLocation(
  returnTo: string | null,
  appOrigin: string,
  platform: string,
  doneUrl?: string,
): string {
  const fallback = `${appOrigin}/accounts?connected=${encodeURIComponent(platform)}`;
  if (!returnTo) return fallback;
  const trusted = normalizeReturnTo(returnTo, appOrigin, platform);
  if (trusted === null) return fallback;
  if (trusted.startsWith("flowpost://")) {
    const done = usableDoneUrl(doneUrl);
    if (done === null) return fallback;
    const nonce = new URL(trusted).searchParams.get("nonce") ?? "";
    const sep = done.includes("?") ? "&" : "?";
    return `${done}${sep}platform=${encodeURIComponent(platform)}&nonce=${nonce}&result=connected`;
  }
  const sep = trusted.includes("?") ? "&" : "?";
  return `${trusted}${sep}connected=${encodeURIComponent(platform)}`;
}

/// The function's own done-page URL, or null if it is not a loadable http(s)
/// address. Only a real page can end the browser navigation; anything else
/// would spin the tab the way the custom-scheme 302 did.
function usableDoneUrl(doneUrl: string | undefined): string | null {
  if (!doneUrl) return null;
  try {
    const parsed = new URL(doneUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return doneUrl;
  } catch {
    return null;
  }
}

const CONNECT_RESULTS = new Set(["connected", "denied", "failed"]);

/// The page a finished desktop connect leaves in the browser.
///
/// It answers the callback's 302 to `?action=done` — a normal http navigation
/// the browser completes, so the tab stops spinning and shows the outcome. The
/// app link is handed to the OS from script (and a visible fallback link for a
/// browser that blocks the automatic jump). Every field of the link is rebuilt
/// from validated query values, never echoed raw, so a crafted request cannot
/// put arbitrary text — or another host — into the page.
export function connectDoneResponse(rawUrl: string): Response {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return doneErrorPage();
  }
  if (url.searchParams.get("action") !== "done") return doneErrorPage();
  const platform = url.searchParams.get("platform") ?? "";
  const nonce = url.searchParams.get("nonce") ?? "";
  const result = url.searchParams.get("result") ?? "";
  if (!CONNECT_PLATFORMS.has(platform)) return doneErrorPage();
  if (!/^[0-9a-f]{64}$/.test(nonce)) return doneErrorPage();
  if (!CONNECT_RESULTS.has(result)) return doneErrorPage();

  const link = `flowpost://${CONNECT_CALLBACK_HOST}?platform=${platform}&nonce=${nonce}&result=${result}`;
  return new Response(donePage(link, result), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function donePage(link: string, result: string): string {
  const headline = result === "connected" ? "Connected" : result === "denied" ? "Cancelled" : "Not finished";
  const body = result === "connected"
    ? "You can close this tab and keep working in FlowPost."
    : result === "denied"
    ? "The connection was cancelled in the browser. Nothing was saved."
    : "The connection did not finish. Start it again in FlowPost.";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<title>${headline} \u00b7 FlowPost</title>`
    + `<style>body{font-family:system-ui,sans-serif;text-align:center;padding:48px 24px;`
    + `background:#0f0f0f;color:#fff}a{color:#7cc4ff}</style></head><body>`
    + `<h2>${headline} to FlowPost</h2><p>${body}</p>`
    + `<p><a href="${escapeHtmlAttr(link)}">Open FlowPost</a></p>`
    + `<script>location.href = ${JSON.stringify(link)};</script>`
    + `</body></html>`;
}

function doneErrorPage(): Response {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<title>FlowPost</title>`
    + `<style>body{font-family:system-ui,sans-serif;text-align:center;padding:48px 24px;`
    + `background:#0f0f0f;color:#fff}</style></head><body>`
    + `<h2>This link is not valid</h2>`
    + `<p>Start the connection again in FlowPost.</p></body></html>`;
  return new Response(html, {
    status: 400,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
