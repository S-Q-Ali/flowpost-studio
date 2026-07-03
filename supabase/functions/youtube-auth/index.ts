import { createClient } from "npm:@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const YT_CLIENT_ID = Deno.env.get("YT_CLIENT_ID");
const YT_CLIENT_SECRET = Deno.env.get("YT_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const FALLBACK_USER_ID = "00000000-0000-0000-0000-000000000000";

if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required secrets for youtube-auth function");
}

const supabaseAdmin = createClient(
  SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

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

async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: YT_CLIENT_ID!,
      client_secret: YT_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(`Token exchange failed: ${JSON.stringify(tokenJson)}`);
  }

  return tokenJson as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope?: string;
    token_type?: string;
  };
}

async function refreshAccessToken(refreshToken: string) {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: YT_CLIENT_ID!,
      client_secret: YT_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(`Refresh failed: ${JSON.stringify(tokenJson)}`);
  }

  return tokenJson as {
    access_token: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
  };
}

async function fetchChannelInfo(accessToken: string) {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const jsonRes = await res.json();
  if (!res.ok) throw new Error(`Channel fetch failed: ${JSON.stringify(jsonRes)}`);

  const item = jsonRes?.items?.[0];
  if (!item?.id) throw new Error("No YouTube channel found for this account");
  return {
    channelId: item.id as string,
    channelTitle: (item.snippet?.title ?? "YouTube Channel") as string,
    subscriberCount: item.statistics?.subscriberCount
      ? Number(item.statistics.subscriberCount)
      : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action !== "callback" && action !== "url") {
    const authHeader = req.headers.get("Authorization");
    const validKeys = [Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")];
    const token = authHeader?.replace("Bearer ", "");
    if (!token || !validKeys.includes(token)) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  try {
    if (!action) return json({ error: "Missing action" }, 400);

    const redirectUri = `${SUPABASE_URL}/functions/v1/youtube-auth?action=callback`;

    if (action === "url") {
      const reqUserId = url.searchParams.get("userId") || FALLBACK_USER_ID;
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", YT_CLIENT_ID!);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("state", reqUserId);
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set(
        "scope",
        [
          "https://www.googleapis.com/auth/youtube.upload",
          "https://www.googleapis.com/auth/youtube.readonly",
          "https://www.googleapis.com/auth/userinfo.profile",
        ].join(" "),
      );

      return json({ url: authUrl.toString() });
    }

    if (action === "callback") {
      const error = url.searchParams.get("error");
      if (error) {
        return html(
          `<!DOCTYPE html><html><head><title>Error</title></head><body style="font-family:sans-serif;text-align:center;padding:50px;background:#0f0f0f;color:white;"><h2>Connection failed</h2><p>You can close this tab and try again in FlowPost.</p></body></html>`,
        );
      }

      const code = url.searchParams.get("code");
      const userId = url.searchParams.get("state") || FALLBACK_USER_ID;
      if (!code) return html("<html><body>Missing code</body></html>", 400);

      const tokens = await exchangeCodeForTokens(code, redirectUri);
      const { channelId, channelTitle, subscriberCount } = await fetchChannelInfo(tokens.access_token);

      const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      // Google may omit refresh_token on subsequent consents; preserve any existing one.
      let refreshTokenToStore: string | null = tokens.refresh_token ?? null;
      if (!refreshTokenToStore) {
        const { data: existing } = await supabaseAdmin
          .from("connected_accounts")
          .select("refresh_token")
          .eq("user_id", userId)
          .eq("platform", "youtube")
          .eq("account_id", channelId)
          .maybeSingle();
        refreshTokenToStore = (existing?.refresh_token as string | null) ?? null;
      }

      const { error: upsertError } = await supabaseAdmin
        .from("connected_accounts")
        .upsert(
          {
            user_id: userId,
            platform: "youtube",
            account_name: channelTitle,
            account_id: channelId,
            access_token: tokens.access_token,
            refresh_token: refreshTokenToStore,
            token_expiry: tokenExpiry,
            metadata: { subscriber_count: subscriberCount },
            is_connected: true,
            connected_at: new Date().toISOString(),
          },
          { onConflict: "user_id,platform,account_id" },
        );

      if (upsertError) throw upsertError;

      return html(
        `<!DOCTYPE html>
<html>
<head><title>Connected!</title></head>
<body style="font-family:sans-serif;text-align:center;padding:50px;background:#0f0f0f;color:white;">
  <h2>✅ YouTube Connected!</h2>
  <p>You can close this tab and return to FlowPost.</p>
</body>
</html>`,
      );
    }

    if (action === "refresh") {
      const accountId = url.searchParams.get("account_id");
      if (!accountId) return json({ error: "Missing account_id" }, 400);

      const { data: account, error: fetchError } = await supabaseAdmin
        .from("connected_accounts")
        .select("account_id, refresh_token")
        .eq("platform", "youtube")
        .eq("account_id", accountId)
        .single();

      if (fetchError || !account) return json({ error: "Account not found" }, 404);
      if (!account.refresh_token) return json({ error: "Missing refresh token" }, 400);

      const refreshed = await refreshAccessToken(account.refresh_token);
      const tokenExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

      const { error: updateError } = await supabaseAdmin
        .from("connected_accounts")
        .update({
          access_token: refreshed.access_token,
          token_expiry: tokenExpiry,
        })
        .eq("platform", "youtube")
        .eq("account_id", accountId);

      if (updateError) throw updateError;

      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("youtube-auth error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});



