import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { File } from "npm:megajs";
import { decrypt } from "../_shared/crypto.ts";
import { fileProxyUrl } from "../_shared/get-file-token.ts";
import { updateSheetStatus } from "../_shared/sheet-status.ts";
import { createRequestAuthorizer, createSessionLookup } from "../_shared/auth.ts";
import { checkPostAccess, claimPost, settlePost, type HeldClaim } from "../_shared/post-access.ts";
import { isAllowedMediaUrl, isGoogleApiUrl } from "../_shared/url-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for youtube-upload");
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

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
      .select("id, video_id, account_id, caption, hashtags, status, platform, user_id, contains_altered_content, metadata")
      .eq("id", postId)
      .single();

    if (postError || !post) {
      return json({ error: "Post not found" }, 404);
    }

    const access = checkPostAccess(auth, post);
    if (!access.ok) return json({ error: access.error }, access.status);

    if (post.platform !== "youtube") {
      return json({ error: "Post is not for YouTube" }, 400);
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

    if ((video as any).media_type === "image") {
      await fail();
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
      await fail();
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
      sourceUrl = await fileProxyUrl({ megaFileName, megaAccountId }, post.user_id);
      const headRes = await fetch(sourceUrl, { method: "HEAD" });
      const cl = headRes.headers.get("content-length");
      if (cl) contentLength = cl;
    } else if (megaUrl) {
      const megaFile = File.fromURL(megaUrl);
      await megaFile.loadAttributes();
      if (megaFile.size === undefined) throw new Error("Mega file has no size");
      contentLength = megaFile.size.toString();
      contentType = "video/mp4";
      sourceUrl = await fileProxyUrl({ megaUrl }, post.user_id);
    } else {
      sourceUrl = driveDownloadUrl || video.file_url;

      if (!isAllowedMediaUrl(sourceUrl)) {
        console.error("Blocked fetch to disallowed URL:", sourceUrl);
        return json({ error: "Invalid video source URL" }, 400);
      }

      const headRes = await fetch(sourceUrl, {
        method: "HEAD",
        headers: isGoogleApiUrl(sourceUrl) && googleAccessToken
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
      await fail();
      return json({ error: `YouTube upload failed: ${errText}` }, 502);
    }

    const uploadUrl = initRes.headers.get("Location");
    if (!uploadUrl) {
      await fail();
      return json({ error: "No upload URL from YouTube" }, 502);
    }

    const videoStream = await fetch(sourceUrl, {
      headers: !megaUrl && isGoogleApiUrl(sourceUrl) && googleAccessToken
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
      // @ts-expect-error duplex required for streaming request body
      duplex: "half",
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error("YouTube PUT upload failed", uploadRes.status, errText);
      await fail();
      return json({ error: `YouTube upload failed: ${errText}` }, 502);
    }

    const settled = await settlePost(supabase, claim, {
      status: "published",
      published_at: new Date().toISOString(),
      claimed_at: null,
    });

    if (!settled) {
      console.error(`youtube-upload: post ${postId} was re-claimed elsewhere`);
      return json({ error: "Upload succeeded but the post was taken over" }, 409);
    }

    await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "posted", googleAccessToken);

    return json({ success: true, postId });
  } catch (err) {
    console.error("youtube-upload error", err);
    try {
      // An error before the claim leaves the row live for the next attempt.
      if (held) {
        await settlePost(supabase, held, { status: "failed", claimed_at: null });
        await updateSheetStatus(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, postId, "failed", googleAccessToken);
      }
    } catch (cleanupErr) {
      console.error("youtube-upload: failed to mark post failed", cleanupErr);
    }
    return json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      500,
    );
  }
});



