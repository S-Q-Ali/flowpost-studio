import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { encrypt, decrypt } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIKTOK_CLIENT_KEY = Deno.env.get("TIKTOK_CLIENT_KEY");
const TIKTOK_CLIENT_SECRET = Deno.env.get("TIKTOK_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required secrets for tiktok-auth function");
}

const supabaseAdmin = createClient(
  SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const TIKTOK_SCOPES = "user.info.basic,video.publish,video.upload";
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/tiktok-auth`;

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

function generateState(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function encodeStateParam(userId: string): string {
  const rawState = generateState();
  const obj = JSON.stringify({ r: rawState, u: userId });
  return btoa(obj).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeUserIdFromState(encoded: string): string | null {
  try {
    const json = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    const obj = JSON.parse(json);
    return obj?.u || null;
  } catch {
    return null;
  }
}

async function exchangeCodeForToken(code: string) {
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY!,
      client_secret: TIKTOK_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`TikTok token exchange failed: ${JSON.stringify(data)}`);
  }
  return data as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    refresh_expires_in: number;
    open_id: string;
    scope: string;
    token_type: string;
  };
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY!,
      client_secret: TIKTOK_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`TikTok token refresh failed: ${JSON.stringify(data)}`);
  }
  return data as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    refresh_expires_in: number;
    open_id: string;
    scope: string;
    token_type: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // Callback is detected by the presence of `code` and `state` query params
  // (TikTok always sends both on the redirect). The redirect URI registered
  // in the TikTok app is the bare function URL with no query string.
  const isCallback = url.searchParams.has("code") && url.searchParams.has("state");

  if (!isCallback) {
    const authHeader = req.headers.get("Authorization");
    const validKeys = [SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, Deno.env.get("FRONTEND_API_KEY")].filter(Boolean);
    const token = authHeader?.replace("Bearer ", "");
    if (!token || !validKeys.includes(token)) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  try {
    if (isCallback) {
      const error = url.searchParams.get("error");
      if (error) {
        return html(
          `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:50px;background:#0f0f0f;color:white;"><h2>Connection failed</h2><p>${error}</p><p>You can close this tab and try again in FlowPost.</p></body></html>`,
        );
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !state) {
        return html("<html><body>Missing code or state</body></html>", 400);
      }
      const userId = decodeUserIdFromState(state);
      if (!userId) return html("<html><body>Invalid state: could not extract user</body></html>", 400);

      // Verify state from the DB (one-time use, expires in 10 min)
      const { data: stateRow, error: stateError } = await supabaseAdmin
        .from("tiktok_oauth_states")
        .select("state, expires_at")
        .eq("state", state)
        .maybeSingle();

      if (stateError) {
        console.error("State lookup error", stateError);
        return html("<html><body>State verification failed</body></html>", 500);
      }

      if (!stateRow) {
        return html(
          `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:50px;background:#0f0f0f;color:white;"><h2>Invalid or expired state</h2><p>Please try connecting again from FlowPost.</p></body></html>`,
          400,
        );
      }

      const expiresAt = new Date(stateRow.expires_at);
      if (expiresAt < new Date()) {
        await supabaseAdmin.from("tiktok_oauth_states").delete().eq("state", state);
        return html(
          `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:50px;background:#0f0f0f;color:white;"><h2>State expired</h2><p>Please try again.</p></body></html>`,
          400,
        );
      }

      // Consume the state (one-time use)
      await supabaseAdmin.from("tiktok_oauth_states").delete().eq("state", state);

      const tokenData = await exchangeCodeForToken(code);
      console.log("TikTok token scope:", tokenData.scope);
      console.log("TikTok token open_id:", tokenData.open_id);

      const openId = tokenData.open_id;
      if (!openId) {
        return html("<html><body>No open_id returned from TikTok</body></html>", 500);
      }

      const display_name = "TikTok Account";
      const avatar_url = null;
      const union_id = null;

      const now = Date.now();
      const expiresAtIso = new Date(now + tokenData.expires_in * 1000).toISOString();
      const refreshExpiresAtIso = new Date(now + tokenData.refresh_expires_in * 1000).toISOString();

      const { error: upsertError } = await supabaseAdmin
        .from("connected_accounts")
        .upsert(
          {
            user_id: userId,
            platform: "tiktok",
            account_name: display_name,
            account_id: openId,
            access_token: await encrypt(tokenData.access_token),
            is_connected: true,
            connected_at: new Date().toISOString(),
            token_expiry: expiresAtIso,
            metadata: {
              refresh_token: await encrypt(tokenData.refresh_token),
              refresh_expires_at: refreshExpiresAtIso,
              scope: tokenData.scope,
              union_id: union_id,
              avatar_url: avatar_url,
            },
          },
          { onConflict: "user_id,platform,account_id" },
        );

      if (upsertError) throw upsertError;

      return new Response(null, {
        status: 302,
        headers: { Location: "https://flowpost-studio.vercel.app/accounts?connected=tiktok" },
      });
    }

    const actionFromQuery = url.searchParams.get("action");

    if (actionFromQuery === "url") {
      const reqUserId = url.searchParams.get("userId");
      if (!reqUserId) return json({ error: "Missing userId" }, 400);
      const state = encodeStateParam(reqUserId);
      const expiresAtIso = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const { error: stateInsertError } = await supabaseAdmin
        .from("tiktok_oauth_states")
        .insert({ state, expires_at: expiresAtIso });

      if (stateInsertError) {
        console.error("Failed to store state", stateInsertError);
        return json({ error: "Failed to initiate OAuth" }, 500);
      }

      const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
      authUrl.searchParams.set("client_key", TIKTOK_CLIENT_KEY!);
      authUrl.searchParams.set("scope", TIKTOK_SCOPES);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("state", state);

      return json({ url: authUrl.toString(), state });
    }

    if (actionFromQuery === "refresh") {
      const openId = url.searchParams.get("open_id");
      const userId = url.searchParams.get("userId");
      if (!openId) return json({ error: "Missing open_id" }, 400);
      if (!userId) return json({ error: "Missing userId" }, 400);

      const { data: account, error: accountError } = await supabaseAdmin
        .from("connected_accounts")
        .select("metadata, token_expiry")
        .eq("user_id", userId)
        .eq("platform", "tiktok")
        .eq("account_id", openId)
        .maybeSingle();

      if (accountError || !account) {
        return json({ error: "TikTok account not found" }, 404);
      }

      const encryptedRefreshToken = (account.metadata as any)?.refresh_token;
      if (!encryptedRefreshToken) {
        return json({ error: "No refresh token available" }, 400);
      }
      const refreshToken = await decrypt(encryptedRefreshToken);

      const refreshed = await refreshAccessToken(refreshToken);
      const expiresAtIso = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      const refreshExpiresAtIso = new Date(
        Date.now() + refreshed.refresh_expires_in * 1000,
      ).toISOString();

      const { error: updateError } = await supabaseAdmin
        .from("connected_accounts")
        .update({
          access_token: await encrypt(refreshed.access_token),
          token_expiry: expiresAtIso,
          metadata: {
            ...(account.metadata as any),
            refresh_token: await encrypt(refreshed.refresh_token),
            refresh_expires_at: refreshExpiresAtIso,
            scope: refreshed.scope,
          },
        })
        .eq("user_id", userId)
        .eq("platform", "tiktok")
        .eq("account_id", openId);

      if (updateError) throw updateError;

      return json({ success: true, expires_at: expiresAtIso });
    }

    return json({ error: "Invalid action or missing parameters" }, 400);
  } catch (err) {
    console.error("tiktok-auth error", err);
    return json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});


