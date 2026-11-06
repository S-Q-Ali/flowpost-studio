import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { decrypt } from "../_shared/crypto.ts";
import { fileProxyUrl } from "../_shared/get-file-token.ts";
import { updateSheetStatus } from "../_shared/sheet-status.ts";
import { createRequestAuthorizer, createSessionLookup } from "../_shared/auth.ts";
import { checkPostAccess, claimPost, settlePost, type HeldClaim } from "../_shared/post-access.ts";
import { isAllowedDriveUrl } from "../_shared/url-guard.ts";
import { redactTokens } from "../_shared/log-safe.ts";
import { driveMediaUrl } from "../_shared/google-drive.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL")!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for instagram-upload");
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

  let postId: string;
  let driveDownloadUrl: string | undefined;
  let googleAccessToken: string | undefined;
  let megaUrl: string | undefined;
  let megaFileName: string | undefined;
  let megaAccountId: string | undefined;
  let isCarousel: boolean;
  let held: HeldClaim | null = null;

  try {
    const body = await req.json();
    postId = body?.postId;
    if (!postId) return json({ error: "postId required" }, 400);
    driveDownloadUrl = typeof body?.driveDownloadUrl === "string"
      ? body.driveDownloadUrl
      : undefined;
    // The URL goes into a get-file token and the bearer follows it there, so it
    // may only name a Google host — refused here, not only at the fetch.
    if (driveDownloadUrl && !isAllowedDriveUrl(driveDownloadUrl)) {
      return json({ error: "Unsupported download URL" }, 400);
    }
    googleAccessToken = typeof body?.googleAccessToken === "string"
      ? body.googleAccessToken
      : undefined;
    megaUrl = typeof body?.megaUrl === "string"
      ? body.megaUrl
      : undefined;
    megaFileName = typeof body?.megaFileName === "string"
      ? body.megaFileName
      : undefined;
    megaAccountId = typeof body?.megaAccountId === "string"
      ? body.megaAccountId
      : undefined;
    isCarousel = body?.carousel === true;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  try {
    const postQuery = isCarousel
      ? supabase.from("posts").select("id, video_id, account_id, caption, status, platform, user_id, metadata, videos(*), carousel_items(id, video_id, sort_order, videos(*))").eq("id", postId).single()
      : supabase.from("posts").select("id, video_id, account_id, caption, status, platform, user_id, metadata, videos(*)").eq("id", postId).single();

    const { data: post, error: postError } = await postQuery;

    if (postError || !post) {
      return json({ error: "Post not found" }, 404);
    }

    const access = checkPostAccess(auth, post);
    if (!access.ok) return json({ error: access.error }, access.status);

    if (post.platform !== "instagram") {
      return json({ error: "Post is not for Instagram" }, 400);
    }

    if (!post.account_id) {
      return json({ error: "Post has no account_id" }, 400);
    }

    const claim = await claimPost(supabase, post.id);
    if (!claim.ok) return json({ error: claim.error }, claim.status);
    held = claim;
    // Every status write below carries this claim: an attempt cut off by the
    // scheduler's half-hour cut-off must not overwrite the retry's answer, and a
    // failure releases the claim so a retry can start immediately.
    const fail = () => settlePost(supabase, claim, { status: "failed", claimed_at: null });
    const publish = () => settlePost(supabase, claim, {
      status: "published",
      published_at: new Date().toISOString(),
      claimed_at: null,
    });

    const { data: account, error: accountError } = await supabase
      .from("connected_accounts")
      .select("*")
      .eq("platform", "instagram")
      .eq("account_id", post.account_id)
      .eq("is_connected", true)
      .single();

    if (accountError || !account?.access_token) {
      await fail();
      return json({ error: "Connected Instagram account not found" }, 404);
    }

    const accessToken = await decrypt(account.access_token as string);
    const igUserId = account.account_id as string;
    const caption = (post.caption || "").substring(0, 2200);
    const igBaseUrl = (account as any)?.metadata?.instagram_login
      ? "https://graph.instagram.com/v27.0"
      : "https://graph.facebook.com/v25.0";

    // Helper: resolve a video's file_url to a usable media URL
    const resolveMediaUrl = async (videoFileUrl: string): Promise<string> => {
      if (megaFileName && megaAccountId) {
        return await fileProxyUrl({ megaFileName, megaAccountId }, post.user_id);
      }
      if (megaUrl) {
        return await fileProxyUrl({ megaUrl }, post.user_id);
      }
      if (driveDownloadUrl && googleAccessToken) {
        if (R2_PUBLIC_URL && videoFileUrl?.includes(R2_PUBLIC_URL)) {
          return videoFileUrl;
        }
        // Extract file ID from stored file_url to construct download URL
        const fileIdMatch = videoFileUrl.match(/\/d\/([^/]+)/) || driveDownloadUrl.match(/\/d\/([^/]+)/);
        const fileId = fileIdMatch?.[1];
        if (fileId) {
          const resolvedDriveUrl = driveMediaUrl(fileId);
          return await fileProxyUrl(
            { driveUrl: resolvedDriveUrl, driveToken: googleAccessToken },
            post.user_id,
          );
        }
        // Fallback: use file_url as-is
        return await fileProxyUrl(
          { driveUrl: videoFileUrl, driveToken: googleAccessToken },
          post.user_id,
        );
      }
      return videoFileUrl;
    };

    // === CAROUSEL PATH ===
    if (isCarousel) {
      const carouselItems = (post as any).carousel_items as { id: string; video_id: string; sort_order: number; videos: { file_url: string; media_type: string } | null }[] | undefined;
      if (!carouselItems || carouselItems.length < 2) {
        await fail();
        return json({ error: `Carousel needs at least 2 items, got ${carouselItems?.length || 0}` }, 400);
      }

      const childContainerIds: string[] = [];
      for (const item of carouselItems.sort((a, b) => a.sort_order - b.sort_order)) {
        const childVideo = item.videos;
        if (!childVideo?.file_url) {
          await fail();
          return json({ error: `Carousel child ${item.sort_order} has no file_url` }, 404);
        }

        const childMediaUrl = await resolveMediaUrl(childVideo.file_url);
        const childType = childVideo.media_type === "image" ? "IMAGE" : "VIDEO";

        console.log(`Creating carousel child container ${item.sort_order + 1} (${childType}) for user:`, igUserId);

        const childForm = new URLSearchParams();
        childForm.append("media_type", childType);
        if (childType === "IMAGE") {
          childForm.append("image_url", childMediaUrl);
        } else {
          childForm.append("video_url", childMediaUrl);
        }
        childForm.append("access_token", accessToken);

        const childRes = await fetch(
          `${igBaseUrl}/${igUserId}/media`,
          { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: childForm.toString() },
        );
        const childData = await childRes.json();
        if (!childData.id) {
          await fail();
          return json({ error: `Carousel child ${item.sort_order} container failed: ${JSON.stringify(childData)}` }, 502);
        }
        childContainerIds.push(childData.id);
        console.log(`Carousel child container ${item.sort_order + 1} created:`, childData.id);
      }

      console.log(`Creating CAROUSEL container with ${childContainerIds.length} children`);
      const carouselForm = new URLSearchParams();
      carouselForm.append("media_type", "CAROUSEL");
      carouselForm.append("children", `["${childContainerIds.join('","')}"]`);
      carouselForm.append("caption", caption);
      carouselForm.append("access_token", accessToken);

      const carouselRes = await fetch(
        `${igBaseUrl}/${igUserId}/media`,
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: carouselForm.toString() },
      );
      const carouselText = await carouselRes.text();
      const carouselData = JSON.parse(carouselText);

      if (!carouselData.id) {
        await fail();
        return json({ error: `Carousel container creation failed: ${carouselText}` }, 502);
      }

      const containerId = carouselData.id;
      console.log("Carousel container created:", containerId);

      // Poll carousel container status
      const MAX_POLL_ATTEMPTS = 10;
      const POLL_INTERVAL = 12000;
      let publishResult: Record<string, unknown> | null = null;

      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        if (attempt > 0) {
          console.log(`Carousel status poll attempt ${attempt + 1}...`);
          await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        }

        const statusRes = await fetch(
          `${igBaseUrl}/${containerId}?fields=status_code&access_token=${accessToken}`,
        );
        const statusData = await statusRes.json() as Record<string, unknown>;

        if (statusData.status_code === "FINISHED") {
          const publishForm = new URLSearchParams();
          publishForm.append("creation_id", containerId);
          publishForm.append("access_token", accessToken);
          const publishRes = await fetch(
            `${igBaseUrl}/${igUserId}/media_publish`,
            { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: publishForm.toString() },
          );
          publishResult = await publishRes.json() as Record<string, unknown>;
          if (publishResult?.id) { console.log("Carousel publish succeeded:", JSON.stringify(publishResult)); break; }
          console.log(`Carousel publish attempt ${attempt + 1} failed:`, JSON.stringify(publishResult));
          if (publishResult.error) break;
        } else if (statusData.status_code === "EXPIRED") {
          console.error("Carousel container expired");
          break;
        } else {
          console.log(`Carousel status: ${statusData.status_code || JSON.stringify(statusData)} (attempt ${attempt + 1})`);
        }
      }

      if (!publishResult?.id) {
        await fail();
        return json({ error: `Carousel publish failed: ${JSON.stringify(publishResult)}` }, 502);
      }

      if (!await publish()) {
        console.error(`instagram-upload: carousel post ${postId} was re-claimed elsewhere`);
        return json({ error: "Publish succeeded but the post was taken over" }, 409);
      }
      await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "posted", googleAccessToken);
      return json({ success: true, instagram_post_id: publishResult.id as string, container_id: containerId });
    }

    // === SINGLE MEDIA PATH ===
    // posts -> videos is a to-one embed, so the server answers with one object;
    // the untyped client infers an array for any "(*)" embed.
    const video = post.videos as unknown as { file_url?: string; media_type?: string } | null;
    if (!video || !video.file_url) {
      await fail();
      return json({ error: "Video not found or missing file_url" }, 404);
    }

    const mediaType = video.media_type ?? "video";
    const isImage = mediaType === "image";

    const mediaUrl = await resolveMediaUrl(video.file_url);

    console.log(`Creating Instagram ${isImage ? "image" : "reel"} container for user:`, igUserId);
    console.log("Using media URL:", redactTokens(mediaUrl));

    const containerForm = new URLSearchParams();
    containerForm.append("media_type", isImage ? "IMAGE" : "REELS");
    if (isImage) {
      containerForm.append("image_url", mediaUrl);
    } else {
      containerForm.append("video_url", mediaUrl);
    }
    containerForm.append("caption", caption);
    containerForm.append("access_token", accessToken);

    const containerRes = await fetch(
      `${igBaseUrl}/${igUserId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: containerForm.toString(),
      },
    );
    const containerResText = await containerRes.text();
    console.log("Container response status:", containerRes.status);
    console.log("Container response body:", redactTokens(containerResText));

    const container = JSON.parse(containerResText);

    if (!container.id) {
      console.error("Container creation failed:", redactTokens(containerResText));
      await fail();
      return json({ error: `Container failed: ${containerResText}` }, 502);
    }

    console.log("Container created:", container.id);

    const MAX_POLL_ATTEMPTS = 10;
    const POLL_INTERVAL = 12000;
    let publishResult: Record<string, unknown> | null = null;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        console.log(`Container status poll attempt ${attempt + 1}...`);
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      }

      const statusRes = await fetch(
        `${igBaseUrl}/${container.id}?fields=status_code&access_token=${accessToken}`,
      );
      const statusData = await statusRes.json() as Record<string, unknown>;

      if (statusData.status_code === "FINISHED") {
        const publishForm = new URLSearchParams();
        publishForm.append("creation_id", container.id);
        publishForm.append("access_token", accessToken);

        const publishRes = await fetch(
          `${igBaseUrl}/${igUserId}/media_publish`,
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
      console.error("Publish failed after 10 attempts");
      await fail();
      return json({ error: `Publish failed after 10 attempts: ${JSON.stringify(publishResult)}` }, 502);
    }

    if (!await publish()) {
      console.error(`instagram-upload: post ${postId} was re-claimed elsewhere`);
      return json({ error: "Publish succeeded but the post was taken over" }, 409);
    }

    await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "posted", googleAccessToken);

    return json({ success: true, instagram_post_id: publishResult.id as string, container_id: container.id });
  } catch (err) {
    console.error("instagram-upload error", err);
    try {
      // An error before the claim leaves the row live for the next attempt.
      if (held) {
        await settlePost(supabase, held, { status: "failed", claimed_at: null });
        await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "failed", googleAccessToken);
      }
    } catch (cleanupErr) {
      console.error("instagram-upload: failed to mark post failed", cleanupErr);
    }
    return json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      500,
    );
  }
});
