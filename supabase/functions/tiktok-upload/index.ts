import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SB_URL = Deno.env.get("SB_URL");
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY");
const TIKTOK_CLIENT_KEY = Deno.env.get("TIKTOK_CLIENT_KEY");

if (!SB_URL || !SB_SERVICE_ROLE_KEY) {
  console.error("Missing SB_URL or SB_SERVICE_ROLE_KEY for tiktok-upload");
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

const ALLOWED_DOMAINS = [
  "open.tiktokapis.com",
  "pub-1d4bcccec36046308147315db8637398.r2.dev",
  "drive.google.com",
  "www.googleapis.com",
];

function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_DOMAINS.some(
      (domain) => parsed.hostname === domain || parsed.hostname.endsWith("." + domain),
    );
  } catch {
    return false;
  }
}

async function refreshTikTokToken(openId: string): Promise<string> {
  const url = `${SB_URL}/functions/v1/tiktok-auth?action=refresh&open_id=${encodeURIComponent(openId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
      apikey: SB_SERVICE_ROLE_KEY!,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }
  return openId;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  const validKeys = [SB_SERVICE_ROLE_KEY];
  const token = authHeader?.replace("Bearer ", "");
  if (!token || !validKeys.includes(token)) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await req.json().catch(() => null)) as { postId?: string } | null;
    if (!body?.postId) {
      return json({ error: "postId is required" }, 400);
    }

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, account_id, caption, video_id, metadata")
      .eq("id", body.postId)
      .single();

    if (postError || !post) {
      return json({ error: `Post not found: ${postError?.message}` }, 404);
    }

    const accountId = post.account_id;
    if (!accountId) {
      return json({ error: "Post has no account_id" }, 400);
    }

    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("id, file_url, media_type, video_size")
      .eq("id", post.video_id)
      .single();

    if (videoError || !video) {
      return json({ error: `Video not found: ${videoError?.message}` }, 404);
    }

    const mediaType = (video.media_type as string) ?? "video";
    if (mediaType === "image") {
      await supabase
        .from("posts")
        .update({ status: "failed" })
        .eq("id", post.id);
      return json({ error: "TikTok does not support image uploads" }, 400);
    }

    const { data: account, error: accountError } = await supabase
      .from("connected_accounts")
      .select("id, access_token, token_expiry, metadata, is_connected, platform")
      .eq("user_id", "00000000-0000-0000-0000-000000000000")
      .eq("platform", "tiktok")
      .eq("account_id", accountId)
      .maybeSingle();

    if (accountError || !account) {
      return json({ error: "TikTok account not connected" }, 404);
    }

    if (!account.is_connected) {
      await supabase
        .from("posts")
        .update({ status: "failed" })
        .eq("id", post.id);
      return json({ error: "TikTok account is disconnected" }, 400);
    }

    if (!account.access_token) {
      await supabase
        .from("posts")
        .update({ status: "failed" })
        .eq("id", post.id);
      return json({ error: "Missing TikTok access token" }, 400);
    }

    let accessToken = account.access_token;

    const tokenExpiry = account.token_expiry ? new Date(account.token_expiry) : null;
    if (!tokenExpiry || tokenExpiry <= new Date()) {
      console.log("TikTok token expired, refreshing");
      await refreshTikTokToken(accountId);
      const { data: refreshed } = await supabase
        .from("connected_accounts")
        .select("access_token, token_expiry")
        .eq("user_id", "00000000-0000-0000-0000-000000000000")
        .eq("platform", "tiktok")
        .eq("account_id", accountId)
        .single();
      if (refreshed?.access_token) {
        accessToken = refreshed.access_token;
      } else {
        await supabase
          .from("posts")
          .update({ status: "failed" })
          .eq("id", post.id);
        return json({ error: "Token refresh did not return new access token" }, 500);
      }
    }

    const fileUrl = video.file_url;
    if (!fileUrl || !validateUrl(fileUrl)) {
      await supabase
        .from("posts")
        .update({ status: "failed" })
        .eq("id", post.id);
      return json({ error: "Invalid video URL — must be on R2 / Google Drive" }, 400);
    }

    const caption = (post.caption ?? "").slice(0, 2200);

    const sourceInfo: Record<string, unknown> = {
      source: "FILE_URL",
      video_url: fileUrl,
    };
    if (typeof video.video_size === "number" && video.video_size > 0) {
      sourceInfo.video_size = video.video_size;
    }

    const body_payload = {
      post_info: {
        title: caption,
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: sourceInfo,
      post_mode: "DIRECT_POST",
    };

    const initRes = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify(body_payload),
      },
    );

    const initData = await initRes.json().catch(() => ({}));
    if (!initRes.ok) {
      const errMsg = JSON.stringify(initData);
      await supabase
        .from("posts")
        .update({ status: "failed" })
        .eq("id", post.id);
      return json({ error: `TikTok publish init failed: ${errMsg}` }, initRes.status);
    }

    if (initData?.error?.code) {
      const errMsg = JSON.stringify(initData.error);
      await supabase
        .from("posts")
        .update({ status: "failed" })
        .eq("id", post.id);
      return json({ error: `TikTok publish init error: ${errMsg}` }, 400);
    }

    const publishId = initData?.data?.publish_id;
    if (!publishId) {
      await supabase
        .from("posts")
        .update({ status: "failed" })
        .eq("id", post.id);
      return json({ error: "TikTok did not return publish_id" }, 500);
    }

    await supabase
      .from("posts")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        metadata: {
          ...(post.metadata as any ?? {}),
          tiktok_publish_id: publishId,
        },
      })
      .eq("id", post.id);

    return json({ success: true, publish_id: publishId });
  } catch (err) {
    console.error("tiktok-upload error", err);
    return json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});
