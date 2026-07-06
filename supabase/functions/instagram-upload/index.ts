import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { decrypt } from "../_shared/crypto.ts";
import { uploadDriveMediaToR2 } from "../_shared/drive-to-r2.ts";
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
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for instagram-upload");
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const ALLOWED_DOMAINS = [
  "www.googleapis.com",
  "drive.google.com",
  R2_PUBLIC_URL,
  "graph.facebook.com",
];

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
      .select("id, video_id, account_id, caption, status, platform, user_id, videos(*)")
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

    const accessToken = await decrypt(account.access_token as string);
    const igUserId = account.account_id as string;

    const userId = post.user_id ?? "00000000-0000-0000-0000-000000000000";
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
        userId,
        supabase,
        ALLOWED_DOMAINS,
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

    const MAX_POLL_ATTEMPTS = 8;
    const POLL_INTERVAL = 30000;
    let publishResult: Record<string, unknown> | null = null;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        console.log(`Container status poll attempt ${attempt + 1}...`);
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      }

      // Check container processing status
      const statusRes = await fetch(
        `https://graph.facebook.com/v25.0/${container.id}?fields=status_code&access_token=${accessToken}`,
      );
      const statusData = await statusRes.json() as Record<string, unknown>;

      if (statusData.status_code === "FINISHED") {
        // Container is ready — publish
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
        if (publishResult.error) {
          // Non-retryable errors (e.g. expired container)
          console.error("Non-retryable publish error, giving up");
          break;
        }
      } else if (statusData.status_code === "EXPIRED") {
        console.error("Container expired");
        break;
      } else {
        console.log(`Container status: ${statusData.status_code || JSON.stringify(statusData)} (attempt ${attempt + 1})`);
      }
    }

    if (!publishResult?.id) {
      console.error("Publish failed after 8 attempts");
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json({ error: `Publish failed after 8 attempts: ${JSON.stringify(publishResult)}` }, 502);
    }

    await supabase
      .from("posts")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", postId);

    await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "posted");

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




