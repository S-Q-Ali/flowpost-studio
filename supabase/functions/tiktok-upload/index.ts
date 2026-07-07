import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { File } from "npm:megajs";
import { encrypt, decrypt } from "../_shared/crypto.ts";
import { updateSheetStatus } from "../_shared/sheet-status.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") || "pub-1d4bcccec36046308147315db8637398.r2.dev";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for tiktok-upload");
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ALLOWED_DOMAINS = [
  "open.tiktokapis.com",
  R2_PUBLIC_URL,
  "drive.google.com",
  "www.googleapis.com",
  "mega.nz",
  SUPABASE_URL ? new URL(SUPABASE_URL).hostname : "",
].filter(Boolean);

function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_DOMAINS.some(
      (domain) => parsed.hostname === domain || parsed.hostname.endsWith("." + domain),
    );
  } catch {
    return false;
  }
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

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const validKeys = [SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, Deno.env.get("FRONTEND_API_KEY")].filter(Boolean);

  if (!token || !validKeys.includes(token)) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let postId: string;
  let driveDownloadUrl: string | undefined;
  let googleAccessToken: string | undefined;
  let megaUrl: string | undefined;

  try {
    const body = await req.json();
    postId = body?.postId;
    if (!postId) return json({ error: "postId required" }, 400);
    driveDownloadUrl = typeof body?.driveDownloadUrl === "string"
      ? body.driveDownloadUrl
      : undefined;
    googleAccessToken = typeof body?.googleAccessToken === "string"
      ? body.googleAccessToken
      : undefined;
    megaUrl = typeof body?.megaUrl === "string"
      ? body.megaUrl
      : undefined;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  try {
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, account_id, caption, video_id, metadata, platform, user_id")
      .eq("id", postId)
      .single();

    if (postError || !post) {
      return json({ error: "Post not found" }, 404);
    }

    if (post.platform !== "tiktok") {
      return json({ error: "Post is not for TikTok" }, 400);
    }

    if (!post.account_id) {
      return json({ error: "Post has no account_id" }, 400);
    }

    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("id, file_url, media_type, video_size")
      .eq("id", post.video_id)
      .single();

    if (videoError || !video || !video.file_url) {
      return json({ error: "Video not found or missing file_url" }, 404);
    }

    const mediaType = video.media_type ?? "video";
    if (mediaType === "image") {
      await supabase
        .from("posts")
        .update({ status: "failed" })
        .eq("id", postId);
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
      return json({ error: "TikTok account not connected" }, 404);
    }

    if (!account.is_connected || !account.access_token) {
      await supabase
        .from("posts")
        .update({ status: "failed" })
        .eq("id", postId);
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
        await supabase
          .from("posts")
          .update({ status: "failed" })
          .eq("id", postId);
        return json({ error: "Token refresh did not return new access token" }, 500);
      }
    }

    let fileUrl = video.file_url as string;
    if (!fileUrl || !validateUrl(fileUrl)) {
      await supabase
        .from("posts")
        .update({ status: "failed" })
        .eq("id", postId);
      return json({ error: "Invalid video URL" }, 400);
    }

    const isDriveSource = (driveDownloadUrl || fileUrl.includes("googleapis.com")) && googleAccessToken;
    if (megaUrl) {
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
      await supabase
        .from("posts")
        .update({ status: "failed" })
        .eq("id", postId);
      await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "failed", googleAccessToken);
      return json({ error: `TikTok publish init failed: ${errMsg}` }, initRes.status);
    }

    if (initData?.error?.code && initData.error.code !== "ok") {
      const errMsg = JSON.stringify(initData.error);
      await supabase
        .from("posts")
        .update({ status: "failed" })
        .eq("id", postId);
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/update-sheet-status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY!,
          },
          body: JSON.stringify({ postId, status: "failed" }),
        });
      } catch (sheetErr) {
        console.error("Failed to update sheet status", sheetErr);
      }
      return json({ error: `TikTok publish init error: ${errMsg}` }, 400);
    }

    const publishId = initData?.data?.publish_id;
    const uploadUrl = initData?.data?.upload_url;
    if (!publishId || !uploadUrl) {
      await supabase
        .from("posts")
        .update({ status: "failed" })
        .eq("id", postId);
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/update-sheet-status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY!,
          },
          body: JSON.stringify({ postId, status: "failed" }),
        });
      } catch (sheetErr) {
        console.error("Failed to update sheet status", sheetErr);
      }
      return json({ error: "TikTok did not return publish_id or upload_url" }, 500);
    }

    console.log(`Streaming video to TikTok (${video.video_size} bytes)...`);
    let videoRes: Response;
    if (megaUrl) {
      const proxyToken = await encrypt(JSON.stringify({
        megaUrl,
        exp: Date.now() + 15 * 60 * 1000,
      }));
      const proxyUrl = `${SUPABASE_URL}/functions/v1/get-file?token=${encodeURIComponent(proxyToken)}`;
      videoRes = await fetch(proxyUrl);
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
      // @ts-ignore
      duplex: "half",
    });
    clearTimeout(uploadTimeout);

    console.log("TikTok upload status:", uploadRes.status);
    if (!uploadRes.ok) {
      const uploadErr = await uploadRes.text().catch(() => "unknown");
      await supabase
        .from("posts")
        .update({ status: "failed" })
        .eq("id", postId);
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/update-sheet-status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY!,
          },
          body: JSON.stringify({ postId, status: "failed" }),
        });
      } catch (sheetErr) {
        console.error("Failed to update sheet status", sheetErr);
      }
      return json({ error: `TikTok upload failed: ${uploadRes.status} ${uploadErr}` }, 502);
    }

    const { error: updateError } = await supabase
      .from("posts")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        metadata: {
          ...(post.metadata as any ?? {}),
          tiktok_publish_id: publishId,
        },
      })
      .eq("id", postId);

    if (updateError) {
      console.error("Failed to update post status", updateError);
      return json({ error: "Upload succeeded but status update failed" }, 500);
    }

    await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "posted", googleAccessToken);

    return json({ success: true, publish_id: publishId });
  } catch (err) {
    console.error("tiktok-upload error", err);
    try {
      if (typeof postId === "string") {
        await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
        await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "failed", googleAccessToken);
      }
    } catch {
      // ignore
    }
    return json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      500,
    );
  }
});



