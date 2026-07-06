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
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for facebook-upload");
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
      .select(
        "id, video_id, account_id, caption, status, platform, user_id",
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
      .select("id, title, file_url, media_type")
      .eq("id", post.video_id)
      .single();

    if (videoError || !video?.file_url) {
      return json({ error: "Video not found or missing file_url" }, 404);
    }

    const mediaType = (video as any).media_type ?? "video";

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
    const accessToken = await decrypt(account.access_token);

    // Support either:
    // - Traditional flow: video.file_url points to R2/public storage
    // - Workflow flow: direct Google Drive download URL + access token
    let mediaUrl = video.file_url as string;
    const isImage = mediaType === "image";

    const userId = post.user_id ?? "00000000-0000-0000-0000-000000000000";

    if (
      (driveDownloadUrl || mediaUrl.includes("googleapis.com")) &&
      googleAccessToken
    ) {
      const driveSource = driveDownloadUrl || mediaUrl;
      console.log(`Uploading Drive ${isImage ? "image" : "video"} to R2 first...`);

      mediaUrl = await uploadDriveMediaToR2(
        driveSource,
        googleAccessToken,
        post.video_id,
        video.title || post.video_id,
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

    let postRes: Response;
    let postData: any;

    if (isImage) {
      // Image posting: use /photos endpoint
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
// Video posting: use /videos endpoint
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

    postData = await postRes.json();
    console.log(`Facebook ${isImage ? "image" : "video"} upload response:`, postRes.status, postData);
    if (!postRes.ok || !postData?.id) {
      console.error(`Facebook ${isImage ? "image" : "video"} file_url upload failed`, postRes.status, postData);
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "failed");
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

    await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "posted");

    return json({ success: true, postId, facebook_id: postData.id });
  } catch (err) {
    console.error("facebook-upload error", err);
    try {
      if (typeof postId === "string") {
        await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
        await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "failed");
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




