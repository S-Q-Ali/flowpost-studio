import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { encrypt } from "../_shared/crypto.ts";
import { createRequestAuthorizer, createSessionLookup } from "../_shared/auth.ts";
import { createOAuthState, consumeOAuthState } from "../_shared/oauth-state.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FB_APP_ID = Deno.env.get("FB_APP_ID");
const FB_APP_SECRET = Deno.env.get("FB_APP_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

if (!FB_APP_ID || !FB_APP_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  console.error("Missing required secrets for facebook-auth function");
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

async function exchangeCodeForUserToken(code: string, redirectUri: string) {
  const res = await fetch("https://graph.facebook.com/v23.0/oauth/access_token", {
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
  const url = new URL("https://graph.facebook.com/v23.0/oauth/access_token");
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
  const url = new URL("https://graph.facebook.com/v23.0/me/accounts");
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

  let auth: Awaited<ReturnType<typeof authorize>> | null = null;
  if (action !== "callback") {
    auth = await authorize(req);
    if (!auth.allowed) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  try {
    if (!action) return json({ error: "Missing action" }, 400);

    const redirectUri = `${SUPABASE_URL}/functions/v1/facebook-auth?action=callback`;

    if (action === "url") {
      const reqUserId = url.searchParams.get("userId") || (auth && auth.kind === "session" ? auth.userId ?? null : null);
      if (!reqUserId) return json({ error: "Missing userId" }, 400);
      const mode = url.searchParams.get("mode") || "facebook";
      const state = await createOAuthState(supabaseAdmin, { userId: reqUserId, mode });
      const authUrl = new URL("https://www.facebook.com/v23.0/dialog/oauth");
      authUrl.searchParams.set("client_id", FB_APP_ID!);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("state", state);
      const scope = mode === "instagram"
        ? [
            'public_profile',
            'instagram_business_basic',
            'instagram_business_content_publish',
            'instagram_business_manage_insights',
            'instagram_manage_comments',
          ].join(',')
        : [
            'public_profile',
            'pages_show_list',
            'pages_read_engagement',
            'pages_manage_posts',
            'business_management',
            'read_insights',
            'instagram_basic',
            'instagram_content_publish',
            'instagram_manage_comments',
            'instagram_manage_insights'
          ].join(',');
      authUrl.searchParams.set("scope", scope);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("auth_type", "rerequest");

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
      const rawState = url.searchParams.get("state") || "";
      const oauthState = await consumeOAuthState(supabaseAdmin, rawState);
      if (!code) return html("<html><body>Missing code</body></html>", 400);
      if (!oauthState) return html("<html><body>Invalid or expired state. Please start the connection from FlowPost again.</body></html>", 400);
      const userId = oauthState.userId;
      const mode = oauthState.mode || "facebook";

      const shortLived = await exchangeCodeForUserToken(code, redirectUri);
      const longLived = await getLongLivedUserToken(shortLived.access_token);

      if (mode === "instagram") {
        // Standalone Instagram flow (Creator/Business account, no Facebook Page needed)
        const meResp = await fetch(
          `https://graph.facebook.com/v23.0/me?fields=instagram_business_account&access_token=${longLived.access_token}`,
        );
        const meData = await meResp.json();

        if (!meData?.instagram_business_account?.id) {
          return html(
            `<!DOCTYPE html><html><head><title>No Instagram Account</title></head><body style="font-family:sans-serif;text-align:center;padding:50px;background:#0f0f0f;color:white;"><h2>Instagram account not found</h2><p>This Facebook account isn't connected to an Instagram Creator or Business account. Please switch your Instagram account to a Creator or Business account in Instagram Settings &gt; Account &gt; Switch to Professional Account, then try again.</p></body></html>`,
          );
        }

        const igId = meData.instagram_business_account.id;
        const igAccountRes = await fetch(
          `https://graph.facebook.com/v23.0/${igId}?fields=id,name,username,profile_picture_url&access_token=${longLived.access_token}`,
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
              access_token: await encrypt(longLived.access_token),
              is_connected: true,
              connected_at: new Date().toISOString(),
              metadata: {
                standalone: true,
                profile_picture: igAccount.profile_picture_url,
              },
            },
            { onConflict: "user_id,platform,account_id" },
          );

        if (igUpsertError) throw igUpsertError;

        return new Response(null, {
          status: 302,
          headers: { Location: "https://flowpost-studio.vercel.app/accounts?connected=instagram" },
        });
      }

      // Existing Facebook + Instagram flow
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
              access_token: await encrypt(pageAccessToken),
              is_connected: true,
              connected_at: new Date().toISOString(),
              metadata: { category, picture_url: pictureUrl },
            },
            { onConflict: "user_id,platform,account_id" },
          );

        if (fbUpsertError) throw fbUpsertError;

        const igResponse = await fetch(
          `https://graph.facebook.com/v23.0/${page.id}?fields=instagram_business_account&access_token=${pageAccessToken}`,
        );
        const igData = await igResponse.json();

        if (igData.instagram_business_account) {
          const igAccountRes = await fetch(
            `https://graph.facebook.com/v23.0/${igData.instagram_business_account.id}?fields=id,name,username,profile_picture_url&access_token=${pageAccessToken}`,
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
                access_token: await encrypt(pageAccessToken),
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

      return new Response(null, {
        status: 302,
        headers: { Location: "https://flowpost-studio.vercel.app/accounts?connected=facebook" },
      });
    }

    if (action === "sync-pages") {
      const body = await req.json();
      const { userId, pages, accessToken } = body;
      if (!userId) return json({ error: "Missing userId" }, 400);

      // Try Graph API if a user-level access token was provided
      let fetchedPages: Array<{ id: string; name?: string; access_token?: string; category?: string; picture?: { data?: { url?: string } } }> | null = null;
      if (accessToken) {
        try {
          fetchedPages = await fetchFacebookPages(accessToken);
        } catch (err) {
          console.warn("[sync-pages] Graph API fetch failed, falling back to provided pages:", err);
        }
      }

      // Fall back to pages provided by the frontend (from extension)
      const resolvedPages = fetchedPages ?? (pages ?? []);
      if (!resolvedPages.length) return json({ error: "No pages to sync" }, 400);

      // Get existing Facebook page IDs for this user
      const { data: existing } = await supabaseAdmin
        .from("connected_accounts")
        .select("account_id")
        .eq("user_id", userId)
        .eq("platform", "facebook")
        .eq("is_connected", true);

      const existingIds = new Set((existing ?? []).map(r => r.account_id));
      const incomingIds = new Set<string>();

      for (const page of resolvedPages) {
        const pageId = String(page.id || page.account_id);
        incomingIds.add(pageId);
        const pictureUrl = page.picture?.data?.url ?? null;
        const pageAccessToken = page.access_token || null;

        const { error: upsertErr } = await supabaseAdmin
          .from("connected_accounts")
          .upsert({
            user_id: userId,
            platform: "facebook",
            account_name: page.name ?? page.account_name ?? "Facebook Page",
            account_id: pageId,
            ...(pageAccessToken ? { access_token: await encrypt(pageAccessToken) } : {}),
            is_connected: true,
            connected_at: new Date().toISOString(),
            metadata: page.category ? { category: page.category, picture_url: pictureUrl } : { picture_url: pictureUrl },
          }, { onConflict: "user_id,platform,account_id" });

        if (upsertErr) {
          console.error(`[sync-pages] Failed to upsert page ${pageId}:`, upsertErr);
          return json({ error: `Failed to sync page ${pageId}: ${upsertErr.message}` }, 500);
        }

        // Sync linked Instagram account if we have a fresh page access token
        if (pageAccessToken) {
          try {
            const igResp = await fetch(
              `https://graph.facebook.com/v23.0/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`
            );
            const igData = await igResp.json();
            if (igData.instagram_business_account) {
              const igAcct = await fetch(
                `https://graph.facebook.com/v23.0/${igData.instagram_business_account.id}?fields=id,name,username,profile_picture_url&access_token=${pageAccessToken}`
              ).then(r => r.json());
              if (igAcct.id) {
                await supabaseAdmin
                  .from("connected_accounts")
                  .upsert({
                    user_id: userId,
                    platform: "instagram",
                    account_name: igAcct.username || igAcct.name || "Instagram",
                    account_id: igAcct.id,
                    access_token: await encrypt(pageAccessToken),
                    is_connected: true,
                    connected_at: new Date().toISOString(),
                    metadata: { page_id: pageId, page_name: page.name, profile_picture: igAcct.profile_picture_url },
                  }, { onConflict: "user_id,platform,account_id" });
              }
            }
          } catch (igErr) {
            console.warn(`[sync-pages] Failed to sync Instagram for page ${pageId}:`, igErr);
          }
        }
      }

      // Disconnect pages no longer managed
      for (const existingId of existingIds) {
        if (!incomingIds.has(existingId)) {
          await supabaseAdmin
            .from("connected_accounts")
            .update({ is_connected: false })
            .eq("user_id", userId)
            .eq("platform", "facebook")
            .eq("account_id", existingId);
        }
      }

      // Return updated list
      const { data: updated } = await supabaseAdmin
        .from("connected_accounts")
        .select("account_id, account_name, metadata, is_connected")
        .eq("user_id", userId)
        .eq("platform", "facebook")
        .order("account_name");

      return json({ success: true, pages: updated ?? [] });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("facebook-auth error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});



