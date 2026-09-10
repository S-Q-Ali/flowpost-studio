import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { encrypt } from "../_shared/crypto.ts";
import { createRequestAuthorizer, createSessionLookup } from "../_shared/auth.ts";
import { createOAuthState, consumeOAuthState } from "../_shared/oauth-state.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_ID = Deno.env.get("IG_APP_ID");
const APP_SECRET = Deno.env.get("IG_APP_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

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
  frontendApiKey: Deno.env.get("FRONTEND_API_KEY"),
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
  const url = new URL("https://graph.instagram.com/v21.0/access_token");
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
  const sessionUserId = auth && auth.kind === "session" ? auth.userId : null;

  try {
    if (!action) return json({ error: "Missing action" }, 400);

    const redirectUri = `${SUPABASE_URL}/functions/v1/instagram-auth`;

    if (action === "url") {
      const reqUserId = url.searchParams.get("userId") || bodyUserId || (auth && auth.kind === "session" ? auth.userId ?? null : null);
      if (!reqUserId) return json({ error: "Missing userId" }, 400);

      const state = await createOAuthState(supabaseAdmin, { userId: reqUserId });
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
        return html(
          `<!DOCTYPE html><html><head><title>Error</title></head><body style="font-family:sans-serif;text-align:center;padding:50px;background:#0f0f0f;color:white;"><h2>Connection failed</h2><p>Instagram authorization was denied or failed. You can close this tab and try again in FlowPost.</p></body></html>`,
        );
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

      return new Response(null, {
        status: 302,
        headers: { Location: "https://flowpost-studio.vercel.app/accounts?connected=instagram" },
      });
    }

    if (action === "refresh") {
      const body = await req.json();
      const accountId = body?.accountId;
      if (!accountId) return json({ error: "Missing accountId" }, 400);

      let accountQuery = supabaseAdmin
        .from("connected_accounts")
        .select("*")
        .eq("account_id", accountId)
        .eq("platform", "instagram");
      if (sessionUserId) accountQuery = accountQuery.eq("user_id", sessionUserId);
      const { data: account, error: accountError } = await accountQuery.single();

      if (accountError || !account?.access_token) {
        return json({ error: "Instagram account not found" }, 404);
      }

      const { decrypt } = await import("../_shared/crypto.ts");
      const currentToken = await decrypt(account.access_token);
      if (!currentToken) return json({ error: "Could not decrypt token" }, 500);

      const refreshed = await getLongLivedToken(currentToken);

      const { error: updateError } = await supabaseAdmin
        .from("connected_accounts")
        .update({
          access_token: await encrypt(refreshed.access_token),
          connected_at: new Date().toISOString(),
        })
        .eq("id", account.id);

      if (updateError) throw updateError;

      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("instagram-auth error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
