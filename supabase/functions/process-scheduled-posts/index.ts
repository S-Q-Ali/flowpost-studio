import { createClient } from "npm:@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for process-scheduled-posts");
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  const cronKey = Deno.env.get("CRON_API_KEY");
  const validKeys = [Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")]
    .concat(cronKey ? [cronKey] : []);
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
    // A row stays "processing" only while the function that claimed it runs.
    // One that has been processing for half an hour was cut off — the
    // platform may or may not have received it — and blocks the queue forever.
    const staleBefore = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: reaped, error: reapError } = await supabase
      .from("posts")
      .update({ status: "failed" })
      .eq("status", "processing")
      .lt("scheduled_at", staleBefore)
      .select("id");

    if (reapError) {
      console.error("Failed to reap stale processing posts", reapError);
    } else if ((reaped ?? []).length > 0) {
      console.log(`Marked ${(reaped ?? []).length} stale processing posts as failed`);
    }

    const now = new Date().toISOString();
    const { data: posts, error: fetchError } = await supabase
      .from("posts")
      .select("id, platform, post_type")
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .limit(10);

    if (fetchError) {
      console.error("Failed to fetch scheduled posts", fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message, processed: 0 }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const scheduledPosts = posts ?? [];
    const supabaseUrl = SUPABASE_URL!;
    const serviceRoleKey = SUPABASE_SERVICE_ROLE_KEY!;

    let processed = 0;
    for (const post of scheduledPosts) {
    let functionName = "";
      if ((post.platform === "instagram" || post.platform === "facebook") && (post as any).post_type === "story") {
        functionName = "post-story";
      } else if (post.platform === "youtube") {
        functionName = "youtube-upload";
      } else if (post.platform === "facebook") {
        functionName = "facebook-upload";
      } else if (post.platform === "instagram") {
        functionName = "instagram-upload";
      } else if (post.platform === "tiktok") {
        functionName = "tiktok-upload";
      } else if (post.platform === "linkedin") {
        functionName = "linkedin-upload";
      } else {
        console.log(`Skipping scheduled post ${post.id} for platform ${post.platform}`);
        continue;
      }

      // Claim the row before calling the function. The status check in the
      // filter makes the claim atomic: two overlapping cron runs cannot both
      // publish the same post.
      const { data: claimed, error: claimError } = await supabase
        .from("posts")
        .update({ status: "processing" })
        .eq("id", post.id)
        .eq("status", "scheduled")
        .select("id");

      if (claimError) {
        console.error(`Failed to claim post ${post.id}`, claimError);
        continue;
      }
      if (!claimed || claimed.length === 0) {
        continue;
      }

      const res = await fetch(
        `${supabaseUrl}/functions/v1/${functionName}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
          },
          body: JSON.stringify({ postId: post.id }),
        },
      );

      if (res.ok || res.status === 409) {
        processed++;
      } else {
        // A function that reached the platform writes "published" itself; a
        // lost answer must not turn that row into a failure.
        await supabase
          .from("posts")
          .update({ status: "failed" })
          .eq("id", post.id)
          .neq("status", "published");
        console.error(`${functionName} failed for post ${post.id}`, await res.text());
      }
    }

    return new Response(
      JSON.stringify({ processed, total: scheduledPosts.length }),
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



