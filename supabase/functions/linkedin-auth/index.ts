import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { encrypt } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LI_CLIENT_ID = Deno.env.get("LINKEDIN_CLIENT_ID");
const LI_CLIENT_SECRET = Deno.env.get("LINKEDIN_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

if (!LI_CLIENT_ID || !LI_CLIENT_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  console.error("Missing required secrets for linkedin-auth function");
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

async function exchangeCodeForToken(code: string, redirectUri: string) {
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: LI_CLIENT_ID!,
      client_secret: LI_CLIENT_SECRET!,
      redirect_uri: redirectUri,
    }),
  });

  const jsonRes = await res.json();
  if (!res.ok) throw new Error(`LinkedIn token exchange failed: ${JSON.stringify(jsonRes)}`);
  return jsonRes as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
}

async function fetchLinkedInProfile(accessToken: string) {
  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const jsonRes = await res.json();
  if (!res.ok) throw new Error(`LinkedIn profile fetch failed: ${JSON.stringify(jsonRes)}`);
  return jsonRes as {
    sub: string;
    name?: string;
    given_name?: string;
    family_name?: string;
    email?: string;
    picture?: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const action = (url.searchParams.get("action") || body?.action) as string | undefined;
  const reqUserId = (url.searchParams.get("userId") || body?.userId) as string | undefined;

  if (action !== "callback") {
    const authHeader = req.headers.get("Authorization");
    const validKeys = [SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, Deno.env.get("FRONTEND_API_KEY")].filter(Boolean);
    const token = authHeader?.replace("Bearer ", "");
    if (!token || !validKeys.includes(token)) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  try {
    if (!action) return json({ error: "Missing action" }, 400);

    const redirectUri = `${SUPABASE_URL}/functions/v1/linkedin-auth?action=callback`;

    if (action === "url") {
      if (!reqUserId) return json({ error: "Missing userId" }, 400);
      const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
      authUrl.searchParams.set("client_id", LI_CLIENT_ID!);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("state", reqUserId);
      authUrl.searchParams.set("scope", "openid profile email w_member_social");
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

      const tokens = await exchangeCodeForToken(code, redirectUri);
      const profile = await fetchLinkedInProfile(tokens.access_token);

      const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      const { error: upsertError } = await supabaseAdmin
        .from("connected_accounts")
        .upsert(
          {
            user_id: userId,
            platform: "linkedin",
            account_name: profile.name ?? profile.given_name ?? "LinkedIn User",
            account_id: profile.sub,
            access_token: await encrypt(tokens.access_token),
            refresh_token: tokens.refresh_token ? await encrypt(tokens.refresh_token) : null,
            token_expiry: tokenExpiry,
            is_connected: true,
            connected_at: new Date().toISOString(),
            metadata: {
              email: profile.email,
              picture: profile.picture,
            },
          },
          { onConflict: "user_id,platform,account_id" },
        );

      if (upsertError) throw upsertError;

      return new Response(null, {
        status: 302,
        headers: { Location: "https://flowpost-studio.vercel.app/accounts?connected=linkedin" },
      });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("linkedin-auth error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
