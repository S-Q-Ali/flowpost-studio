import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { decrypt } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY for post-story function");
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type SupportedPlatform = "facebook" | "instagram";

interface PostStoryPayload {
  platform: SupportedPlatform;
  accountId?: string;
  videoUrl?: string;
  accessToken?: string;
  mediaType?: "video" | "image";
  postId?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const validKeys = [SUPABASE_SERVICE_ROLE_KEY];

  if (!token || !validKeys.includes(token)) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let platform: SupportedPlatform;
  let accountId: string;
  let videoUrl: string;
  let accessToken: string;
  let mediaTypeInput: "video" | "image" | undefined;
  let postId: string | undefined;

  try {
    const body = (await req.json()) as Partial<PostStoryPayload>;

    if (!body.platform) {
      return json({ error: "platform is required" }, 400);
    }
    if (body.platform !== "facebook" && body.platform !== "instagram") {
      return json({ error: "Invalid platform" }, 400);
    }
    platform = body.platform;
    postId = body.postId;
    mediaTypeInput = body.mediaType;

    // Retry path: only postId is provided, look up data from DB
    if (postId && (!body.videoUrl || !body.accessToken || !body.accountId)) {
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

      const { data: storyPost } = await supabase
        .from("posts")
        .select("video_id, account_id")
        .eq("id", postId)
        .single();

      if (!storyPost) {
        return json({ error: "Post not found" }, 404);
      }

      const { data: video } = await supabase
        .from("videos")
        .select("file_url, media_type")
        .eq("id", storyPost.video_id)
        .single();

      if (!video?.file_url) {
        return json({ error: "Video URL not found" }, 404);
      }

      const { data: acc } = await supabase
        .from("connected_accounts")
        .select("access_token")
        .eq("account_id", storyPost.account_id)
        .eq("platform", platform)
        .single();

      if (!acc?.access_token) {
        return json({ error: "Access token not found" }, 404);
      }

      accountId = storyPost.account_id;
      videoUrl = video.file_url;
      accessToken = await decrypt(acc.access_token);
      if (!mediaTypeInput) mediaTypeInput = video.media_type;
    } else if (!body.videoUrl || !body.accessToken || !body.accountId) {
      // First attempt from process-workflow — raw fields required
      return json(
        { error: "postId with videoUrl, accessToken and accountId are required, or provide all raw fields" },
        400,
      );
    } else {
      // First attempt: use provided raw fields
      accountId = body.accountId;
      videoUrl = body.videoUrl;
      accessToken = body.accessToken;
    }
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // Initialize supabase for status writes if postId is provided
  const supabase = postId
    ? createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    : null;

  let resultStatus = 200;
  let resultBody: Record<string, unknown> = {};

  try {
    if (platform === "facebook") {
      const startRes = await fetch(
        `https://graph.facebook.com/v18.0/${accountId}/video_stories`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            upload_phase: "start",
            access_token: accessToken,
          }),
        },
      );

      const startData = await startRes.json() as {
        video_id?: string;
        upload_url?: string;
      };
      if (!startRes.ok || !startData?.video_id || !startData?.upload_url) {
        console.error("Facebook story start failed", startRes.status, startData);
        throw new Error(JSON.stringify(startData));
      }

      const { video_id, upload_url } = startData;

      const videoRes = await fetch(videoUrl);
      if (!videoRes.ok || !videoRes.body) {
        throw new Error(`Failed to fetch video: ${videoRes.status}`);
      }

      const fileSize = videoRes.headers.get("content-length") || "0";

      const uploadRes = await fetch(upload_url, {
        method: "POST",
        headers: {
          Authorization: `OAuth ${accessToken}`,
          offset: "0",
          file_size: fileSize,
        },
        body: videoRes.body,
        // @ts-expect-error duplex required for streaming request body
        duplex: "half",
      });

      if (!uploadRes.ok) {
        let errBody: unknown;
        try {
          errBody = await uploadRes.json();
        } catch {
          errBody = await uploadRes.text();
        }
        throw new Error(JSON.stringify(errBody));
      }

      const finishRes = await fetch(
        `https://graph.facebook.com/v18.0/${accountId}/video_stories`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            upload_phase: "finish",
            video_id,
            access_token: accessToken,
            published: true,
          }),
        },
      );

      const finishData = await finishRes.json();
      if (!finishRes.ok || !finishData?.success) {
        console.error(
          "Facebook story finish failed",
          finishRes.status,
          finishData,
        );
        throw new Error(JSON.stringify(finishData));
      }

      resultBody = { success: true, video_id };
    } else {
      // Instagram story flow
      console.log("Instagram account ID:", accountId);
      console.log("Token prefix:", accessToken.substring(0, 20));
      console.log("Instagram story using URL:", videoUrl);

      // Determine API base URL based on token type
      let igBaseUrl = "https://graph.facebook.com/v25.0";
      try {
        const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
        const { data: igAccount } = await supabase
          .from("connected_accounts")
          .select("metadata")
          .eq("account_id", accountId)
          .eq("platform", "instagram")
          .single();
        if ((igAccount as any)?.metadata?.instagram_login) {
          igBaseUrl = "https://graph.instagram.com/v21.0";
        }
      } catch { /* fallback to Facebook graph */ }

      const isImageStory = mediaTypeInput === "image";
      const storyBody: Record<string, unknown> = {
        media_type: "STORIES",
        access_token: accessToken,
      };
      if (isImageStory) {
        storyBody.image_url = videoUrl;
      } else {
        storyBody.video_url = videoUrl;
      }
      const containerRes = await fetch(
        `${igBaseUrl}/${accountId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(storyBody),
        },
      );

      const containerResText = await containerRes.text();
      console.log("Container response:", containerResText);
      const container = JSON.parse(containerResText);
      if (!container?.id) {
        console.error(
          "Instagram story container creation failed",
          JSON.stringify(container),
        );
        throw new Error(JSON.stringify(container));
      }

      // Poll container status until ready — 20 attempts for Instagram
      const MAX_POLL_ATTEMPTS = 20;
      let containerReady = false;
      for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        await new Promise((r) => setTimeout(r, 2000));

        const statusRes = await fetch(
          `${igBaseUrl}/${container.id}?fields=status_code&access_token=${accessToken}`
        );
        const statusData = await statusRes.json() as { status_code?: string; error?: { message: string } };

        if (statusData?.status_code === "FINISHED") {
          containerReady = true;
          break;
        }

        if (statusData?.status_code === "ERROR") {
          throw new Error(`Container processing failed: ${statusData?.error?.message || "unknown"}`);
        }

        console.log(`Container status check ${i + 1}/${MAX_POLL_ATTEMPTS}: ${statusData?.status_code || "unknown"}`);
      }

      if (!containerReady) {
        console.log("Container did not become ready within poll limit");
        throw new Error("Container processing timed out");
      }

      const publishRes = await fetch(
        `${igBaseUrl}/${accountId}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creation_id: container.id,
            access_token: accessToken
          })
        }
      );
      const publishResult = await publishRes.json() as Record<string, unknown>;

      if (!publishResult?.id) {
        console.log("Story publish failed:", JSON.stringify(publishResult));
        throw new Error("Publish failed: " + JSON.stringify(publishResult));
      }

      resultBody = { success: true, storyId: publishResult.id as string };
    }
  } catch (err) {
    console.error("post-story error", err);
    resultStatus = 500;
    resultBody = {
      error: err instanceof Error ? err.message : "Failed to post story",
    };
  }

  // Write status to DB if postId is provided
  if (supabase && postId) {
    if (resultStatus === 200 && resultBody.success) {
      await supabase
        .from("posts")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", postId);
    } else {
      await supabase
        .from("posts")
        .update({
          status: "failed",
          metadata: { error: (resultBody.error as string) || "Unknown error" },
        })
        .eq("id", postId);
    }
  }

  return json(resultBody, resultStatus);
});
