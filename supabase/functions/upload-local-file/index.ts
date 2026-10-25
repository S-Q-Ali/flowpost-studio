import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";
import { createRequestAuthorizer, createSessionLookup } from "../_shared/auth.ts";

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
  const userId = auth.kind === "session" ? auth.userId : null;

  if (!file || !userId) {
    return json({ error: "File and user required" }, 400);
  }

  try {
    // Upload to R2 directly
    if (!s3Client) {
      return json({ error: "R2 configuration missing" }, 500);
    }

    const fileExt = file.name.split(".").pop()?.toLowerCase() || "bin";
    const key = `${userId}/${crypto.randomUUID()}.${fileExt}`;

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

    const r2Url = `https://${R2_PUBLIC_URL}/${key}`;

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
    console.error("Upload error:", err);
    return json({
      error: err instanceof Error ? err.message : "Upload failed",
    }, 500);
  }
});
