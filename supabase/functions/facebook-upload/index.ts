import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SB_URL = Deno.env.get("SB_URL");
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY");

if (!SB_URL || !SB_SERVICE_ROLE_KEY) {
  console.error("Missing SB_URL or SB_SERVICE_ROLE_KEY for facebook-upload");
}

const supabase = createClient(SB_URL!, SB_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

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
      .select(
        "id, video_id, account_id, caption, status, platform",
      )
      .eq("id", postId)
      .single();

    if (postError || !post) {
      return json({ error: "Post not found" }, 404);
    }

    if (post.platform !== "facebook") {
      return json({ error: "Post is not for Facebook" }, 400);
    }

    if (!post.account_id) {
      return json({ error: "Post has no account_id" }, 400);
    }

    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("id, title, file_url")
      .eq("id", post.video_id)
      .single();

    if (videoError || !video?.file_url) {
      return json({ error: "Video not found or missing file_url" }, 404);
    }

    const { data: account, error: accountError } = await supabase
      .from("connected_accounts")
      .select("account_id, access_token")
      .eq("platform", "facebook")
      .eq("account_id", post.account_id)
      .eq("is_connected", true)
      .single();

    if (accountError || !account?.access_token) {
      return json({ error: "Connected Facebook Page not found" }, 404);
    }

    const pageId = account.account_id;
    const accessToken = account.access_token;

    // Support either:
    // - Traditional flow: video.file_url points to R2/public storage
    // - Workflow flow: direct Google Drive download URL + access token
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
        post.video_id,
        video.title || post.video_id,
      );

      await supabase
        .from("videos")
        .update({ file_url: videoUrl })
        .eq("id", post.video_id);

      console.log("R2 upload complete, URL:", videoUrl);
    }

    // Use file_url approach - Facebook fetches directly from R2 URL
    const postRes = await fetch(
      `https://graph-video.facebook.com/v18.0/${encodeURIComponent(pageId)}/videos`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          file_url: videoUrl,
          description: (post.caption || "").toString(),
          access_token: accessToken,
          published: "true",
        }).toString(),
      },
    );

    const postData = await postRes.json();
    if (!postRes.ok || !postData?.id) {
      console.error("Facebook file_url upload failed", postRes.status, postData);
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
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
      return json({ error: `Facebook upload failed: ${JSON.stringify(postData)}` }, 502);
    }

    const { error: updateError } = await supabase
      .from("posts")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", postId);

    if (updateError) {
      console.error("Failed to update post status", updateError);
      return json(
        { error: "Upload succeeded but status update failed" },
        500,
      );
    }

    // Update Google Sheet status to "posted"
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

    return json({ success: true, postId, facebook_video_id: postData.id });
  } catch (err) {
    console.error("facebook-upload error", err);
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

