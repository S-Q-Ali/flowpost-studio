import { createClient } from "npm:@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  const url = new URL(req.url);
  const platform = url.searchParams.get("platform") || "youtube";

  const today = new Date().toISOString().split("T")[0];

  const { count, error } = await supabase
    .from("posts")
    .select("*", { count: "exact", head: true })
    .eq("platform", platform)
    .in("status", ["published", "publishing"])
    .gte("created_at", today);

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const uploadCount = count ?? 0;
  const used = uploadCount * COST_PER_UPLOAD;
  const percentage = Math.min(100, Math.round((used / QUOTA_LIMIT) * 100));

  return new Response(
    JSON.stringify({
      platform,
      used,
      limit: QUOTA_LIMIT,
      percentage,
      uploadCount,
      remaining: Math.max(0, QUOTA_LIMIT - used),
      estimatedUploadsRemaining: Math.max(0, Math.floor((QUOTA_LIMIT - used) / COST_PER_UPLOAD)),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
