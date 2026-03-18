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

type GetUploadUrlResponse = {
  uploadUrl: string;
  publicUrl: string;
};

async function uploadDriveVideoToR2(
  driveUrl: string,
  googleToken: string,
  videoId: string,
  title: string,
): Promise<string> {
  const { data: uploadData, error } = await supabase.functions.invoke<
    GetUploadUrlResponse
  >(
    "get-upload-url",
    {
      body: {
        fileName: `${title || videoId}.mp4`,
        fileType: "video/mp4",
        userId: "00000000-0000-0000-0000-000000000000",
      },
    },
  );

  if (error || !uploadData?.uploadUrl || !uploadData?.publicUrl) {
    throw new Error(error?.message || "Failed to get R2 upload URL");
  }

  const driveRes = await fetch(driveUrl, {
    headers: { Authorization: `Bearer ${googleToken}` },
  });
  if (!driveRes.ok || !driveRes.body) {
    throw new Error(`Drive fetch failed: ${driveRes.status}`);
  }

  const putRes = await fetch(uploadData.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4" },
    body: driveRes.body,
    // @ts-ignore - duplex needed for streaming
    duplex: "half",
  });

  if (!putRes.ok) {
    throw new Error(`R2 upload failed: ${putRes.status}`);
  }

  return uploadData.publicUrl;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildMultipartStream(params: {
  fields: Array<{ name: string; value: string }>;
  file: { fieldName: string; filename: string; contentType: string; stream: ReadableStream<Uint8Array> };
}) {
  const boundary = `----flowpost-${crypto.randomUUID()}`;
  const encoder = new TextEncoder();

  const fileHeader = [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="${params.file.fieldName}"; filename="${params.file.filename}"\r\n`,
    `Content-Type: ${params.file.contentType}\r\n\r\n`,
  ].join("");

  const fileFooter = `\r\n--${boundary}--\r\n`;

  const prefixParts: Uint8Array[] = [];
  for (const f of params.fields) {
    prefixParts.push(
      encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"\r\n\r\n${f.value}\r\n`,
      ),
    );
  }
  prefixParts.push(encoder.encode(fileHeader));

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of prefixParts) controller.enqueue(p);

      const reader = params.file.stream.getReader();
      const pump = (): void => {
        reader.read().then(({ done, value }) => {
          if (done) {
            controller.enqueue(encoder.encode(fileFooter));
            controller.close();
            return;
          }
          if (value) controller.enqueue(value);
          pump();
        }).catch((err) => controller.error(err));
      };
      pump();
    },
  });

  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body,
  };
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

    // Support either:
    // - Traditional flow: video.file_url points to R2/public storage
    // - Workflow flow: direct Google Drive download URL + access token
    let videoUrl = video.file_url as string;

    if (
      (driveDownloadUrl || videoUrl.includes("googleapis.com")) &&
      googleAccessToken
    ) {
      const driveSource = driveDownloadUrl || videoUrl;
      console.log("Uploading Drive video to R2 first...");

      videoUrl = await uploadDriveVideoToR2(
        driveSource,
        googleAccessToken,
        post.video_id,
        video.title || post.video_id,
      );

      await supabase
        .from("videos")
        .update({ file_url: videoUrl })
        .eq("id", post.video_id);

      console.log("R2 upload complete, URL:", videoUrl);
    }

    const headRes = await fetch(videoUrl, {
      method: "HEAD",
      headers: {},
    });
    if (!headRes.ok) {
      console.error("Failed to fetch video headers", headRes.status);
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json({ error: "Failed to fetch video metadata" }, 502);
    }

    const fileSizeStr = headRes.headers.get("content-length") || "0";
    const fileSize = parseInt(fileSizeStr, 10);
    const contentType = headRes.headers.get("content-type") || "video/mp4";
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json(
        { error: "Unable to determine video content-length for upload" },
        502,
      );
    }

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

    const videoStreamRes = await fetch(videoUrl, {
      headers: {},
    });
    if (!videoStreamRes.ok || !videoStreamRes.body) {
      const status = videoStreamRes.status || 0;
      console.error("Failed to stream video", status);
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json({ error: "Failed to stream video file" }, 502);
    }

    // STEP B - Upload video chunk (single-chunk transfer) via streaming multipart form-data
    const transferMultipart = buildMultipartStream({
      fields: [
        { name: "upload_phase", value: "transfer" },
        { name: "upload_session_id", value: uploadSessionId },
        { name: "start_offset", value: "0" },
      ],
      file: {
        fieldName: "video_file_chunk",
        filename: "video.mp4",
        contentType,
        stream: videoStreamRes.body,
      },
    });

    const transferRes = await fetch(
      `https://graph-video.facebook.com/v21.0/${encodeURIComponent(pageId)}/videos`,
      {
        method: "POST",
        headers: {
          Authorization: `OAuth ${accessToken}`,
          "Content-Type": transferMultipart.contentType,
        },
        body: transferMultipart.body,
        // @ts-ignore - duplex is required for streaming bodies
        duplex: "half",
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

