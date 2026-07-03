const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
  accountId: string;
  videoUrl: string;
  accessToken: string;
  mediaType?: "video" | "image";
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

  let payload: PostStoryPayload;

  try {
    const body = (await req.json()) as Partial<PostStoryPayload>;
    if (
      !body.platform ||
      !body.accountId ||
      !body.videoUrl ||
      !body.accessToken
    ) {
      return json(
        { error: "platform, accountId, videoUrl and accessToken are required" },
        400,
      );
    }

    if (body.platform !== "facebook" && body.platform !== "instagram") {
      return json({ error: "Invalid platform" }, 400);
    }

    payload = {
      platform: body.platform,
      accountId: body.accountId,
      videoUrl: body.videoUrl,
      accessToken: body.accessToken,
      mediaType: body.mediaType,
    };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { platform, accountId, videoUrl, accessToken } = payload;

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

      return json({ success: true, video_id });
    }

    // Instagram story flow
    console.log("Instagram account ID:", accountId);
    console.log("Token prefix:", accessToken.substring(0, 20));
    console.log("Instagram story using URL:", videoUrl);
    const isImageStory = payload.mediaType === "image";
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
      `https://graph.facebook.com/v25.0/${accountId}/media`,
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

    // Poll container status until ready
    const MAX_POLL_ATTEMPTS = 15;
    let containerReady = false;
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, 5000));

      const statusRes = await fetch(
        `https://graph.facebook.com/v25.0/${container.id}?fields=status_code&access_token=${accessToken}`
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
      return json({ success: false, error: "Container processing timed out" });
    }

    const publishRes = await fetch(
      `https://graph.facebook.com/v25.0/${accountId}/media_publish`,
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
      return json({ success: false, error: "Publish failed" });
    }

    return json({ success: true, storyId: publishResult.id as string });
  } catch (err) {
    console.error("post-story error", err);
    return json(
      {
        error: err instanceof Error ? err.message : "Failed to post story",
      },
      500,
    );
  }
});



