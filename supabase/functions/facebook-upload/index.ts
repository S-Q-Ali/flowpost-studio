import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SB_URL = Deno.env.get("SB_URL");
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY");
const SB_ANON_KEY = Deno.env.get("SB_ANON_KEY");

if (!SB_URL || !SB_SERVICE_ROLE_KEY || !SB_ANON_KEY) {
  console.error("Missing SB_URL, SB_SERVICE_ROLE_KEY, or SB_ANON_KEY for facebook-upload");
}

const supabase = createClient(SB_URL!, SB_SERVICE_ROLE_KEY!, {
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
  const validKeys = [SB_ANON_KEY, SB_SERVICE_ROLE_KEY];

  if (!token || !validKeys.includes(token)) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let postId: string;

  try {
    const body = await req.json();
    postId = body?.postId;
    if (!postId) return json({ error: "postId required" }, 400);
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  try {
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select(
        "id, video_id, account_id, caption, status, platform",
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
      .select("id, title, file_url")
      .eq("id", post.video_id)
      .single();

    if (videoError || !video?.file_url) {
      return json({ error: "Video not found or missing file_url" }, 404);
    }

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
    const accessToken = account.access_token;

    const videoRes = await fetch(video.file_url);
    if (!videoRes.ok) {
      console.error("Failed to download video from R2", videoRes.status);
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json({ error: "Failed to download video file" }, 502);
    }

    const videoBytes = await videoRes.arrayBuffer();
    const fileSize = videoBytes.byteLength;

    // STEP A - Initialize upload session
    const startForm = new FormData();
    startForm.append("upload_phase", "start");
    startForm.append("file_size", String(fileSize));
    startForm.append("access_token", accessToken);

    const startRes = await fetch(
      `https://graph-video.facebook.com/v21.0/${encodeURIComponent(pageId)}/videos`,
      {
        method: "POST",
        body: startForm,
      },
    );

    if (!startRes.ok) {
      const errText = await startRes.text();
      console.error("Facebook init upload failed", startRes.status, errText);
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json({ error: `Facebook upload init failed: ${errText}` }, 502);
    }

    const startData = await startRes.json() as {
      upload_session_id?: string;
      start_offset?: string;
      end_offset?: string;
      video_id?: string;
      [key: string]: unknown;
    };

    const uploadSessionId = startData.upload_session_id;
    const startOffset = parseInt((startData.start_offset as string) ?? "0", 10);
    const endOffset = parseInt((startData.end_offset as string) ?? "0", 10);

    if (!uploadSessionId) {
      console.error("No upload_session_id in Facebook response", startData);
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json(
        { error: `No upload_session_id: ${JSON.stringify(startData)}` },
        502,
      );
    }

    console.log("Facebook upload start offsets", {
      startOffset,
      endOffset,
      uploadSessionId,
    });

    // STEP B - Upload video chunk (single-chunk transfer)
    const transferForm = new FormData();
    transferForm.append("upload_phase", "transfer");
    transferForm.append("upload_session_id", uploadSessionId);
    transferForm.append("start_offset", "0");
    transferForm.append("video_file_chunk", new Blob([videoBytes]));

    const transferRes = await fetch(
      `https://graph-video.facebook.com/v21.0/${encodeURIComponent(pageId)}/videos`,
      {
        method: "POST",
        headers: {
          Authorization: `OAuth ${accessToken}`,
        },
        body: transferForm,
      },
    );

    if (!transferRes.ok) {
      const errText = await transferRes.text();
      console.error("Facebook video transfer failed", transferRes.status, errText);
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json({ error: `Facebook video upload failed: ${errText}` }, 502);
    }

    // STEP C - Finish upload
    const finishForm = new FormData();
    finishForm.append("upload_phase", "finish");
    finishForm.append("upload_session_id", uploadSessionId);
    finishForm.append("access_token", accessToken);
    finishForm.append("title", video.title || "Uploaded Video");
    finishForm.append("description", (post.caption || "").toString());

    const finishRes = await fetch(
      `https://graph-video.facebook.com/v21.0/${encodeURIComponent(pageId)}/videos`,
      {
        method: "POST",
        body: finishForm,
      },
    );

    if (!finishRes.ok) {
      const errText = await finishRes.text();
      console.error("Facebook finish upload failed", finishRes.status, errText);
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json({ error: `Facebook finish upload failed: ${errText}` }, 502);
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

    return json({ success: true, postId });
  } catch (err) {
    console.error("facebook-upload error", err);
    try {
      if (typeof postId === "string") {
        await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
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

