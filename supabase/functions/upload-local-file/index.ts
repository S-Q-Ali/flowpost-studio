import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3";
import { createRequestAuthorizer, createSessionLookup } from "../_shared/auth.ts";
import { readSecrets, SecretProblem } from "../_shared/secrets.ts";
import {
  buildUploadObjectKey,
  checkUpload,
  isValidIdempotencyKey,
  uploadExtension,
} from "../_shared/upload.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const R2_NAMES = [
  "R2_ENDPOINT",
  "R2_ACCESS_KEY",
  "R2_SECRET_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
] as const;

interface Bucket {
  client: S3Client;
  bucket: string;
  publicUrl: string;
}

/**
 * The bucket this deployment writes to, from the guided setup when it has one
 * there and from the edge-function secrets otherwise. Read per request so a
 * key saved in the wizard is used by the very next upload.
 */
async function r2Bucket(): Promise<Bucket> {
  const values = await readSecrets(supabase, [...R2_NAMES]);
  return {
    client: new S3Client({
      region: "auto",
      endpoint: values.R2_ENDPOINT,
      credentials: {
        accessKeyId: values.R2_ACCESS_KEY,
        secretAccessKey: values.R2_SECRET_KEY,
      },
    }),
    bucket: values.R2_BUCKET,
    publicUrl: values.R2_PUBLIC_URL,
  };
}

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

  const check = checkUpload(file.size, file.type);
  if (!check.ok) {
    return json({ error: check.error }, check.status);
  }

  let bucket: Bucket;
  try {
    bucket = await r2Bucket();
  } catch (err) {
    // The "nothing is set for this name" text tells the operator where to
    // look; any other failure is ours to log, not to show.
    if (err instanceof SecretProblem) return json({ error: err.message }, 500);
    console.error("R2 configuration read failed", err);
    return json({ error: "R2 configuration missing" }, 500);
  }

  try {
    const extension = uploadExtension(file.name);
    const objectName = idempotencyKey ?? crypto.randomUUID();
    const key = buildUploadObjectKey(userId, objectName, extension);
    const r2Url = `https://${bucket.publicUrl}/${key}`;

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

    const fileBytes = new Uint8Array(await file.arrayBuffer());
    await bucket.client.send(
      new PutObjectCommand({
        Bucket: bucket.bucket,
        Key: key,
        ContentType: file.type,
        ContentLength: file.size,
        Body: fileBytes,
      }),
    );

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
    // Return the actual error message so the operator and user can see why the upload failed
    console.error("Upload error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: `Upload error: ${message}` }, 500);
  }
});
