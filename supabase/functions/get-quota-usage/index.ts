import { createClient } from "npm:@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const QUOTA_LIMIT = 10000;
const COST_PER_UPLOAD = 1600;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const validKeys = [Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), Deno.env.get("SUPABASE_ANON_KEY"), Deno.env.get("FRONTEND_API_KEY")].filter(Boolean);
    if (!token || !validKeys.includes(token)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const url = new URL(req.url);
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* ignore */ }

    const platform = (body.platform as string) || url.searchParams.get("platform") || "youtube";

    const today = new Date().toISOString().split("T")[0];

    const { count, error } = await supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("platform", platform)
      .in("status", ["published", "publishing"])
      .gte("created_at", today);

    if (error) {
      return json({ error: error.message }, 500);
    }

    const uploadCount = count ?? 0;
    const used = uploadCount * COST_PER_UPLOAD;
    const percentage = Math.min(100, Math.round((used / QUOTA_LIMIT) * 100));

    return json({
      platform,
      used,
      limit: QUOTA_LIMIT,
      percentage,
      uploadCount,
      remaining: Math.max(0, QUOTA_LIMIT - used),
      estimatedUploadsRemaining: Math.max(0, Math.floor((QUOTA_LIMIT - used) / COST_PER_UPLOAD)),
    });
  } catch (err) {
    console.error("get-quota-usage error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
