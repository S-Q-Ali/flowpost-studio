import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { decrypt } from "../_shared/crypto.ts";
import { createRequestAuthorizer, createSessionLookup } from "../_shared/auth.ts";
import { checkPostAccess, claimPost, settlePost, type HeldClaim } from "../_shared/post-access.ts";
import { isAllowedMediaUrl } from "../_shared/url-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for linkedin-upload");
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
  let mediaUrl: string | undefined;
  let held: HeldClaim | null = null;

  try {
    const body = await req.json();
    postId = body?.postId;
    if (!postId) return json({ error: "postId required" }, 400);
    // This URL is fetched server-side, so it may only name this app's own media
    // hosts (Google Drive, Mega, the R2 bucket, the get-file proxy).
    const requestedUrl = typeof body?.driveDownloadUrl === "string"
      ? body.driveDownloadUrl
      : typeof body?.mediaUrl === "string"
      ? body.mediaUrl
      : undefined;
    if (requestedUrl && !isAllowedMediaUrl(requestedUrl)) {
      return json({ error: "Unsupported media URL" }, 400);
    }
    mediaUrl = requestedUrl;
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

    const access = checkPostAccess(auth, post);
    if (!access.ok) return json({ error: access.error }, access.status);

    if (post.platform !== "linkedin") {
      return json({ error: "Post is not for LinkedIn" }, 400);
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

    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("id, title, file_url, media_type")
      .eq("id", post.video_id)
      .single();

    if (videoError || !video?.file_url) {
      await fail();
      return json({ error: "Video not found or missing file_url" }, 404);
    }

    const isImage = (video as any).media_type === "image";

    const { data: account, error: accountError } = await supabase
      .from("connected_accounts")
      .select("account_id, access_token, metadata")
      .eq("user_id", post.user_id)
      .eq("platform", "linkedin")
      .eq("account_id", post.account_id)
      .eq("is_connected", true)
      .single();

    if (accountError || !account?.access_token) {
      await fail();
      return json({ error: "Connected LinkedIn account not found" }, 404);
    }

    const accessToken = await decrypt(account.access_token);
    const personId = account.account_id;
    const uploadUrl = mediaUrl || video.file_url;
    // The stored URL is the fallback and is still fetched server-side, so it
    // gets the same host check as the one that came in the request.
    if (!isAllowedMediaUrl(uploadUrl as string)) {
      await fail();
      return json({ error: "Unsupported media URL" }, 400);
    }

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
      await fail();
      return json({ error: `LinkedIn upload registration failed: ${JSON.stringify(registerData)}` }, 502);
    }

    const uploadUrlLinkedIn = registerData.value?.uploadInstructions?.[0]?.uploadUrl;
    const mediaUrn = isImage ? registerData.value?.image : registerData.value?.video;
    if (!uploadUrlLinkedIn || !mediaUrn) {
      console.error("LinkedIn upload registration missing upload URL or media URN", registerData);
      await fail();
      return json({ error: "LinkedIn upload registration missing upload URL" }, 502);
    }

    // Step 2: Upload the binary to the provided URL
    const videoRes = await fetch(uploadUrl);
    if (!videoRes.ok) {
      console.error("Failed to fetch source video for LinkedIn upload", uploadUrl, videoRes.status);
      await fail();
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
      await fail();
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
      await fail();
      return json({ error: `LinkedIn post creation failed: ${JSON.stringify(createPostData)}` }, 502);
    }

    const settled = await settlePost(supabase, claim, {
      status: "published",
      published_at: new Date().toISOString(),
      claimed_at: null,
    });

    if (!settled) {
      console.error(`linkedin-upload: post ${postId} was re-claimed elsewhere`);
      return json({ error: "Upload succeeded but the post was taken over" }, 409);
    }

    return json({ success: true, postId, linkedin_post_id: createPostData.id });
  } catch (err) {
    console.error("linkedin-upload error", err);
    try {
      // Only a claim this call still holds may be failed; an error before the
      // claim leaves the row live for the next attempt.
      if (held) {
        await settlePost(supabase, held, { status: "failed", claimed_at: null });
      }
    } catch (cleanupErr) {
      console.error("linkedin-upload: failed to mark post failed", cleanupErr);
    }
    return json({ error: err instanceof Error ? err.message : "Upload failed" }, 500);
  }
});
