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

const STALE_AFTER_MS = 30 * 60 * 1000;
const BATCH_SIZE = 10;

/** The edge function that publishes one post, or null for an unknown platform. */
function publishFunction(platform: string, postType: string | null): string | null {
  if ((platform === "instagram" || platform === "facebook") && postType === "story") {
    return "post-story";
  }
  switch (platform) {
    case "youtube":
      return "youtube-upload";
    case "facebook":
      return "facebook-upload";
    case "instagram":
      return "instagram-upload";
    case "tiktok":
      return "tiktok-upload";
    case "linkedin":
      return "linkedin-upload";
    default:
      return null;
  }
}

/** Calls the publisher and records a failure, so the row never sticks. */
async function dispatch(postId: string, functionName: string): Promise<boolean> {
  const serviceRoleKey = SUPABASE_SERVICE_ROLE_KEY!;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({ postId }),
    });

    if (res.ok || res.status === 409) return true;

    // A function that reached the platform writes "published" itself; a lost
    // answer must not turn that row into a failure.
    await supabase
      .from("posts")
      .update({ status: "failed" })
      .eq("id", postId)
      .neq("status", "published");
    console.error(`${functionName} failed for post ${postId}`, await res.text());
    return false;
  } catch (err) {
    console.error(`${functionName} did not answer for post ${postId}`, err);
    await supabase
      .from("posts")
      .update({ status: "failed" })
      .eq("id", postId)
      .neq("status", "published");
    return false;
  }
}

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
    // A live row carries the moment its publisher claimed it (`claimed_at`).
    // One whose claim is older than half an hour was cut off — the platform
    // may or may not have received it — and would block the queue forever.
    // Rows without a claim fall back to when they were due or created.
    const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();
    const { data: reaped, error: reapError } = await supabase
      .from("posts")
      .update({ status: "failed", claimed_at: null })
      .in("status", ["processing", "publishing"])
      .or([
        `claimed_at.lt."${staleBefore}"`,
        `and(claimed_at.is.null,scheduled_at.lt."${staleBefore}")`,
        `and(claimed_at.is.null,scheduled_at.is.null,created_at.lt."${staleBefore}")`,
      ].join(","))
      .select("id");

    if (reapError) {
      console.error("Failed to reap stale processing posts", reapError);
    } else if ((reaped ?? []).length > 0) {
      console.log(`Marked ${(reaped ?? []).length} stale in-flight posts as failed`);
    }

    const now = new Date().toISOString();
    const { data: posts, error: fetchError } = await supabase
      .from("posts")
      .select("id, platform, post_type")
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error("Failed to fetch scheduled posts", fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message, processed: 0 }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const scheduledPosts = posts ?? [];
    if (scheduledPosts.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, total: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const jobs = scheduledPosts.flatMap((post) => {
      const functionName = publishFunction(post.platform, (post as any).post_type ?? null);
      if (!functionName) {
        console.log(`Skipping scheduled post ${post.id} for platform ${post.platform}`);
        return [];
      }
      return [{ postId: post.id as string, functionName }];
    });
    if (jobs.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, total: scheduledPosts.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // One conditional update claims the whole batch: the status check makes
    // it atomic per row, so two overlapping cron runs never both publish the
    // same post.
    const { data: claimed, error: claimError } = await supabase
      .from("posts")
      .update({ status: "processing" })
      .in("id", jobs.map((job) => job.postId))
      .eq("status", "scheduled")
      .select("id");

    if (claimError) {
      console.error("Failed to claim the scheduled batch", claimError);
      return new Response(
        JSON.stringify({ error: "Could not claim the scheduled posts", processed: 0 }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const claimedIds = new Set((claimed ?? []).map((row) => row.id as string));
    const runnable = jobs.filter((job) => claimedIds.has(job.postId));

    // They publish independently, so the batch takes as long as its slowest
    // post instead of the sum of all of them.
    const results = await Promise.allSettled(
      runnable.map((job) => dispatch(job.postId, job.functionName)),
    );
    const processed = results.filter(
      (result) => result.status === "fulfilled" && result.value,
    ).length;

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



