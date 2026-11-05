import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { File } from "npm:megajs";
import { decrypt } from "../_shared/crypto.ts";
import { fileProxyUrl } from "../_shared/get-file-token.ts";
import { updateSheetStatus } from "../_shared/sheet-status.ts";
import { createRequestAuthorizer, createSessionLookup } from "../_shared/auth.ts";
import { checkPostAccess, claimPost, settlePost, type HeldClaim } from "../_shared/post-access.ts";
import { isAllowedDriveUrl, isAllowedMediaUrl, isGoogleApiUrl } from "../_shared/url-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for tiktok-upload");
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const authorize = createRequestAuthorizer({
  serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  cronApiKey: null,
  anonKey: SUPABASE_ANON_KEY,
  sessionLookup: createSessionLookup(supabase),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function refreshTikTokToken(openId: string, userId: string): Promise<string> {
  const url = `${SUPABASE_URL}/functions/v1/tiktok-auth?action=refresh&open_id=${encodeURIComponent(openId)}&userId=${encodeURIComponent(userId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }
  return openId;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const auth = await authorize(req);
  if (!auth.allowed) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let postId: string;
  let driveDownloadUrl: string | undefined;
  let googleAccessToken: string | undefined;
  let megaUrl: string | undefined;
  let megaFileName: string | undefined;
  let megaAccountId: string | undefined;
  let held: HeldClaim | null = null;

  try {
    const body = await req.json();
    postId = body?.postId;
    if (!postId) return json({ error: "postId required" }, 400);
    driveDownloadUrl = typeof body?.driveDownloadUrl === "string"
      ? body.driveDownloadUrl
      : undefined;
    // The bearer below goes to this URL, so it may only leave for Google.
    if (driveDownloadUrl && !isAllowedDriveUrl(driveDownloadUrl)) {
      return json({ error: "Unsupported download URL" }, 400);
    }
    googleAccessToken = typeof body?.googleAccessToken === "string"
      ? body.googleAccessToken
      : undefined;
    megaUrl = typeof body?.megaUrl === "string"
      ? body.megaUrl
      : undefined;
    megaFileName = typeof body?.megaFileName === "string"
      ? body.megaFileName
      : undefined;
    megaAccountId = typeof body?.megaAccountId === "string"
      ? body.megaAccountId
      : undefined;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  try {
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, account_id, caption, video_id, metadata, platform, user_id, status")
      .eq("id", postId)
      .single();

    if (postError || !post) {
      return json({ error: "Post not found" }, 404);
    }

    const access = checkPostAccess(auth, post);
    if (!access.ok) return json({ error: access.error }, access.status);

    if (post.platform !== "tiktok") {
      return json({ error: "Post is not for TikTok" }, 400);
    }

    if (!post.account_id) {
      return json({ error: "Post has no account_id" }, 400);
    }

    const claim = await claimPost(supabase, post.id);
    if (!claim.ok) return json({ error: claim.error }, claim.status);
    held = claim;
    // Every status write below carries this claim: an attempt cut off by the
    // scheduler's half-hour cut-off must not overwrite the retry's answer, and a
    // failure releases the claim so a retry can start immediately.
    const fail = () => settlePost(supabase, claim, { status: "failed", claimed_at: null });

    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("id, file_url, media_type, video_size")
      .eq("id", post.video_id)
      .single();

    if (videoError || !video || !video.file_url) {
      await fail();
      return json({ error: "Video not found or missing file_url" }, 404);
    }

    const mediaType = video.media_type ?? "video";
    if (mediaType === "image") {
      await fail();
      return json({ error: "TikTok does not support image uploads" }, 400);
    }

    const userId = post.user_id ?? "00000000-0000-0000-0000-000000000000";

    const { data: account, error: accountError } = await supabase
      .from("connected_accounts")
      .select("id, access_token, token_expiry, is_connected")
      .eq("user_id", userId)
      .eq("platform", "tiktok")
      .eq("account_id", post.account_id)
      .maybeSingle();

    if (accountError || !account) {
      await fail();
      return json({ error: "TikTok account not connected" }, 404);
    }

    if (!account.is_connected || !account.access_token) {
      await fail();
      return json({ error: "TikTok account is disconnected" }, 400);
    }

    let accessToken = await decrypt(account.access_token);

    const tokenExpiry = account.token_expiry ? new Date(account.token_expiry) : null;
    if (!tokenExpiry || tokenExpiry <= new Date()) {
      console.log("TikTok token expired, refreshing");
      await refreshTikTokToken(post.account_id, userId);
      const { data: refreshed } = await supabase
        .from("connected_accounts")
        .select("access_token, token_expiry")
        .eq("user_id", userId)
        .eq("platform", "tiktok")
        .eq("account_id", post.account_id)
        .single();
      if (refreshed?.access_token) {
        accessToken = await decrypt(refreshed.access_token);
      } else {
        await fail();
        return json({ error: "Token refresh did not return new access token" }, 500);
      }
    }

    const fileUrl = video.file_url as string;
    if (!fileUrl || !isAllowedMediaUrl(fileUrl)) {
      await fail();
      return json({ error: "Invalid video URL" }, 400);
    }

    const isDriveSource = (driveDownloadUrl || isGoogleApiUrl(fileUrl)) && googleAccessToken;
    if (megaFileName && megaAccountId) {
      console.log("Getting video size from Mega account...");
      const proxyUrl = await fileProxyUrl({ megaFileName, megaAccountId }, post.user_id);
      const headRes = await fetch(proxyUrl, { method: "HEAD" });
      const videoSize = parseInt(headRes.headers.get("content-length") || "0", 10);
      if (!videoSize) throw new Error("Could not determine video size from Mega account");
      video.video_size = videoSize;
    } else if (megaUrl) {
      console.log("Getting video size from Mega...");
      const megaFile = File.fromURL(megaUrl);
      await megaFile.loadAttributes();
      video.video_size = megaFile.size;
      if (!video.video_size) throw new Error("Could not determine video size from Mega");
    } else if (isDriveSource) {
      const driveSource = driveDownloadUrl || fileUrl;
      console.log("Getting video size from Drive...");
      const headRes = await fetch(driveSource, {
        method: "HEAD",
        headers: { Authorization: `Bearer ${googleAccessToken}` },
      });
      const videoSize = parseInt(headRes.headers.get("content-length") || "0", 10);
      if (!videoSize) throw new Error("Could not determine video size from Drive");
      video.video_size = videoSize;
    } else {
      console.log("Getting video size from URL...");
      const headRes = await fetch(fileUrl, { method: "HEAD" });
      const videoSize = parseInt(headRes.headers.get("content-length") || "0", 10);
      if (!videoSize) throw new Error("Could not determine video size");
      video.video_size = videoSize;
    }

    await supabase
      .from("videos")
      .update({ video_size: video.video_size })
      .eq("id", post.video_id);

    const caption = (post.caption ?? "").slice(0, 2200);

    const body_payload = {
      post_info: {
        title: caption,
        privacy_level: "SELF_ONLY",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: video.video_size,
        chunk_size: video.video_size,
        total_chunk_count: 1,
      },
    };

    console.log("Init payload:", JSON.stringify(body_payload));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let initRes: Response;
    try {
      initRes = await fetch(
        "https://open.tiktokapis.com/v2/post/publish/video/init/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
          body: JSON.stringify(body_payload),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeout);
    }

    const initData = await initRes.json().catch(() => ({}));
    console.log("TikTok init response:", initRes.status, JSON.stringify(initData));

    if (!initRes.ok) {
      const errMsg = JSON.stringify(initData);
      await fail();
      await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "failed", googleAccessToken);
      return json({ error: `TikTok publish init failed: ${errMsg}` }, initRes.status);
    }

    if (initData?.error?.code && initData.error.code !== "ok") {
      const errMsg = JSON.stringify(initData.error);
      await fail();
      try {
        await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "failed", googleAccessToken);
      } catch (sheetErr) {
        console.error("Failed to update sheet status", sheetErr);
      }
      return json({ error: `TikTok publish init error: ${errMsg}` }, 400);
    }

    const publishId = initData?.data?.publish_id;
    const uploadUrl = initData?.data?.upload_url;
    if (!publishId || !uploadUrl) {
      await fail();
      try {
        await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "failed", googleAccessToken);
      } catch (sheetErr) {
        console.error("Failed to update sheet status", sheetErr);
      }
      return json({ error: "TikTok did not return publish_id or upload_url" }, 500);
    }

    console.log(`Streaming video to TikTok (${video.video_size} bytes)...`);
    let videoRes: Response;
    if (megaFileName && megaAccountId) {
      videoRes = await fetch(await fileProxyUrl({ megaFileName, megaAccountId }, post.user_id));
    } else if (megaUrl) {
      videoRes = await fetch(await fileProxyUrl({ megaUrl }, post.user_id));
    } else if (isDriveSource) {
      const driveSource = driveDownloadUrl || fileUrl;
      videoRes = await fetch(driveSource, {
        headers: { Authorization: `Bearer ${googleAccessToken}` },
      });
    } else {
      videoRes = await fetch(fileUrl);
    }
    if (!videoRes.ok || !videoRes.body) {
      throw new Error(`Video fetch failed: ${videoRes.status}`);
    }

    const uploadController = new AbortController();
    const uploadTimeout = setTimeout(() => uploadController.abort(), 120000);

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes 0-${video.video_size - 1}/${video.video_size}`,
      },
      body: videoRes.body,
      signal: uploadController.signal,
      // @ts-expect-error duplex required for streaming request body
      duplex: "half",
    });
    clearTimeout(uploadTimeout);

    console.log("TikTok upload status:", uploadRes.status);
    if (!uploadRes.ok) {
      const uploadErr = await uploadRes.text().catch(() => "unknown");
      await fail();
      try {
        await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "failed", googleAccessToken);
      } catch (sheetErr) {
        console.error("Failed to update sheet status", sheetErr);
      }
      return json({ error: `TikTok upload failed: ${uploadRes.status} ${uploadErr}` }, 502);
    }

    const settled = await settlePost(supabase, claim, {
      status: "published",
      published_at: new Date().toISOString(),
      claimed_at: null,
      metadata: {
        ...(post.metadata as any ?? {}),
        tiktok_publish_id: publishId,
      },
    });

    if (!settled) {
      console.error(`tiktok-upload: post ${postId} was re-claimed elsewhere`);
      return json({ error: "Upload succeeded but the post was taken over" }, 409);
    }

    await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "posted", googleAccessToken);

    return json({ success: true, publish_id: publishId });
  } catch (err) {
    console.error("tiktok-upload error", err);
    try {
      // An error before the claim leaves the row live for the next attempt.
      if (held) {
        await settlePost(supabase, held, { status: "failed", claimed_at: null });
        await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "failed", googleAccessToken);
      }
    } catch (cleanupErr) {
      console.error("tiktok-upload: failed to mark post failed", cleanupErr);
    }
    return json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      500,
    );
  }
});



