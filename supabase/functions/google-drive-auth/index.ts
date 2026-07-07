import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { encrypt, decrypt } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GD_CLIENT_ID = Deno.env.get("GD_CLIENT_ID");
const GD_CLIENT_SECRET = Deno.env.get("GD_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!GD_CLIENT_ID || !GD_CLIENT_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required secrets for google-drive-auth function");
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
      client_id: GD_CLIENT_ID!,
      client_secret: GD_CLIENT_SECRET!,
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
      client_id: GD_CLIENT_ID!,
      client_secret: GD_CLIENT_SECRET!,
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

async function fetchDriveUserInfo(accessToken: string) {
  const res = await fetch(
    "https://www.googleapis.com/drive/v3/about?fields=user",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const jsonRes = await res.json();
  if (!res.ok) throw new Error(`Drive user fetch failed: ${JSON.stringify(jsonRes)}`);
  return jsonRes.user as { displayName?: string; emailAddress?: string; photoLink?: string };
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

    const redirectUri = `${SUPABASE_URL}/functions/v1/google-drive-auth?action=callback`;

    if (action === "url") {
      const reqUserId = url.searchParams.get("userId");
      if (!reqUserId) return json({ error: "Missing userId" }, 400);
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", GD_CLIENT_ID!);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("state", reqUserId);
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set(
        "scope",
        [
          "https://www.googleapis.com/auth/drive.readonly",
          "https://www.googleapis.com/auth/spreadsheets",
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
      const userId = url.searchParams.get("state");
      if (!code) return html("<html><body>Missing code</body></html>", 400);
      if (!userId) return html("<html><body>Missing user ID in state</body></html>", 400);

      const tokens = await exchangeCodeForTokens(code, redirectUri);
      const userInfo = await fetchDriveUserInfo(tokens.access_token);
      const accountId = userInfo.emailAddress || `drive-${userId}`;
      const accountName = userInfo.displayName || "Google Drive";
      const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      let refreshTokenToStore: string | null = tokens.refresh_token ?? null;
      if (!refreshTokenToStore) {
        const { data: existing } = await supabaseAdmin
          .from("connected_accounts")
          .select("refresh_token")
          .eq("user_id", userId)
          .eq("platform", "google_drive")
          .maybeSingle();
        refreshTokenToStore = (existing?.refresh_token as string | null) ?? null;
      }

      const { error: upsertError } = await supabaseAdmin
        .from("connected_accounts")
        .upsert(
          {
            user_id: userId,
            platform: "google_drive",
            account_name: accountName,
            account_id: accountId,
            access_token: await encrypt(tokens.access_token),
            refresh_token: refreshTokenToStore ? await encrypt(refreshTokenToStore) : null,
            token_expiry: tokenExpiry,
            metadata: { email: userInfo.emailAddress, photo: userInfo.photoLink },
            is_connected: true,
            connected_at: new Date().toISOString(),
          },
          { onConflict: "user_id,platform,account_id" },
        );

      if (upsertError) throw upsertError;

      return html(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Connected!</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f0f0f;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;padding:48px 40px;max-width:420px;width:100%;text-align:center}
.icon{font-size:56px;margin-bottom:16px;display:block}
h2{color:#fff;font-size:22px;font-weight:600;margin-bottom:8px}
p{color:#888;font-size:14px;line-height:1.5;margin-bottom:28px}
.btn{display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:500;transition:background .2s}
.btn:hover{background:#1d4ed8}
.note{color:#555;font-size:12px;margin-top:20px}
</style>
</head>
<body>
<div class="card">
<span class="icon">✅</span>
<h2>Google Drive Connected!</h2>
<p>Your Google Drive has been successfully linked to FlowPost. You can now select it when creating workflows.</p>
<a class="btn" href="https://flowpost-studio.vercel.app/accounts">Return to FlowPost</a>
<div class="note">This tab can be closed</div>
</div>
</body>
</html>`);
    }

    if (action === "refresh") {
      const userIdParam = url.searchParams.get("user_id");
      const accountIdParam = url.searchParams.get("account_id");
      if (!userIdParam) return json({ error: "Missing user_id" }, 400);

      let query = supabaseAdmin
        .from("connected_accounts")
        .select("*")
        .eq("platform", "google_drive")
        .eq("user_id", userIdParam);

      if (accountIdParam) {
        query = query.eq("id", accountIdParam);
      }

      const { data: account, error: fetchError } = await query.single();

      if (fetchError || !account) return json({ error: "Drive account not found" }, 404);
      const rawRefreshToken = await decrypt(account.refresh_token as string);
      if (!rawRefreshToken) return json({ error: "Missing refresh token" }, 400);

      const refreshed = await refreshAccessToken(rawRefreshToken);
      const tokenExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

      let updateQuery = supabaseAdmin
        .from("connected_accounts")
        .update({
          access_token: await encrypt(refreshed.access_token),
          token_expiry: tokenExpiry,
        })
        .eq("platform", "google_drive")
        .eq("user_id", userIdParam);

      if (accountIdParam) {
        updateQuery = updateQuery.eq("id", accountIdParam);
      }

      const { error: updateError } = await updateQuery;

      if (updateError) throw updateError;

      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("google-drive-auth error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
