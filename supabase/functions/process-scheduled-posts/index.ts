import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SB_URL = Deno.env.get("SB_URL");
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY");

if (!SB_URL || !SB_SERVICE_ROLE_KEY) {
  console.error("Missing SB_URL or SB_SERVICE_ROLE_KEY for process-scheduled-posts");
}

const supabase = createClient(SB_URL!, SB_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

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

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const now = new Date().toISOString();
    const { data: posts, error: fetchError } = await supabase
      .from("posts")
      .select("id, platform")
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .eq("platform", "youtube");

    if (fetchError) {
      console.error("Failed to fetch scheduled posts", fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message, processed: 0 }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const list = posts ?? [];
    const supabaseUrl = SB_URL!;
    const serviceRoleKey = SB_SERVICE_ROLE_KEY!;

    let processed = 0;
    for (const post of list) {
      const res = await fetch(supabaseUrl + "/functions/v1/youtube-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + serviceRoleKey,
        },
        body: JSON.stringify({ postId: post.id }),
      });
      if (res.ok) {
        processed++;
      } else {
        console.error(`youtube-upload failed for post ${post.id}`, await res.text());
      }
    }

    return new Response(
      JSON.stringify({ processed, total: list.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("process-scheduled-posts error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error", processed: 0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
