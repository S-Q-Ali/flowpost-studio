import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SB_URL = Deno.env.get("SB_URL");
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY");
const SB_ANON_KEY = Deno.env.get("SB_ANON_KEY");

if (!SB_URL || !SB_SERVICE_ROLE_KEY || !SB_ANON_KEY) {
  console.error("Missing SB_URL, SB_SERVICE_ROLE_KEY, or SB_ANON_KEY for instagram-upload");
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
  const baseName = (title || videoId).replace(/\.mp4$/i, "");
  const { data: uploadData, error } = await supabase.functions.invoke<
    GetUploadUrlResponse
  >(
    "get-upload-url",
    {
      body: {
        fileName: `${baseName}.mp4`,
        fileType: "video/mp4",
        userId: "00000000-0000-0000-0000-000000000000",
      },
    },
  );

  if (error || !uploadData?.uploadUrl || !uploadData?.publicUrl) {
    throw new Error(error?.message || "Failed to get R2 upload URL");
  }

  const driveRes = await fetch(driveUrl, {
    headers: { Authorization: `Bearer ${googleToken}` },
  });
  if (!driveRes.ok || !driveRes.body) {
    throw new Error(`Drive fetch failed: ${driveRes.status}`);
  }

  const putRes = await fetch(uploadData.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4" },
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
  const validKeys = [SB_ANON_KEY, SB_SERVICE_ROLE_KEY];

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

    let videoUrl = video.file_url as string;

    if (
      (driveDownloadUrl || videoUrl.includes("googleapis.com")) &&
      googleAccessToken
    ) {
      const driveSource = driveDownloadUrl || videoUrl;
      console.log("Uploading Drive video to R2 first...");

      videoUrl = await uploadDriveVideoToR2(
        driveSource,
        googleAccessToken,
        post.video_id as string,
        (video.title as string) || (post.video_id as string),
      );

      await supabase
        .from("videos")
        .update({ file_url: videoUrl })
        .eq("id", post.video_id);

      console.log("R2 upload complete, URL:", videoUrl);
    }

    console.log("Creating Instagram container for user:", igUserId);
    console.log("Using video URL:", videoUrl);
    console.log("Caption:", post.caption);

    // Step 3a - Create media container using URLSearchParams (Meta API expects form-encoded data)
    const containerForm = new URLSearchParams();
    containerForm.append("media_type", "REELS");
    containerForm.append("video_url", videoUrl);
    containerForm.append("caption", post.caption || "");
    containerForm.append("access_token", accessToken);

    const containerRes = await fetch(
      `https://graph.facebook.com/v18.0/${igUserId}/media`,
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

    await supabase
      .from("posts")
      .update({
        status: "processing",
        metadata: {
          instagram_container_id: container.id,
          r2_url: videoUrl,
        },
      })
      .eq("id", postId);

    console.log("Metadata saved, returning success");

    return json({ success: true, container_id: container.id });
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

