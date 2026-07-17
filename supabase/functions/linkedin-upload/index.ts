import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { encrypt, decrypt } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for linkedin-upload");
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const validKeys = [SUPABASE_SERVICE_ROLE_KEY, Deno.env.get("FRONTEND_API_KEY")].filter(Boolean);

  if (!token || !validKeys.includes(token)) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let postId: string;
  let mediaUrl: string | undefined;

  try {
    const body = await req.json();
    postId = body?.postId;
    if (!postId) return json({ error: "postId required" }, 400);
    mediaUrl = typeof body?.driveDownloadUrl === "string"
      ? body.driveDownloadUrl
      : typeof body?.mediaUrl === "string"
      ? body.mediaUrl
      : undefined;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  try {
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, video_id, account_id, caption, status, platform, user_id")
      .eq("id", postId)
      .single();

    if (postError || !post) {
      return json({ error: "Post not found" }, 404);
    }

    if (post.platform !== "linkedin") {
      return json({ error: "Post is not for LinkedIn" }, 400);
    }

    if (!post.account_id) {
      return json({ error: "Post has no account_id" }, 400);
    }

    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("id, title, file_url, media_type")
      .eq("id", post.video_id)
      .single();

    if (videoError || !video?.file_url) {
      return json({ error: "Video not found or missing file_url" }, 404);
    }

    const isImage = (video as any).media_type === "image";

    const { data: account, error: accountError } = await supabase
      .from("connected_accounts")
      .select("account_id, access_token, metadata")
      .eq("platform", "linkedin")
      .eq("account_id", post.account_id)
      .eq("is_connected", true)
      .single();

    if (accountError || !account?.access_token) {
      return json({ error: "Connected LinkedIn account not found" }, 404);
    }

    const accessToken = await decrypt(account.access_token);
    const personId = account.account_id;
    const uploadUrl = mediaUrl || video.file_url;

    // Step 1: Register the upload with LinkedIn (different endpoint for images vs video)
    const registerEndpoint = isImage
      ? "https://api.linkedin.com/rest/images?action=initializeUpload"
      : "https://api.linkedin.com/rest/videos?action=initializeUpload";
    const registerRes = await fetch(
      registerEndpoint,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": "202412",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          initializeUploadRequest: {
            owner: `urn:li:person:${personId}`,
          },
        }),
      },
    );

    const registerData = await registerRes.json();
    if (!registerRes.ok) {
      console.error("LinkedIn upload registration failed", registerRes.status, registerData);
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json({ error: `LinkedIn upload registration failed: ${JSON.stringify(registerData)}` }, 502);
    }

    const uploadUrlLinkedIn = registerData.value?.uploadInstructions?.[0]?.uploadUrl;
    const mediaUrn = isImage ? registerData.value?.image : registerData.value?.video;
    if (!uploadUrlLinkedIn || !mediaUrn) {
      console.error("LinkedIn upload registration missing upload URL or media URN", registerData);
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json({ error: "LinkedIn upload registration missing upload URL" }, 502);
    }

    // Step 2: Upload the binary to the provided URL
    const videoRes = await fetch(uploadUrl);
    if (!videoRes.ok) {
      console.error("Failed to fetch source video for LinkedIn upload", uploadUrl, videoRes.status);
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json({ error: "Failed to fetch source video" }, 502);
    }

    const videoBlob = await videoRes.blob();

    const uploadRes = await fetch(uploadUrlLinkedIn, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: videoBlob,
    });

    if (!uploadRes.ok) {
      const uploadText = await uploadRes.text();
      console.error("LinkedIn video binary upload failed", uploadRes.status, uploadText);
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json({ error: `LinkedIn video binary upload failed: ${uploadRes.status}` }, 502);
    }

    // Step 3: Create the post
    const createPostRes = await fetch(
      "https://api.linkedin.com/rest/posts",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": "202412",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          author: `urn:li:person:${personId}`,
          commentary: post.caption || "",
          visibility: "PUBLIC",
          distribution: {
            feedDistribution: "MAIN_FEED",
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          content: {
            media: {
              id: mediaUrn,
            },
          },
          lifecycleState: "PUBLISHED",
        }),
      },
    );

    const createPostData = await createPostRes.json();
    if (!createPostRes.ok) {
      console.error("LinkedIn post creation failed", createPostRes.status, createPostData);
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json({ error: `LinkedIn post creation failed: ${JSON.stringify(createPostData)}` }, 502);
    }

    const { error: updateError } = await supabase
      .from("posts")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", postId);

    if (updateError) {
      console.error("Failed to update post status", updateError);
      return json({ error: "Upload succeeded but status update failed" }, 500);
    }

    return json({ success: true, postId, linkedin_post_id: createPostData.id });
  } catch (err) {
    console.error("linkedin-upload error", err);
    try {
      if (typeof postId === "string") {
        await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      }
    } catch { /* ignore */ }
    return json({ error: err instanceof Error ? err.message : "Upload failed" }, 500);
  }
});
