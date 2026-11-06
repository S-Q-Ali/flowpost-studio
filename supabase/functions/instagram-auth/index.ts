import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { encrypt } from "../_shared/crypto.ts";
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
  return jsonRes as { access_token: string; user_id: string; permissions?: string[] };
}

async function getLongLivedToken(shortLivedToken: string) {
  // Meta documents this exchange as GET on the UNVERSIONED path:
  //   GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token
  //       &client_secret=<APP_SECRET>&access_token=<SHORT_LIVED>
  // A `/vNN.0/` prefix before `access_token` is not a node at all, and with a
  // real Instagram-login token both verbs come back as
  // "Unsupported request - method type: ..." (code 100, IGApiException).
  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", APP_SECRET!);
  url.searchParams.set("access_token", shortLivedToken);

  const res = await fetch(url.toString(), { method: "GET" });

  const jsonRes = await res.json();
  if (!res.ok || jsonRes.error) throw new Error(`IG long-lived exchange failed: ${JSON.stringify(jsonRes)}`);
  return jsonRes as { access_token: string; expires_in?: number };
}

async function fetchIgProfile(longLivedToken: string) {
  const url = new URL("https://graph.instagram.com/v21.0/me");
  url.searchParams.set("fields", "user_id,username,name,account_type,profile_picture_url,followers_count");
  url.searchParams.set("access_token", longLivedToken);

  const res = await fetch(url.toString(), { method: "GET" });
  const jsonRes = await res.json();
  if (!res.ok) throw new Error(`IG profile fetch failed: ${JSON.stringify(jsonRes)}`);
  return jsonRes as {
    user_id?: string;
    username?: string;
    name?: string;
    account_type?: string;
    profile_picture_url?: string;
    followers_count?: number;
  };
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
      const authUrl = new URL("https://api.instagram.com/oauth/authorize");
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
      authUrl.searchParams.set("enable_fb_login", "false");

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

      const shortLived = await exchangeCodeForShortLivedToken(code, redirectUri);
      const longLived = await getLongLivedToken(shortLived.access_token);
      const profile = await fetchIgProfile(longLived.access_token);

      const igUserId = profile.user_id || shortLived.user_id;
      if (!igUserId) {
        return html(
          `<!DOCTYPE html><html><head><title>Error</title></head><body style="font-family:sans-serif;text-align:center;padding:50px;background:#0f0f0f;color:white;"><h2>Could not retrieve Instagram profile</h2><p>Please try again.</p></body></html>`,
        );
      }

      const { error: upsertError } = await supabaseAdmin
        .from("connected_accounts")
        .upsert(
          {
            user_id: userId,
            platform: "instagram",
            account_name: profile.username || profile.name || "Instagram",
            account_id: igUserId,
            access_token: await encrypt(longLived.access_token),
            is_connected: true,
            connected_at: new Date().toISOString(),
            metadata: {
              instagram_login: true,
              account_type: profile.account_type || "business",
              profile_picture: profile.profile_picture_url || null,
              followers_count: profile.followers_count || null,
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
