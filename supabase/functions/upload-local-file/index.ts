import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";
import { createRequestAuthorizer, createSessionLookup } from "../_shared/auth.ts";
import { buildUploadObjectKey, isValidIdempotencyKey, uploadExtension } from "../_shared/upload.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT");
const R2_ACCESS_KEY = Deno.env.get("R2_ACCESS_KEY");
const R2_SECRET_KEY = Deno.env.get("R2_SECRET_KEY");
const R2_BUCKET = Deno.env.get("R2_BUCKET");
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL")!;

const s3Client = (R2_ENDPOINT && R2_ACCESS_KEY && R2_SECRET_KEY && R2_BUCKET)
  ? new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
    })
  : null;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const authorize = createRequestAuthorizer({
  serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  cronApiKey: null,
  frontendApiKey: Deno.env.get("FRONTEND_API_KEY"),
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

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return json({ error: "Invalid form data" }, 400);
  }

  const file = formData.get("file") as File | null;
  const rawKey = formData.get("idempotency_key");
  const idempotencyKey =
    typeof rawKey === "string" && rawKey.length > 0 ? rawKey : null;
  const userId = auth.kind === "session" ? auth.userId : null;

  if (!file || !userId) {
    return json({ error: "File and user required" }, 400);
  }

  if (idempotencyKey && !isValidIdempotencyKey(idempotencyKey)) {
    return json({ error: "Invalid idempotency key" }, 400);
  }

  try {
    // Upload to R2 directly
    if (!s3Client) {
      return json({ error: "R2 configuration missing" }, 500);
    }

    const extension = uploadExtension(file.name);
    const objectName = idempotencyKey ?? crypto.randomUUID();
    const key = buildUploadObjectKey(userId, objectName, extension);
    const r2Url = `https://${R2_PUBLIC_URL}/${key}`;

    // A retry after an ambiguous failure must not create a second object:
    // the same key points at the same place, and the row of the first
    // attempt is returned instead of a new one.
    if (idempotencyKey) {
      const { data: existing } = await supabase
        .from("videos")
        .select("id")
        .eq("user_id", userId)
        .eq("file_url", r2Url)
        .limit(1)
        .maybeSingle();
      if (existing) {
        return json({
          success: true,
          videoId: existing.id,
          url: r2Url,
          filename: file.name,
          size: file.size,
        });
      }
    }

    const uploadUrl = await getSignedUrl(s3Client, new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: file.type,
    }), { expiresIn: 3600 });

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file.stream(),
      // @ts-ignore - duplex is required for streaming bodies
      duplex: "half",
    });

    if (!putRes.ok) {
      throw new Error(`R2 upload failed: ${putRes.status}`);
    }

    // Insert video record
    const { data: video, error: videoError } = await supabase
      .from("videos")
      .insert({
        user_id: userId,
        title: file.name,
        file_url: r2Url,
        media_type: file.type.startsWith("image/") ? "image" : "video",
      })
      .select("id")
      .single();

    if (videoError || !video) {
      throw new Error(`Failed to create video record: ${videoError?.message}`);
    }

    return json({
      success: true,
      videoId: video.id,
      url: r2Url,
      filename: file.name,
      size: file.size,
    });
  } catch (err) {
    // The detail stays in the log: the client gets a readable message, not
    // the internals of the failure.
    console.error("Upload error:", err);
    return json({ error: "The upload failed. Please try again." }, 500);
  }
});
