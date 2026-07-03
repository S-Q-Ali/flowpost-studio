import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FB_APP_ID = Deno.env.get("FB_APP_ID");
const FB_APP_SECRET = Deno.env.get("FB_APP_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const FALLBACK_USER_ID = "00000000-0000-0000-0000-000000000000";

if (!FB_APP_ID || !FB_APP_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  console.error("Missing required secrets for facebook-auth function");
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

async function exchangeCodeForUserToken(code: string, redirectUri: string) {
  const res = await fetch("https://graph.facebook.com/v21.0/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: FB_APP_ID!,
      client_secret: FB_APP_SECRET!,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const jsonRes = await res.json();
  if (!res.ok) throw new Error(`FB token exchange failed: ${JSON.stringify(jsonRes)}`);
  return jsonRes as { access_token: string; token_type?: string; expires_in?: number };
}

async function getLongLivedUserToken(shortLivedToken: string) {
  const url = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", FB_APP_ID!);
  url.searchParams.set("client_secret", FB_APP_SECRET!);
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const res = await fetch(url.toString(), { method: "GET" });
  const jsonRes = await res.json();
  if (!res.ok) throw new Error(`FB long-lived exchange failed: ${JSON.stringify(jsonRes)}`);
  return jsonRes as { access_token: string; token_type?: string; expires_in?: number };
}

async function fetchFacebookPages(longLivedUserToken: string) {
  const url = new URL("https://graph.facebook.com/v21.0/me/accounts");
  url.searchParams.set("access_token", longLivedUserToken);
  url.searchParams.set("fields", "id,name,access_token,category,picture");

  const res = await fetch(url.toString(), { method: "GET" });
  const jsonRes = await res.json();
  if (!res.ok) throw new Error(`FB pages fetch failed: ${JSON.stringify(jsonRes)}`);

  const pages = (jsonRes?.data ?? []) as Array<{
    id: string;
    name?: string;
    access_token?: string;
    category?: string;
    picture?: { data?: { url?: string } };
  }>;

  return pages.filter((p) => !!p.id && !!p.access_token);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const actionFromQuery = url.searchParams.get("action");

  let action: string | null = actionFromQuery;
  if (!action) {
    try {
      const body = await req.json();
      action = typeof body?.action === "string" ? body.action : null;
    } catch {
      // ignore
    }
  }

  if (action !== "callback") {
    const authHeader = req.headers.get("Authorization");
    const validKeys = [SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY];
    const token = authHeader?.replace("Bearer ", "");
    if (!token || !validKeys.includes(token)) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  try {
    if (!action) return json({ error: "Missing action" }, 400);

    const redirectUri = `${SUPABASE_URL}/functions/v1/facebook-auth?action=callback`;

    if (action === "url") {
      const reqUserId = url.searchParams.get("userId") || FALLBACK_USER_ID;
      const authUrl = new URL("https://www.facebook.com/v21.0/dialog/oauth");
      authUrl.searchParams.set("client_id", FB_APP_ID!);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("state", reqUserId);
      const scope = [
        'public_profile',
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_posts',
        'business_management',
        'instagram_basic',
        'instagram_content_publish',
        'instagram_manage_comments'
      ].join(',');
      authUrl.searchParams.set("scope", scope);
      authUrl.searchParams.set("response_type", "code");

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

      const shortLived = await exchangeCodeForUserToken(code, redirectUri);
      const longLived = await getLongLivedUserToken(shortLived.access_token);

      const pages = await fetchFacebookPages(longLived.access_token);

      for (const page of pages) {
        const pictureUrl = page.picture?.data?.url ?? null;
        const category = page.category ?? null;
        const pageAccessToken = page.access_token!;

        const { error: fbUpsertError } = await supabaseAdmin
          .from("connected_accounts")
          .upsert(
            {
              user_id: userId,
              platform: "facebook",
              account_name: page.name ?? "Facebook Page",
              account_id: page.id,
              access_token: pageAccessToken,
              is_connected: true,
              connected_at: new Date().toISOString(),
              metadata: { category, picture_url: pictureUrl },
            },
            { onConflict: "user_id,platform,account_id" },
          );

        if (fbUpsertError) throw fbUpsertError;

        // Fetch connected Instagram account for this page
        const igResponse = await fetch(
          `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${pageAccessToken}`,
        );
        const igData = await igResponse.json();

        if (igData.instagram_business_account) {
          const igAccountRes = await fetch(
            `https://graph.facebook.com/v18.0/${igData.instagram_business_account.id}?fields=id,name,username,profile_picture_url&access_token=${pageAccessToken}`,
          );
          const igAccount = await igAccountRes.json();

          const { error: igUpsertError } = await supabaseAdmin
            .from("connected_accounts")
            .upsert(
              {
                user_id: userId,
                platform: "instagram",
                account_name: igAccount.username || igAccount.name || "Instagram",
                account_id: igAccount.id,
                access_token: pageAccessToken,
                is_connected: true,
                connected_at: new Date().toISOString(),
                metadata: {
                  page_id: page.id,
                  page_name: page.name,
                  profile_picture: igAccount.profile_picture_url,
                },
              },
              { onConflict: "user_id,platform,account_id" },
            );

          if (igUpsertError) throw igUpsertError;
        }
      }

      return html(
        `<!DOCTYPE html>
<html>
<head><title>Connected!</title></head>
<body style="font-family:sans-serif;text-align:center;padding:50px;background:#0f0f0f;color:white;">
  <h2>✅ Facebook & Instagram Connected!</h2>
  <p>You can close this tab and return to FlowPost.</p>
</body>
</html>`,
      );
    }

    if (action === "refresh") {
      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("facebook-auth error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});


