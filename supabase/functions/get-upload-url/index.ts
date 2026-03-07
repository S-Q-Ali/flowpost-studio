import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT");
const R2_ACCESS_KEY = Deno.env.get("R2_ACCESS_KEY");
const R2_SECRET_KEY = Deno.env.get("R2_SECRET_KEY");
const R2_BUCKET = Deno.env.get("R2_BUCKET");
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL");

if (!R2_ENDPOINT || !R2_ACCESS_KEY || !R2_SECRET_KEY || !R2_BUCKET || !R2_PUBLIC_URL) {
  console.error("Missing required R2_* environment variables for get-upload-url function");
}

const r2Client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY!,
    secretAccessKey: R2_SECRET_KEY!,
  },
});

interface GetUploadUrlBody {
  fileName: string;
  fileType: string;
  userId: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  const validKeys = [Deno.env.get("SB_ANON_KEY"), Deno.env.get("SB_SERVICE_ROLE_KEY")];
  const token = authHeader?.replace("Bearer ", "");
  if (!token || !validKeys.includes(token)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as Partial<GetUploadUrlBody>;
    const { fileName, fileType, userId } = body;

    if (!fileName || !fileType || !userId) {
      return new Response(
        JSON.stringify({ error: "fileName, fileType and userId are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const objectKey = `${userId}/${Date.now()}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET!,
      Key: objectKey,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(r2Client, command, {
      expiresIn: 60 * 10, // 10 minutes
    });

    const publicUrl = `${R2_PUBLIC_URL}/${objectKey}`;

    return new Response(
      JSON.stringify({ uploadUrl, publicUrl }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error generating R2 upload URL:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate upload URL" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

