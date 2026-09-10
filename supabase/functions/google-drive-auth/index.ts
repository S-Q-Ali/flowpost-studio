import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { encrypt, decrypt } from "../_shared/crypto.ts";
import { createRequestAuthorizer, createSessionLookup, resolveSessionOwner } from "../_shared/auth.ts";
import { createOAuthState, consumeOAuthState } from "../_shared/oauth-state.ts";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GD_CLIENT_ID = Deno.env.get("GD_CLIENT_ID");
const GD_CLIENT_SECRET = Deno.env.get("GD_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT");
const R2_ACCESS_KEY = Deno.env.get("R2_ACCESS_KEY");
const R2_SECRET_KEY = Deno.env.get("R2_SECRET_KEY");
const R2_BUCKET = Deno.env.get("R2_BUCKET");
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL");

if (!GD_CLIENT_ID || !GD_CLIENT_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required secrets for google-drive-auth function");
}

const s3Client = (R2_ENDPOINT && R2_ACCESS_KEY && R2_SECRET_KEY && R2_BUCKET)
  ? new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
    })
  : null;

const supabaseAdmin = createClient(
  SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const authorize = createRequestAuthorizer({
  serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  cronApiKey: null,
  frontendApiKey: Deno.env.get("FRONTEND_API_KEY"),
  anonKey: Deno.env.get("SUPABASE_ANON_KEY"),
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
  const body = await req.json().catch(() => ({}));
  const action = url.searchParams.get("action") || body?.action;

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

    const redirectUri = `${SUPABASE_URL}/functions/v1/google-drive-auth?action=callback`;

    if (action === "url") {
      const owner = resolveSessionOwner(auth, url.searchParams.get("userId"));
      if (owner.denied) return json({ error: "Unauthorized" }, 401);
      if (!owner.userId) return json({ error: "Missing userId" }, 400);
      const reqUserId = owner.userId;
      const loginHint = url.searchParams.get("login_hint");
      const state = await createOAuthState(supabaseAdmin, { userId: reqUserId });
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", GD_CLIENT_ID!);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("prompt", "select_account consent");
      if (loginHint) authUrl.searchParams.set("login_hint", loginHint);
      authUrl.searchParams.set(
        "scope",
        [
          "https://www.googleapis.com/auth/drive",
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
      const rawState = url.searchParams.get("state") || "";
      const oauthState = await consumeOAuthState(supabaseAdmin, rawState);
      if (!code) return html("<html><body>Missing code</body></html>", 400);
      if (!oauthState) return html("<html><body>Invalid or expired state. Please start the connection from FlowPost again.</body></html>", 400);
      const userId = oauthState.userId;

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
          .eq("account_id", accountId)
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

      return new Response(null, {
        status: 302,
        headers: { Location: "https://flowpost-studio.vercel.app/accounts?connected=drive" },
      });
    }

    if (action === "refresh") {
      const userIdParam = url.searchParams.get("user_id");
      const accountIdParam = url.searchParams.get("account_id");
      if (!userIdParam) return json({ error: "Missing user_id" }, 400);
      if (sessionUserId && userIdParam !== sessionUserId) return json({ error: "Unauthorized" }, 401);

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

    if (action === "quota") {
      const accountIdParam = url.searchParams.get("account_id") || body?.account_id;
      if (!accountIdParam) return json({ error: "Missing account_id" }, 400);

      let accountQuery = supabaseAdmin
        .from("connected_accounts")
        .select("*")
        .eq("id", accountIdParam)
        .eq("platform", "google_drive")
        .eq("is_connected", true);
      if (sessionUserId) accountQuery = accountQuery.eq("user_id", sessionUserId);
      const { data: account, error: fetchError } = await accountQuery.single();

      if (fetchError || !account) return json({ error: "Drive account not found" }, 404);

      const rawRefresh = await decrypt(account.refresh_token as string);
      if (!rawRefresh) return json({ error: "Missing refresh token" }, 400);

      const refreshed = await refreshAccessToken(rawRefresh);
      const quotaRes = await fetch(
        "https://www.googleapis.com/drive/v3/about?fields=storageQuota",
        { headers: { Authorization: `Bearer ${refreshed.access_token}` } },
      );
      const quotaJson = await quotaRes.json();
      if (!quotaRes.ok) throw new Error(`Drive quota fetch failed: ${JSON.stringify(quotaJson)}`);

      const sq = quotaJson.storageQuota || {};
      return json({
        limit: sq.limit ? parseInt(sq.limit, 10) : null,
        usage: sq.usage ? parseInt(sq.usage, 10) : 0,
        usageInDrive: sq.usageInDrive ? parseInt(sq.usageInDrive, 10) : 0,
      });
    }

    if (action === "list-files") {
      const accountIdParam = url.searchParams.get("account_id") || body?.account_id;
      const parentId = url.searchParams.get("parent_id") || body?.parent_id || "root";
      const pageToken = url.searchParams.get("page_token") || body?.page_token;

      if (!accountIdParam) return json({ error: "Missing account_id" }, 400);

      let accountQuery = supabaseAdmin
        .from("connected_accounts")
        .select("*")
        .eq("id", accountIdParam)
        .eq("platform", "google_drive")
        .eq("is_connected", true);
      if (sessionUserId) accountQuery = accountQuery.eq("user_id", sessionUserId);
      const { data: account, error: fetchError } = await accountQuery.single();

      if (fetchError || !account) return json({ error: "Drive account not found" }, 404);

      const rawRefresh = await decrypt(account.refresh_token as string);
      if (!rawRefresh) return json({ error: "Missing refresh token" }, 400);

      const refreshed = await refreshAccessToken(rawRefresh);
      const q = `'${parentId}' in parents and trashed=false`;
      const listUrl = new URL("https://www.googleapis.com/drive/v3/files");
      listUrl.searchParams.set("q", q);
      listUrl.searchParams.set("pageSize", "50");
      listUrl.searchParams.set("orderBy", "modifiedTime desc");
      listUrl.searchParams.set("fields", "files(id,name,mimeType,size,modifiedTime),nextPageToken");
      if (pageToken) listUrl.searchParams.set("pageToken", pageToken);

      const listRes = await fetch(listUrl.toString(), {
        headers: { Authorization: `Bearer ${refreshed.access_token}` },
      });
      const listJson = await listRes.json();
      if (!listRes.ok) throw new Error(`Drive list files failed: ${JSON.stringify(listJson)}`);

      return json({
        files: (listJson.files || []).map((f: any) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size ? parseInt(f.size, 10) : 0,
          modifiedTime: f.modifiedTime,
        })),
        nextPageToken: listJson.nextPageToken || null,
      });
    }

    if (action === "create-folder") {
      const accountIdParam = url.searchParams.get("account_id") || body?.account_id;
      const folderName = url.searchParams.get("name") || body?.name;
      const parentId = url.searchParams.get("parent_id") || body?.parent_id || "root";
      if (!accountIdParam || !folderName) return json({ error: "Missing account_id or name" }, 400);

      let accountQuery = supabaseAdmin
        .from("connected_accounts")
        .select("*")
        .eq("id", accountIdParam)
        .eq("platform", "google_drive")
        .eq("is_connected", true);
      if (sessionUserId) accountQuery = accountQuery.eq("user_id", sessionUserId);
      const { data: account, error: fetchError } = await accountQuery.single();

      if (fetchError || !account) return json({ error: "Drive account not found" }, 404);

      const rawRefresh = await decrypt(account.refresh_token as string);
      if (!rawRefresh) return json({ error: "Missing refresh token" }, 400);

      const refreshed = await refreshAccessToken(rawRefresh);
      const folderMeta = {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: parentId !== "root" ? [parentId] : [],
      };
      const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${refreshed.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(folderMeta),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) throw new Error(`Drive create folder failed: ${JSON.stringify(createJson)}`);
      return json({ id: createJson.id, name: createJson.name });
    }

    if (action === "get-token") {
      const reqUserId = url.searchParams.get("user_id") || body?.user_id;
      const accountIdParam = url.searchParams.get("account_id") || body?.account_id;
      if (!reqUserId || !accountIdParam) return json({ error: "Missing user_id or account_id" }, 400);
      if (sessionUserId && reqUserId !== sessionUserId) return json({ error: "Unauthorized" }, 401);

      const { data: account, error: fetchError } = await supabaseAdmin
        .from("connected_accounts")
        .select("*")
        .eq("id", accountIdParam)
        .eq("platform", "google_drive")
        .eq("is_connected", true)
        .eq("user_id", reqUserId)
        .single();

      if (fetchError || !account) return json({ error: "Drive account not found" }, 404);

      const rawRefresh = await decrypt(account.refresh_token as string);
      if (!rawRefresh) return json({ error: "Missing refresh token" }, 400);

      const refreshed = await refreshAccessToken(rawRefresh);
      return json({
        access_token: refreshed.access_token,
        expires_in: refreshed.expires_in,
      });
    }

    if (action === "upload-video-to-r2") {
      if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

      const { account_id, file_id, file_name, user_id, media_type } = body;
      if (!account_id || !file_id || !user_id) return json({ error: "Missing required fields" }, 400);
      if (sessionUserId && user_id !== sessionUserId) return json({ error: "Unauthorized" }, 401);

      let accountQuery = supabaseAdmin
        .from("connected_accounts")
        .select("*")
        .eq("id", account_id)
        .eq("platform", "google_drive")
        .eq("is_connected", true);
      if (sessionUserId) accountQuery = accountQuery.eq("user_id", sessionUserId);
      const { data: account, error: fetchError } = await accountQuery.single();

      if (fetchError || !account) return json({ error: "Drive account not found" }, 404);

      const rawRefresh = await decrypt(account.refresh_token as string);
      if (!rawRefresh) return json({ error: "Missing refresh token" }, 400);
      const refreshed = await refreshAccessToken(rawRefresh);

      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file_id}?fields=name,mimeType,size`,
        { headers: { Authorization: `Bearer ${refreshed.access_token}` } },
      );
      const metaJson = await metaRes.json();
      if (!metaRes.ok) throw new Error(`Drive file info failed: ${JSON.stringify(metaJson)}`);

      const driveMimeType = metaJson.mimeType || "video/mp4";
      const fileExt = `.${(metaJson.name || file_name || "video.mp4").split(".").pop() || "mp4"}`;
      const size = metaJson.size ? parseInt(metaJson.size, 10) : 0;
      const title = metaJson.name || file_name || "Untitled";

      const { data: videoRecord, error: insertError } = await supabaseAdmin
        .from("videos")
        .insert({
          user_id,
          title,
          file_url: null,
          media_type: media_type || "video",
          video_size: size,
        })
        .select("id, title, file_url, uploaded_at")
        .single();

      if (insertError || !videoRecord) throw new Error(`Failed to create video record: ${JSON.stringify(insertError)}`);

      if (!s3Client) return json({ error: "R2 not configured" }, 500);

      const driveDownloadUrl = `https://www.googleapis.com/drive/v3/files/${file_id}?alt=media`;
      const driveRes = await fetch(driveDownloadUrl, {
        headers: { Authorization: `Bearer ${refreshed.access_token}` },
      });
      if (!driveRes.ok) throw new Error(`Drive download failed: ${driveRes.status}`);

      const contentType = driveRes.headers.get("Content-Type") || driveMimeType || "video/mp4";
      const key = `${user_id}/${videoRecord.id}${fileExt}`;
      const uploadUrl = await getSignedUrl(s3Client, new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ContentType: contentType,
      }), { expiresIn: 600 });

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: driveRes.body,
        // @ts-ignore
        duplex: "half",
      });
      if (!putRes.ok) throw new Error(`R2 PUT failed: ${putRes.status}`);

      const r2Url = `https://${R2_PUBLIC_URL}/${key}`;
      const { error: r2UpdateError } = await supabaseAdmin
        .from("videos")
        .update({ file_url: r2Url })
        .eq("id", videoRecord.id);

      if (r2UpdateError) throw new Error(`Failed to update video file_url: ${JSON.stringify(r2UpdateError)}`);

      return json({ video_id: videoRecord.id, r2_url: r2Url });
    }

    if (action === "get-r2-upload-url") {
      if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

      const { user_id, file_name, file_size, media_type, content_type } = body;
      if (!user_id || !file_name) return json({ error: "Missing required fields" }, 400);
      if (sessionUserId && user_id !== sessionUserId) return json({ error: "Unauthorized" }, 401);

      if (!s3Client) return json({ error: "R2 not configured" }, 500);

      const detectedType = media_type || "video";
      const fileExt = `.${file_name.split(".").pop() || "mp4"}`;
      const extLower = fileExt.toLowerCase();
      const contentType = content_type || (
        extLower === ".jpg" || extLower === ".jpeg" ? "image/jpeg" :
        extLower === ".png" ? "image/png" :
        extLower === ".gif" ? "image/gif" :
        extLower === ".webp" ? "image/webp" :
        "video/mp4"
      );

      const { data: videoRecord, error: insertError } = await supabaseAdmin
        .from("videos")
        .insert({
          user_id,
          title: file_name,
          file_url: null,
          media_type: detectedType,
          video_size: file_size ? parseInt(file_size, 10) : 0,
        })
        .select("id, title, file_url, uploaded_at")
        .single();

      if (insertError || !videoRecord) throw new Error(`Failed to create video record: ${JSON.stringify(insertError)}`);

      const key = `${user_id}/${videoRecord.id}${fileExt}`;
      const uploadUrl = await getSignedUrl(s3Client, new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ContentType: contentType,
      }), { expiresIn: 600 });
      const r2Url = `https://${R2_PUBLIC_URL}/${key}`;

      return json({ upload_url: uploadUrl, video_id: videoRecord.id, key, r2_url: r2Url });
    }

    if (action === "delete") {
      const accountIdParam = url.searchParams.get("account_id") || body?.account_id;
      const fileId = url.searchParams.get("file_id") || body?.file_id;
      if (!accountIdParam || !fileId) return json({ error: "Missing account_id or file_id" }, 400);

      let accountQuery = supabaseAdmin
        .from("connected_accounts")
        .select("*")
        .eq("id", accountIdParam)
        .eq("platform", "google_drive")
        .eq("is_connected", true);
      if (sessionUserId) accountQuery = accountQuery.eq("user_id", sessionUserId);
      const { data: account, error: fetchError } = await accountQuery.single();

      if (fetchError || !account) return json({ error: "Drive account not found" }, 404);

      const rawRefresh = await decrypt(account.refresh_token as string);
      if (!rawRefresh) return json({ error: "Missing refresh token" }, 400);

      const refreshed = await refreshAccessToken(rawRefresh);
      const delRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${refreshed.access_token}` } },
      );
      if (!delRes.ok) {
        const errJson = await delRes.json().catch(() => ({}));
        throw new Error(`Drive delete failed: ${JSON.stringify(errJson)}`);
      }
      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("google-drive-auth error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
