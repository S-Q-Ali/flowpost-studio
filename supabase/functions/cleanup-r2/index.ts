import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT");
const R2_ACCESS_KEY = Deno.env.get("R2_ACCESS_KEY");
const R2_SECRET_KEY = Deno.env.get("R2_SECRET_KEY");
const R2_BUCKET = Deno.env.get("R2_BUCKET");
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL");
const SB_URL = Deno.env.get("SB_URL");
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY");
const SB_ANON_KEY = Deno.env.get("SB_ANON_KEY");

if (
  !R2_ENDPOINT || !R2_ACCESS_KEY || !R2_SECRET_KEY ||
  !R2_BUCKET || !R2_PUBLIC_URL || !SB_URL || !SB_SERVICE_ROLE_KEY || !SB_ANON_KEY
) {
  console.error("Missing required environment variables for cleanup-r2");
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

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(message),
  );
}

async function hmacHex(key: ArrayBuffer, message: string): Promise<string> {
  const sig = await hmac(key, message);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const kDate = await hmac(
    new TextEncoder().encode("AWS4" + secretKey),
    dateStamp,
  );
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

async function deleteFromR2(fileKey: string): Promise<boolean> {
  const endpoint = R2_ENDPOINT!;
  const accessKey = R2_ACCESS_KEY!;
  const secretKey = R2_SECRET_KEY!;
  const bucket = R2_BUCKET!;

  const url = `${endpoint}/${bucket}/${fileKey}`;
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split("/");
  // Remove empty first element and bucket name
  const keyParts = pathParts.slice(2).map((p) => decodeURIComponent(p)); // skip '' and bucket
  const decodedKey = keyParts.join("/");

  // For AWS Signature V4, encode each path segment but preserve forward slashes
  const encodedKey = decodedKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const encodedUrl = `${endpoint}/${bucket}/${encodedKey}`;
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const emptyHash = await sha256("");

  const method = "DELETE";
  const canonicalUri = `/${bucket}/${encodedKey}`;
  const canonicalQueryString = "";
  const host = new URL(endpoint).host;
  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${emptyHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const payloadHash = emptyHash;

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join("\n");

  const signingKey = await getSigningKey(
    secretKey,
    dateStamp,
    "auto",
    "s3",
  );
  const signature = await hmacHex(signingKey, stringToSign);

  const authHeader =
    `AWS4-HMAC-SHA256 ` +
    `Credential=${accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, ` +
    `Signature=${signature}`;

  const res = await fetch(encodedUrl, {
    method: "DELETE",
    headers: {
      "x-amz-date": amzDate,
      "x-amz-content-sha256": emptyHash,
      Authorization: authHeader,
    },
  });

  if (!res.ok) {
    console.error("R2 delete failed", fileKey, res.status, await res.text());
  }

  return res.ok;
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

  try {
    const cutoff = new Date(
      Date.now() - 48 * 60 * 60 * 1000,
    ).toISOString();

    const { data: oldVideos, error: fetchError } = await supabase
      .from("videos")
      .select("id, file_url, title, uploaded_at")
      .lt("uploaded_at", cutoff);

    if (fetchError) {
      console.error("Failed to fetch old videos", fetchError);
      return json({ error: fetchError.message }, 500);
    }

    const videos = oldVideos ?? [];
    let deletedCount = 0;
    const errors: string[] = [];

    for (const video of videos as any[]) {
      try {
        if (!video.file_url || !R2_PUBLIC_URL) {
          continue;
        }
        const prefix = `${R2_PUBLIC_URL}/`;
        const fileKey = String(video.file_url).startsWith(prefix)
          ? String(video.file_url).slice(prefix.length)
          : String(video.file_url);

        const deleted = await deleteFromR2(fileKey);
        if (!deleted) {
          errors.push(
            `Failed to delete R2 object for video ${video.id} (${video.title})`,
          );
          continue;
        }

        // Delete related posts first (FK), then video
        const { error: postsError } = await supabase
          .from("posts")
          .delete()
          .eq("video_id", video.id);
        if (postsError) {
          errors.push(
            `Failed to delete posts for video ${video.id}: ${postsError.message}`,
          );
          continue;
        }

        const { error: videoError } = await supabase
          .from("videos")
          .delete()
          .eq("id", video.id);
        if (videoError) {
          errors.push(
            `Failed to delete video ${video.id}: ${videoError.message}`,
          );
          continue;
        }

        deletedCount++;
        console.log("Deleted video:", video.title ?? video.id);
      } catch (err) {
        console.error("Error deleting video", video.id, err);
        errors.push(
          `Error deleting video ${video.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return json({ deleted: deletedCount, errors });
  } catch (err) {
    console.error("cleanup-r2 error", err);
    return json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});

