import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { getGoogleAccessToken } from "../_shared/google-jwt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for update-sheet-status");
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getColumnLetter(colIndex: number): string {
  let result = "";
  while (colIndex >= 0) {
    result = String.fromCharCode((colIndex % 26) + 65) + result;
    colIndex = Math.floor(colIndex / 26) - 1;
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token || token !== SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let postId: string;
  let status: "posted" | "failed";

  try {
    const body = await req.json();
    postId = body?.postId;
    status = body?.status === "failed" ? "failed" : "posted";
    if (!postId) return json({ error: "postId required" }, 400);
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  try {
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("metadata")
      .eq("id", postId)
      .single();

    if (postError || !post) {
      return json({ error: "Post not found" }, 404);
    }

    const metadata = (post.metadata as Record<string, unknown>) || {};
    const sheetId = metadata.sheet_id as string;
    const sheetRowIndex = metadata.sheet_row_index as number;
    const sheetColIndex = metadata.sheet_col_index as number;

    if (!sheetId || !sheetRowIndex || sheetColIndex === undefined) {
      console.log("No sheet info in post metadata, skipping update");
      return json({ success: true, message: "No sheet info to update" });
    }

    const googleToken = await getGoogleAccessToken();

    const colLetter = getColumnLetter(sheetColIndex);
    const range = `Sheet1!${colLetter}${sheetRowIndex}`;
    
    const statusValue = status === "failed" ? "failed" : "posted";

    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
        range,
      )}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${googleToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [[statusValue]] }),
      },
    );

    if (!updateRes.ok) {
      const errorText = await updateRes.text();
      console.error("Failed to update sheet status", updateRes.status, errorText);
      return json({ error: `Failed to update sheet: ${updateRes.status}` }, 502);
    }

    console.log(`Sheet updated to "${statusValue}" for row ${sheetRowIndex}`);
    return json({ success: true, status: statusValue });
  } catch (err) {
    console.error("update-sheet-status error", err);
    return json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});


