import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { decrypt } from "../_shared/crypto.ts";
import { createRequestAuthorizer, createSessionLookup } from "../_shared/auth.ts";
import { checkPostAccess, claimPost, settlePost, type HeldClaim } from "../_shared/post-access.ts";
import { isAllowedMediaUrl } from "../_shared/url-guard.ts";
import { redactTokens } from "../_shared/log-safe.ts";
import { hasExpired } from "../_shared/token-expiry.ts";
import { FACEBOOK_GRAPH_BASE, metaGraphBase } from "../_shared/meta-graph.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY for post-story function");
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

  const auth = await authorize(req);
  if (!auth.allowed) {
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
  let held: HeldClaim | null = null;

  try {
    const body = (await req.json()) as Partial<PostStoryPayload>;

    postId = body.postId;
    mediaTypeInput = body.mediaType;

    // Only the scheduler and the workflow run hold the raw credentials; a
    // browser session publishes rows it owns, by post id.
    const isServiceCaller = auth.kind === "service-role" || auth.kind === "cron";

    if (postId) {
      const { data: storyPost } = await supabase
        .from("posts")
        .select("video_id, account_id, user_id, status, platform")
        .eq("id", postId)
        .single();

      if (!storyPost) {
        return json({ error: "Post not found" }, 404);
      }

      const postPlatform = body.platform || storyPost.platform;
      if (!postPlatform) {
        return json({ error: "platform is required" }, 400);
      }
      if (postPlatform !== "facebook" && postPlatform !== "instagram") {
        return json({ error: "Invalid platform" }, 400);
      }
      platform = postPlatform as SupportedPlatform;

      const access = checkPostAccess(auth, storyPost);
      if (!access.ok) return json({ error: access.error }, access.status);

      // The account is the only way to a token, so a row that names none is
      // refused before it takes the claim a retry would have to wait for.
      if (!storyPost.account_id) {
        return json({ error: "Post has no account_id" }, 400);
      }

      // A workflow row arrives already `publishing`; the claim still stops a
      // second caller from sending the same story twice.
      const claim = await claimPost(supabase, postId);
      if (!claim.ok) return json({ error: claim.error }, claim.status);
      held = claim;
      // A failure before the publish below has to release the claim, or the row
      // stays locked until the scheduler's half-hour cut-off.
      const fail = () => settlePost(supabase, claim, { status: "failed", claimed_at: null });

      const rawFields = !!(body.videoUrl && body.accessToken && body.accountId);
      if (rawFields) {
        if (!isServiceCaller) {
          await fail();
          return json({ error: "Raw credentials are not allowed for this caller" }, 403);
        }
        accountId = body.accountId!;
        videoUrl = body.videoUrl!;
        accessToken = body.accessToken!;
      } else {
        const { data: video } = await supabase
          .from("videos")
          .select("file_url, media_type")
          .eq("id", storyPost.video_id)
          .single();

        if (!video?.file_url) {
          await fail();
          return json({ error: "Video URL not found" }, 404);
        }

        let { data: acc } = await supabase
          .from("connected_accounts")
          .select("access_token, token_expiry")
          .eq("user_id", storyPost.user_id)
          .eq("account_id", storyPost.account_id)
          .eq("platform", platform)
          .maybeSingle();

        if (!acc) {
          const { data: accByUuid } = await supabase
            .from("connected_accounts")
            .select("access_token, token_expiry")
            .eq("user_id", storyPost.user_id)
            .eq("id", storyPost.account_id)
            .eq("platform", platform)
            .maybeSingle();
          acc = accByUuid;
        }

        if (!acc?.access_token) {
          await fail();
          return json({ error: "Access token not found" }, 404);
        }

        // An Instagram-Login token lives 60 days and nothing here renews it, so
        // a past deadline is said once instead of at Graph's own refusal. A
        // Facebook row states no deadline, and no deadline is not an expiry.
        if (platform === "instagram" && hasExpired(acc.token_expiry ?? null)) {
          await fail();
          return json({ error: "The Instagram connection expired. Reconnect it in Accounts." }, 409);
        }

        accountId = storyPost.account_id;
        videoUrl = video.file_url;
        accessToken = await decrypt(acc.access_token);
        if (!mediaTypeInput) mediaTypeInput = video.media_type;
      }
    } else {
      if (!isServiceCaller) {
        return json({ error: "postId is required" }, 400);
      }
      // First attempt from process-workflow — raw fields required
      if (!body.videoUrl || !body.accessToken || !body.accountId) {
        return json(
          { error: "postId with videoUrl, accessToken and accountId are required, or provide all raw fields" },
          400,
        );
      }
      accountId = body.accountId;
      videoUrl = body.videoUrl;
      accessToken = body.accessToken;
    }
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!isAllowedMediaUrl(videoUrl)) {
    if (held) await settlePost(supabase, held, { status: "failed", claimed_at: null });
    return json({ error: "Invalid video URL" }, 400);
  }

  let resultStatus = 200;
  let resultBody: Record<string, unknown>;

  try {
    if (platform === "facebook") {
      const startRes = await fetch(
        `${FACEBOOK_GRAPH_BASE}/${accountId}/video_stories`,
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
        `${FACEBOOK_GRAPH_BASE}/${accountId}/video_stories`,
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
      console.log("Instagram story using URL:", redactTokens(videoUrl));

      // Where the stored token is accepted: Instagram Login issues on its own
      // host, everything else through the Facebook app.
      let igBaseUrl = FACEBOOK_GRAPH_BASE;
      try {
        let { data: igAccount } = await supabase
          .from("connected_accounts")
          .select("metadata")
          .eq("account_id", accountId)
          .eq("platform", "instagram")
          .maybeSingle();
        if (!igAccount) {
          const { data: igAccountByUuid } = await supabase
            .from("connected_accounts")
            .select("metadata")
            .eq("id", accountId)
            .eq("platform", "instagram")
            .maybeSingle();
          igAccount = igAccountByUuid;
        }
        igBaseUrl = metaGraphBase((igAccount as any)?.metadata);
      } catch { /* the Facebook app serves the token either way */ }

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
      console.log("Container response:", redactTokens(containerResText));
      const container = JSON.parse(containerResText);
      if (!container?.id) {
        console.error(
          "Instagram story container creation failed",
          redactTokens(containerResText),
        );
        throw new Error(redactTokens(containerResText));
      }

      // Poll container status until ready — 20 attempts for Instagram
      const MAX_POLL_ATTEMPTS = 20;
      let containerReady = false;
      for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        await new Promise((r) => setTimeout(r, 2000));

        const statusRes = await fetch(
          `${igBaseUrl}/${container.id}?fields=status_code,status&access_token=${accessToken}`
        );
        const statusData = await statusRes.json() as { status_code?: string; status?: string; error?: { message: string } };

        if (statusData?.status_code === "FINISHED") {
          containerReady = true;
          break;
        }

        if (statusData?.status_code === "ERROR") {
          const detail = statusData?.status || statusData?.error?.message || "unknown";
          throw new Error(`Instagram story container processing failed: ${detail}`);
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

  // Settle the row this request claimed. Without a claim there is nothing to
  // write: the row belongs to whichever caller holds it.
  if (postId && held) {
    const published = resultStatus === 200 && resultBody.success;
    const settled = await settlePost(
      supabase,
      held,
      published
        ? { status: "published", published_at: new Date().toISOString(), claimed_at: null }
        : {
            status: "failed",
            claimed_at: null,
            metadata: { error: (resultBody.error as string) || "Unknown error" },
          },
    );
    if (!settled) {
      console.error(`post-story: post ${postId} was re-claimed elsewhere`);
    }
  }

  return json(resultBody, resultStatus);
});
