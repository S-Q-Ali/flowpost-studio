import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { encrypt } from "../_shared/crypto.ts";
import { instagramTokenRecord, instagramTokenShape } from "../_shared/instagram-token.ts";
import { createRequestAuthorizer, createSessionLookup, resolveSessionOwner } from "../_shared/auth.ts";
import { createOAuthState, consumeOAuthState, callbackLocation, connectDeclineResponse, reportConnectResult, DEFAULT_APP_ORIGIN } from "../_shared/oauth-state.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_ID = Deno.env.get("IG_APP_ID");
const APP_SECRET = Deno.env.get("IG_APP_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const APP_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || DEFAULT_APP_ORIGIN;

if (!APP_ID || !APP_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  console.error("Missing required secrets for instagram-auth function");
}

const supabaseAdmin = createClient(
  SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const authorize = createRequestAuthorizer({
  serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  cronApiKey: null,
  anonKey: SUPABASE_ANON_KEY,
  sessionLookup: createSessionLookup(supabaseAdmin),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}

async function exchangeCodeForShortLivedToken(code: string, redirectUri: string) {
  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: APP_ID!,
      client_secret: APP_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  const jsonRes = await res.json();
  if (!res.ok || jsonRes.error) throw new Error(`IG token exchange failed: ${JSON.stringify(jsonRes)}`);
  return jsonRes as { access_token: string; user_id: string; expires_in?: number; permissions?: string[] };
}

/**
 * The longer lifetime Meta will hand out for this token, or null when it
 * refuses. The exchanged token alone lives about an hour, so a refusal means
 * the connection needs renewing before it can publish.
 */
async function renewLongLivedToken(accessToken: string) {
  const url = new URL("https://graph.instagram.com/v27.0/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", APP_SECRET!);
  url.searchParams.set("access_token", accessToken);

  try {
    const res = await fetch(url.toString(), { method: "GET" });
    const jsonRes = await res.json();
    if (!res.ok || jsonRes.error) {
      console.warn("IG long-lived renewal declined", JSON.stringify(jsonRes));
      return null;
    }
    return jsonRes as { access_token: string; expires_in?: number };
  } catch (err) {
    console.warn("IG long-lived renewal failed", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * The account behind this token, or null when Graph refuses it — in which case
 * there is nothing here to store that could publish.
 */
async function fetchIgProfile(accessToken: string) {
  const url = new URL("https://graph.instagram.com/v27.0/me");
  url.searchParams.set("fields", "user_id,username");
  url.searchParams.set("access_token", accessToken);

  try {
    const res = await fetch(url.toString(), { method: "GET" });
    const jsonRes = await res.json();
    if (!res.ok || jsonRes.error) {
      console.warn("IG profile read declined", JSON.stringify(jsonRes));
      return null;
    }
    return jsonRes as { user_id?: string; username?: string };
  } catch (err) {
    console.warn("IG profile read failed", err instanceof Error ? err.message : err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const actionFromQuery = url.searchParams.get("action");

  let action: string | null = actionFromQuery;
  let bodyUserId: string | null = null;

  // Instagram strips query params from redirect URIs on callback
  // Detect callback by the presence of "code" instead
  if (!actionFromQuery && url.searchParams.has("code")) {
    action = "callback";
  }

  if (!action) {
    try {
      const body = await req.json() as Record<string, unknown>;
      action = typeof body?.action === "string" ? body.action : null;
      bodyUserId = typeof body?.userId === "string" ? body.userId : null;
    } catch {
      // ignore
    }
  }

  let auth: Awaited<ReturnType<typeof authorize>> | null = null;
  if (action !== "callback") {
    auth = await authorize(req);
    if (!auth.allowed) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  try {
    if (!action) return json({ error: "Missing action" }, 400);

    const redirectUri = `${SUPABASE_URL}/functions/v1/instagram-auth`;

    if (action === "url") {
      const owner = resolveSessionOwner(auth, url.searchParams.get("userId") || bodyUserId);
      if (owner.denied) return json({ error: "Unauthorized" }, 401);
      if (!owner.userId) return json({ error: "Missing userId" }, 400);

      const state = await createOAuthState(supabaseAdmin, {
        userId: owner.userId,
        returnTo: url.searchParams.get("return_to"),
        appOrigin: APP_ORIGIN,
      });
      // Instagram Login: the page is served from www.instagram.com while the
      // code is exchanged on api.instagram.com. enable_fb_login=0 keeps it on
      // Instagram credentials. No force_reauth: it makes an account that is
      // already signed in re-enter its password instead of seeing consent.
      const authUrl = new URL("https://www.instagram.com/oauth/authorize");
      authUrl.searchParams.set("enable_fb_login", "0");
      authUrl.searchParams.set("client_id", APP_ID!);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("scope", [
        "instagram_business_basic",
        "instagram_business_content_publish",
        "instagram_business_manage_insights",
        "instagram_business_manage_comments",
      ].join(","));
      authUrl.searchParams.set("response_type", "code");

      return json({ url: authUrl.toString() });
    }

    if (action === "callback") {
      const errorParam = url.searchParams.get("error");
      if (errorParam) {
        const declinedState = url.searchParams.get("state") || "";
        const refused = await consumeOAuthState(supabaseAdmin, declinedState);
        return await connectDeclineResponse({
          supabase: supabaseAdmin,
          state: declinedState,
          error: errorParam,
          returnTo: refused?.returnTo ?? null,
          appOrigin: APP_ORIGIN,
          platform: "instagram",
        });
      }

      const code = url.searchParams.get("code");
      const rawState = url.searchParams.get("state") || "";
      const oauthState = await consumeOAuthState(supabaseAdmin, rawState);
      if (!code) return html("<html><body>Missing code</body></html>", 400);
      if (!oauthState) return html("<html><body>Invalid or expired state. Please start the connection from FlowPost again.</body></html>", 400);
      const userId = oauthState.userId;

      const issued = await exchangeCodeForShortLivedToken(code, redirectUri);
      const token = instagramTokenRecord(
        issued,
        await renewLongLivedToken(issued.access_token),
        Date.now(),
      );
      const account = await fetchIgProfile(token.access_token);

      // Graph naming no account is the whole verdict: there is nothing to
      // store that could publish. The token's family and the field names Meta
      // returned on the exchange say which half of the setup disagrees.
      if (!account?.user_id) {
        console.warn("IG refused token", JSON.stringify({
          ...instagramTokenShape(token.access_token),
          exchange_fields: Object.keys(issued).sort(),
        }));
        return await connectDeclineResponse({
          supabase: supabaseAdmin,
          state: rawState,
          error: "instagram_graph_unavailable",
          returnTo: oauthState.returnTo,
          appOrigin: APP_ORIGIN,
          platform: "instagram",
        });
      }

      const { error: upsertError } = await supabaseAdmin
        .from("connected_accounts")
        .upsert(
          {
            user_id: userId,
            platform: "instagram",
            account_name: account.username || "Instagram",
            account_id: account.user_id,
            access_token: await encrypt(token.access_token),
            is_connected: true,
            connected_at: new Date().toISOString(),
            token_expiry: token.token_expiry,
            metadata: {
              // This connect only ever answers on the Instagram host; the
              // Facebook-routed accounts are written by facebook-auth.
              graph_host: "instagram",
              token_source: token.token_source,
            },
          },
          { onConflict: "user_id,platform,account_id" },
        );

      if (upsertError) throw upsertError;
      await reportConnectResult(supabaseAdmin, rawState, "connected");

      return new Response(null, {
        status: 302,
        headers: { Location: callbackLocation(oauthState.returnTo, APP_ORIGIN, "instagram") },
      });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("instagram-auth error", err);
    await reportConnectResult(supabaseAdmin, url.searchParams.get("state") || "", "failed");
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
