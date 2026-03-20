const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY");
const SB_ANON_KEY = Deno.env.get("SB_ANON_KEY");

if (!SB_SERVICE_ROLE_KEY || !SB_ANON_KEY) {
  console.error(
    "Missing SB_SERVICE_ROLE_KEY or SB_ANON_KEY for post-story function",
  );
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
    const containerRes = await fetch(
      `https://graph.facebook.com/v18.0/${accountId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "STORIES",
          video_url: videoUrl,
          access_token: accessToken,
        }),
      },
    );

    const container = await containerRes.json();
    if (!container?.id) {
      console.error(
        "Instagram story container creation failed",
        JSON.stringify(container),
      );
      throw new Error(JSON.stringify(container));
    }

    let status = "IN_PROGRESS";
    let attempts = 0;

    while (status === "IN_PROGRESS" && attempts < 12) {
      await new Promise((r) => setTimeout(r, 5000));

      const statusRes = await fetch(
        `https://graph.facebook.com/v18.0/${container.id}?fields=status_code&access_token=${accessToken}`,
      );
      const s = await statusRes.json();
      status = s.status_code;
      attempts++;
    }

    if (status !== "FINISHED") {
      console.error("Instagram story container not ready", status);
      throw new Error(`Container not ready: ${status}`);
    }

    const publishRes = await fetch(
      `https://graph.facebook.com/v18.0/${accountId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: container.id,
          access_token: accessToken,
        }),
      },
    );

    const publishData = await publishRes.json();

    if (!publishRes.ok || !publishData?.id) {
      console.error(
        "Instagram story publish failed",
        publishRes.status,
        JSON.stringify(publishData),
      );
      throw new Error(JSON.stringify(publishData));
    }

    return json({ success: true, storyId: publishData.id });
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

