import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { File } from "npm:megajs";
import { encrypt, decrypt } from "../_shared/crypto.ts";
import { updateSheetStatus } from "../_shared/sheet-status.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL")!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for youtube-upload");
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ALLOWED_DOMAINS = [
  "www.googleapis.com",
  "drive.google.com",
  R2_PUBLIC_URL,
  "storage.googleapis.com",
  "youtube.googleapis.com",
  "mega.nz",
  SUPABASE_URL ? new URL(SUPABASE_URL).hostname : "",
].filter(Boolean);

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

function isTokenExpired(tokenExpiry: string | null): boolean {
  if (!tokenExpiry) return true;
  return new Date(tokenExpiry) <= new Date();
}

async function refreshYouTubeToken(accountId: string): Promise<string> {
  const url = `${SUPABASE_URL}/functions/v1/youtube-auth?action=refresh&account_id=${encodeURIComponent(accountId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }
  const data = await res.json();
  if (!data?.success) throw new Error("Token refresh returned no success");
  return accountId;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  const validKeys = [Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), Deno.env.get("SUPABASE_ANON_KEY"), Deno.env.get("FRONTEND_API_KEY")].filter(Boolean);
  const token = authHeader?.replace("Bearer ", "");
  if (!token || !validKeys.includes(token)) {
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
      .select("id, video_id, account_id, caption, hashtags, status, platform, contains_altered_content, metadata")
      .eq("id", postId)
      .single();

    if (postError || !post) {
      return json({ error: "Post not found" }, 404);
    }
    if (post.platform !== "youtube") {
      return json({ error: "Post is not for YouTube" }, 400);
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

    if ((video as any).media_type === "image") {
      return json({ error: "YouTube does not support image posts" }, 400);
    }

    const { data: account, error: accountError } = await supabase
      .from("connected_accounts")
      .select("account_id, access_token, refresh_token, token_expiry")
      .eq("platform", "youtube")
      .eq("account_id", post.account_id)
      .eq("is_connected", true)
      .single();

    if (accountError || !account?.access_token) {
      return json({ error: "Connected account not found" }, 404);
    }

    let accessToken = await decrypt(account.access_token);
    if (isTokenExpired(account.token_expiry) && account.refresh_token) {
      await refreshYouTubeToken(post.account_id);
      const { data: updated } = await supabase
        .from("connected_accounts")
        .select("access_token")
        .eq("account_id", post.account_id)
        .eq("platform", "youtube")
        .single();
      accessToken = updated?.access_token ? await decrypt(updated.access_token) : accessToken;
    }

    // Support either:
    // - Mega file URL → get-file proxy
    // - Drive download URL + token → get-file proxy or direct Drive fetch
    // - video.file_url → public/R2 storage
    let sourceUrl: string;
    let contentLength: string;
    let contentType: string;

    if (megaFileName && megaAccountId) {
      contentLength = "0";
      contentType = "video/mp4";
      const proxyToken = await encrypt(JSON.stringify({
        megaFileName,
        megaAccountId,
        exp: Date.now() + 15 * 60 * 1000,
      }));
      sourceUrl = `${SUPABASE_URL}/functions/v1/get-file?token=${encodeURIComponent(proxyToken)}`;
      const headRes = await fetch(sourceUrl, { method: "HEAD" });
      const cl = headRes.headers.get("content-length");
      if (cl) contentLength = cl;
    } else if (megaUrl) {
      const megaFile = File.fromURL(megaUrl);
      await megaFile.loadAttributes();
      contentLength = megaFile.size.toString();
      contentType = "video/mp4";
      const proxyToken = await encrypt(JSON.stringify({
        megaUrl,
        exp: Date.now() + 15 * 60 * 1000,
      }));
      sourceUrl = `${SUPABASE_URL}/functions/v1/get-file?token=${encodeURIComponent(proxyToken)}`;
    } else {
      sourceUrl = driveDownloadUrl || video.file_url;

      if (!validateUrl(sourceUrl)) {
        console.error("Blocked fetch to disallowed URL:", sourceUrl);
        return json({ error: "Invalid video source URL" }, 400);
      }

      const headRes = await fetch(sourceUrl, {
        method: "HEAD",
        headers: sourceUrl.includes("googleapis.com") && googleAccessToken
          ? { Authorization: `Bearer ${googleAccessToken}` }
          : {},
      });
      if (!headRes.ok) {
        throw new Error(`Failed to fetch video headers: ${headRes.status}`);
      }

      contentLength = headRes.headers.get("content-length") || "0";
      contentType = headRes.headers.get("content-type") || "video/mp4";
    }

    const tags: string[] = [];
    if (post.hashtags) {
      const parts = post.hashtags.split(/[\s,]+/).map((s: string) => s.trim().replace(/^#/, ""));
      tags.push(...parts.filter(Boolean));
    }

    const metadata = {
      snippet: {
        title: (post.metadata as any)?.youtube_video_title || video.title || "Uploaded Video",
        description: (post.caption || "").slice(0, 5000),
        tags,
        categoryId: "22",
      },
      status: {
        privacyStatus: "public" as const,
        selfDeclaredMadeForKids: false,
        containsSyntheticMedia: post.contains_altered_content ?? false,
      },
    };

    const initRes = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": contentLength,
          "X-Upload-Content-Type": contentType,
        },
        body: JSON.stringify(metadata),
      },
    );

    if (!initRes.ok) {
      const errText = await initRes.text();
      console.error("YouTube init upload failed", initRes.status, errText);
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json({ error: `YouTube upload failed: ${errText}` }, 502);
    }

    const uploadUrl = initRes.headers.get("Location");
    if (!uploadUrl) {
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json({ error: "No upload URL from YouTube" }, 502);
    }

    const videoStream = await fetch(sourceUrl, {
      headers: !megaUrl && sourceUrl.includes("googleapis.com") && googleAccessToken
        ? { Authorization: `Bearer ${googleAccessToken}` }
        : {},
    });
    if (!videoStream.ok) {
      throw new Error(`Failed to fetch video: ${videoStream.status}`);
    }

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": contentLength,
        "Content-Type": contentType,
      },
      body: videoStream.body,
      // @ts-ignore - duplex is required for streaming bodies
      duplex: "half",
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error("YouTube PUT upload failed", uploadRes.status, errText);
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json({ error: `YouTube upload failed: ${errText}` }, 502);
    }

    const { error: updateError } = await supabase
      .from("posts")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", postId);

    if (updateError) {
      console.error("Failed to update post status", updateError);
      return json({ error: "Upload succeeded but status update failed" }, 500);
    }

    await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "posted", googleAccessToken);

    return json({ success: true, postId });
  } catch (err) {
    console.error("youtube-upload error", err);
    try {
      if (typeof postId === "string") {
        await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
        await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "failed", googleAccessToken);
      }
    } catch (_) {}
    return json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      500,
    );
  }
});



