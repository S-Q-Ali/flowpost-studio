import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SB_URL = Deno.env.get("SB_URL");
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY");

if (!SB_URL || !SB_SERVICE_ROLE_KEY) {
  console.error("Missing SB_URL or SB_SERVICE_ROLE_KEY for instagram-upload");
}

const supabase = createClient(SB_URL!, SB_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const ALLOWED_DOMAINS = [
  "www.googleapis.com",
  "drive.google.com",
  "pub-1d4bcccec36046308147315db8637398.r2.dev",
  "graph.facebook.com",
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type GetUploadUrlResponse = {
  uploadUrl: string;
  publicUrl: string;
};

async function uploadDriveVideoToR2(
  driveUrl: string,
  googleToken: string,
  videoId: string,
  title: string,
): Promise<string> {
  return uploadDriveMediaToR2(driveUrl, googleToken, videoId, title, false);
}

async function uploadDriveMediaToR2(
  driveUrl: string,
  googleToken: string,
  mediaId: string,
  title: string,
  isImage: boolean,
): Promise<string> {
  const ext = isImage ? ".jpg" : ".mp4";
  const contentType = isImage ? "image/jpeg" : "video/mp4";
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
  const validKeys = [SB_SERVICE_ROLE_KEY];

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
      .select("id, video_id, account_id, caption, status, platform, videos(*)")
      .eq("id", postId)
      .single();

    if (postError || !post) {
      return json({ error: "Post not found" }, 404);
    }

    if (post.platform !== "instagram") {
      return json({ error: "Post is not for Instagram" }, 400);
    }

    if (!post.account_id) {
      return json({ error: "Post has no account_id" }, 400);
    }

    const video = post.videos;
    if (!video || !video.file_url) {
      return json({ error: "Video not found or missing file_url" }, 404);
    }

    const mediaType = video.media_type ?? "video";
    const isImage = mediaType === "image";

    const { data: account, error: accountError } = await supabase
      .from("connected_accounts")
      .select("*")
      .eq("platform", "instagram")
      .eq("account_id", post.account_id)
      .eq("is_connected", true)
      .single();

    if (accountError || !account?.access_token) {
      return json({ error: "Connected Instagram account not found" }, 404);
    }

    const accessToken = account.access_token as string;
    const igUserId = account.account_id as string;

    let mediaUrl = video.file_url as string;

    if (
      (driveDownloadUrl || mediaUrl.includes("googleapis.com")) &&
      googleAccessToken
    ) {
      const driveSource = driveDownloadUrl || mediaUrl;
      console.log(`Uploading Drive ${isImage ? "image" : "video"} to R2 first...`);

      mediaUrl = await uploadDriveMediaToR2(
        driveSource,
        googleAccessToken,
        post.video_id as string,
        (video.title as string) || (post.video_id as string),
        isImage,
      );

      await supabase
        .from("videos")
        .update({ file_url: mediaUrl })
        .eq("id", post.video_id);

      console.log("R2 upload complete, URL:", mediaUrl);
    }

    console.log(`Creating Instagram ${isImage ? "image" : "reel"} container for user:`, igUserId);
    console.log("Using media URL:", mediaUrl);
    console.log("Caption:", post.caption);

    // Step 3a - Create media container using URLSearchParams (Meta API expects form-encoded data)
    const containerForm = new URLSearchParams();
    containerForm.append("media_type", isImage ? "IMAGE" : "REELS");
    if (isImage) {
      containerForm.append("image_url", mediaUrl);
    } else {
      containerForm.append("video_url", mediaUrl);
    }
    // Instagram caption limit is 2,200 characters
    const caption = (post.caption || "").substring(0, 2200);
    containerForm.append("caption", caption);
    containerForm.append("access_token", accessToken);

    const containerRes = await fetch(
      `https://graph.facebook.com/v25.0/${igUserId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: containerForm.toString(),
      },
    );
    const containerResText = await containerRes.text();
    console.log("Container response status:", containerRes.status);
    console.log("Container response body:", containerResText);

    const container = JSON.parse(containerResText);

    if (!container.id) {
      console.error("Container creation failed:", container);
      await supabase
        .from("posts")
        .update({ status: "failed" })
        .eq("id", postId);
      return json({ error: `Container failed: ${containerResText}` }, 502);
    }

    console.log("Container created:", container.id);

    await new Promise((r) => setTimeout(r, 45000));

    let publishResult: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        console.log(`Publish attempt ${attempt + 1}...`);
        await new Promise((r) => setTimeout(r, 20000));
      }

      const publishForm = new URLSearchParams();
      publishForm.append("creation_id", container.id);
      publishForm.append("access_token", accessToken);

      const publishRes = await fetch(
        `https://graph.facebook.com/v25.0/${igUserId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: publishForm.toString(),
        },
      );
      publishResult = await publishRes.json() as Record<string, unknown>;

      if (publishResult?.id) {
        console.log("Publish succeeded:", JSON.stringify(publishResult));
        break;
      }
      console.log(`Publish attempt ${attempt + 1} failed:`, JSON.stringify(publishResult));
    }

    if (!publishResult?.id) {
      console.error("Publish failed after 3 attempts");
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json({ error: `Publish failed after 3 attempts: ${JSON.stringify(publishResult)}` }, 502);
    }

    await supabase
      .from("posts")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", postId);

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

    return json({ success: true, instagram_post_id: publishResult.id as string, container_id: container.id });
  } catch (err) {
    console.error("instagram-upload error", err);
    try {
      if (typeof postId === "string") {
        await supabase
          .from("posts")
          .update({ status: "failed" })
          .eq("id", postId);
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

