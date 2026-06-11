import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SB_URL = Deno.env.get("SB_URL");
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY");
const SB_ANON_KEY = Deno.env.get("SB_ANON_KEY");
const TIKTOK_CLIENT_KEY = Deno.env.get("TIKTOK_CLIENT_KEY");

if (!SB_URL || !SB_SERVICE_ROLE_KEY) {
  console.error("Missing SB_URL or SB_SERVICE_ROLE_KEY for tiktok-upload");
}

const supabase = createClient(SB_URL!, SB_SERVICE_ROLE_KEY!, {
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
  "pub-1d4bcccec36046308147315db8637398.r2.dev",
  "drive.google.com",
  "www.googleapis.com",
];

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

async function refreshTikTokToken(openId: string): Promise<string> {
  const url = `${SB_URL}/functions/v1/tiktok-auth?action=refresh&open_id=${encodeURIComponent(openId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
      apikey: SB_SERVICE_ROLE_KEY!,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }
  return openId;
}

type GetUploadUrlResponse = {
  uploadUrl: string;
  publicUrl: string;
};

async function uploadDriveMediaToR2(
  driveUrl: string,
  googleToken: string,
  mediaId: string,
  title: string,
): Promise<string> {
  const ext = ".mp4";
  const contentType = "video/mp4";
  const baseName = (title || mediaId).replace(/\.(mp4|mov|jpg|jpeg|png)$/i, "");
  const { data: uploadData, error } = await supabase.functions.invoke<
    GetUploadUrlResponse
  >(
    "get-upload-url",
    {
      body: {
        fileName: `${baseName}${ext}`,
        fileType: contentType,
        userId: "00000000-0000-0000-0000-000000000000",
      },
    },
  );

  if (error || !uploadData?.uploadUrl || !uploadData?.publicUrl) {
    throw new Error(error?.message || "Failed to get R2 upload URL");
  }

  if (!validateUrl(driveUrl)) {
    throw new Error(`Blocked fetch to disallowed URL: ${driveUrl}`);
  }

  const driveRes = await fetch(driveUrl, {
    headers: { Authorization: `Bearer ${googleToken}` },
  });
  if (!driveRes.ok || !driveRes.body) {
    throw new Error(`Drive fetch failed: ${driveRes.status}`);
  }

  const putRes = await fetch(uploadData.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: driveRes.body,
    // @ts-ignore - duplex needed for streaming
    duplex: "half",
  });

  if (!putRes.ok) {
    throw new Error(`R2 upload failed: ${putRes.status}`);
  }

  return uploadData.publicUrl;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const validKeys = [SB_SERVICE_ROLE_KEY, SB_ANON_KEY];

  if (!token || !validKeys.includes(token)) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let postId: string;
  let driveDownloadUrl: string | undefined;
  let googleAccessToken: string | undefined;

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
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  try {
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, account_id, caption, video_id, metadata, platform")
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

    const { data: account, error: accountError } = await supabase
      .from("connected_accounts")
      .select("id, access_token, token_expiry, is_connected")
      .eq("user_id", "00000000-0000-0000-0000-000000000000")
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

    let accessToken = account.access_token;

    const tokenExpiry = account.token_expiry ? new Date(account.token_expiry) : null;
    if (!tokenExpiry || tokenExpiry <= new Date()) {
      console.log("TikTok token expired, refreshing");
      await refreshTikTokToken(post.account_id);
      const { data: refreshed } = await supabase
        .from("connected_accounts")
        .select("access_token, token_expiry")
        .eq("user_id", "00000000-0000-0000-0000-000000000000")
        .eq("platform", "tiktok")
        .eq("account_id", post.account_id)
        .single();
      if (refreshed?.access_token) {
        accessToken = refreshed.access_token;
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

    if (
      (driveDownloadUrl || fileUrl.includes("googleapis.com")) &&
      googleAccessToken
    ) {
      const driveSource = driveDownloadUrl || fileUrl;
      console.log("Uploading Drive video to R2 first...");

      fileUrl = await uploadDriveMediaToR2(
        driveSource,
        googleAccessToken,
        post.video_id,
        post.video_id,
      );

      await supabase
        .from("videos")
        .update({ file_url: fileUrl })
        .eq("id", post.video_id);

      console.log("R2 upload complete, URL:", fileUrl);
    }

    if (!video.video_size) {
      const headRes = await fetch(fileUrl, { method: "HEAD" });
      const size = parseInt(headRes.headers.get("content-length") || "0", 10);
      if (size > 0) {
        video.video_size = size;
        await supabase
          .from("videos")
          .update({ video_size: size })
          .eq("id", post.video_id);
      }
    }

    const caption = (post.caption ?? "").slice(0, 2200);

    const sourceInfo: Record<string, unknown> = {
      source: "FILE_UPLOAD",
    };
    if (typeof video.video_size === "number" && video.video_size > 0) {
      sourceInfo.video_size = video.video_size;
    }

    const body_payload = {
      post_info: {
        title: caption,
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: sourceInfo,
      post_mode: "DIRECT_POST",
    };

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
      // Update sheet status to "failed"
      try {
        await fetch(`${SB_URL}/functions/v1/update-sheet-status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
            apikey: SB_SERVICE_ROLE_KEY!,
          },
          body: JSON.stringify({ postId, status: "failed" }),
        });
      } catch (sheetErr) {
        console.error("Failed to update sheet status", sheetErr);
      }
      return json({ error: `TikTok publish init failed: ${errMsg}` }, initRes.status);
    }

    if (initData?.error?.code && initData.error.code !== "ok") {
      const errMsg = JSON.stringify(initData.error);
      await supabase
        .from("posts")
        .update({ status: "failed" })
        .eq("id", postId);
      try {
        await fetch(`${SB_URL}/functions/v1/update-sheet-status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
            apikey: SB_SERVICE_ROLE_KEY!,
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
        await fetch(`${SB_URL}/functions/v1/update-sheet-status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
            apikey: SB_SERVICE_ROLE_KEY!,
          },
          body: JSON.stringify({ postId, status: "failed" }),
        });
      } catch (sheetErr) {
        console.error("Failed to update sheet status", sheetErr);
      }
      return json({ error: "TikTok did not return publish_id or upload_url" }, 500);
    }

    console.log("Downloading video from R2 for TikTok upload...");
    const videoRes = await fetch(fileUrl);
    if (!videoRes.ok || !videoRes.body) {
      throw new Error(`R2 fetch failed: ${videoRes.status}`);
    }

    const videoSize = (typeof video.video_size === "number" && video.video_size > 0)
      ? video.video_size
      : parseInt(videoRes.headers.get("content-length") || "0", 10);
    if (!videoSize) {
      throw new Error("Cannot determine video size for TikTok upload");
    }

    console.log(`Uploading video to TikTok (${videoSize} bytes)...`);
    const uploadController = new AbortController();
    const uploadTimeout = setTimeout(() => uploadController.abort(), 120000);

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
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
        await fetch(`${SB_URL}/functions/v1/update-sheet-status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
            apikey: SB_SERVICE_ROLE_KEY!,
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

    try {
      await fetch(`${SB_URL}/functions/v1/update-sheet-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
          apikey: SB_SERVICE_ROLE_KEY!,
        },
        body: JSON.stringify({ postId, status: "posted" }),
      });
    } catch (sheetErr) {
      console.error("Failed to update sheet status", sheetErr);
    }

    return json({ success: true, publish_id: publishId });
  } catch (err) {
    console.error("tiktok-upload error", err);
    try {
      if (typeof postId === "string") {
        await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
        // Update sheet status to "failed"
        await fetch(`${SB_URL}/functions/v1/update-sheet-status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
            apikey: SB_SERVICE_ROLE_KEY!,
          },
          body: JSON.stringify({ postId, status: "failed" }),
        });
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
