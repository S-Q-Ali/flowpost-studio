import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { decrypt } from "../_shared/crypto.ts";
import { fileProxyUrl } from "../_shared/get-file-token.ts";
import { updateSheetStatus } from "../_shared/sheet-status.ts";
import { createRequestAuthorizer, createSessionLookup } from "../_shared/auth.ts";
import { checkPostAccess, claimPost, settlePost, type HeldClaim } from "../_shared/post-access.ts";
import { isAllowedDriveUrl } from "../_shared/url-guard.ts";
import { redactTokens } from "../_shared/log-safe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL")!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for facebook-upload");
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
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  try {
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select(
        "id, video_id, account_id, caption, status, platform, user_id",
      )
      .eq("id", postId)
      .single();

    if (postError || !post) {
      return json({ error: "Post not found" }, 404);
    }

    const access = checkPostAccess(auth, post);
    if (!access.ok) return json({ error: access.error }, access.status);

    if (post.platform !== "facebook") {
      return json({ error: "Post is not for Facebook" }, 400);
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

    const mediaType = (video as any).media_type ?? "video";
    const isImage = mediaType === "image";

    const { data: account, error: accountError } = await supabase
      .from("connected_accounts")
      .select("account_id, access_token")
      .eq("platform", "facebook")
      .eq("account_id", post.account_id)
      .eq("is_connected", true)
      .single();

    if (accountError || !account?.access_token) {
      await fail();
      return json({ error: "Connected Facebook Page not found" }, 404);
    }

    const pageId = account.account_id;
    const accessToken = await decrypt(account.access_token);

    // Use Drive source via get-file proxy, Mega source via get-file proxy, or fall back to stored file_url
    let mediaUrl = video.file_url as string;

    if (megaFileName && megaAccountId) {
      mediaUrl = await fileProxyUrl({ megaFileName, megaAccountId }, post.user_id);
      console.log("Facebook: streaming the video from a Mega account");
    } else if (megaUrl) {
      mediaUrl = await fileProxyUrl({ megaUrl }, post.user_id);
      console.log("Facebook: streaming the video from a Mega link");
    } else if (driveDownloadUrl && googleAccessToken) {
      // If video is already cached on R2, use it directly — skip get-file proxy
      if (R2_PUBLIC_URL && video.file_url?.includes(R2_PUBLIC_URL)) {
        mediaUrl = video.file_url;
        console.log("Facebook: using the video already cached on R2");
      } else {
        mediaUrl = await fileProxyUrl(
          { driveUrl: driveDownloadUrl, driveToken: googleAccessToken },
          post.user_id,
        );
        console.log("Facebook: streaming the video through the get-file proxy");
      }
    }

    let postRes: Response;

    if (isImage) {
      postRes = await fetch(
        `https://graph.facebook.com/v25.0/${encodeURIComponent(pageId)}/photos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            url: mediaUrl,
            message: (post.caption || "").toString(),
            access_token: accessToken,
            published: "true",
          }).toString(),
        },
      );
    } else {
      postRes = await fetch(
        `https://graph-video.facebook.com/v25.0/${encodeURIComponent(pageId)}/videos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            file_url: mediaUrl,
            description: (post.caption || "").toString(),
            access_token: accessToken,
            published: "true",
          }).toString(),
        },
      );
    }

    const postData = (await postRes.json()) as { id?: string };
    const postBody = redactTokens(JSON.stringify(postData));
    console.log(`Facebook ${isImage ? "image" : "video"} upload response:`, postRes.status, postBody);
    if (!postRes.ok || !postData?.id) {
      console.error(`Facebook ${isImage ? "image" : "video"} file_url upload failed`, postRes.status, postBody);
      await fail();
      await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "failed", googleAccessToken);
      return json({ error: `Facebook upload failed: ${postBody}` }, 502);
    }

    const settled = await settlePost(supabase, claim, {
      status: "published",
      published_at: new Date().toISOString(),
      claimed_at: null,
    });

    if (!settled) {
      console.error(`facebook-upload: post ${postId} was re-claimed elsewhere`);
      return json({ error: "Upload succeeded but the post was taken over" }, 409);
    }

    await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "posted", googleAccessToken);

    return json({ success: true, postId, facebook_id: postData.id });
  } catch (err) {
    console.error("facebook-upload error", err);
    try {
      // An error before the claim leaves the row live for the next attempt.
      if (held) {
        await settlePost(supabase, held, { status: "failed", claimed_at: null });
        await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "failed", googleAccessToken);
      }
    } catch (cleanupErr) {
      console.error("facebook-upload: failed to mark post failed", cleanupErr);
    }
    return json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      500,
    );
  }
});
