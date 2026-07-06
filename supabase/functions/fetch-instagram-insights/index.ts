import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { decrypt } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const accountId = url.searchParams.get("account_id");
  if (!accountId) {
    return new Response(
      JSON.stringify({ error: "Missing account_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: account, error: accountError } = await supabase
    .from("connected_accounts")
    .select("*")
    .eq("account_id", accountId)
    .eq("platform", "instagram")
    .eq("is_connected", true)
    .single();

  if (accountError || !account) {
    return new Response(
      JSON.stringify({ error: "Instagram account not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const accessToken = await decrypt(account.access_token);
  if (!accessToken) {
    return new Response(
      JSON.stringify({ error: "Could not decrypt access token" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const since = Math.floor(ninetyDaysAgo.getTime() / 1000);
  const until = Math.floor(now.getTime() / 1000);

  async function fetchMeta(path: string): Promise<Response> {
    const base = "https://graph.facebook.com/v21.0";
    return fetch(`${base}${path}&access_token=${accessToken}`);
  }

  const [profileRes, insightsRes] = await Promise.all([
    fetchMeta(`/${accountId}?fields=username,profile_picture_url,followers_count,media_count`),
    fetchMeta(`/${accountId}/insights?metric=follower_count,impressions,reach,profile_views&period=day&since=${since}&until=${until}`),
  ]);

  if (!profileRes.ok) {
    const err = await profileRes.text();
    console.error(`[insights] Profile API error for ${accountId}:`, err);
    return new Response(
      JSON.stringify({ error: "Meta API error (profile)", detail: err, needs_refresh: err.includes("190") }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const profile = await profileRes.json();
  console.log(`[insights] Profile OK for ${accountId}:`, { username: profile.username, followers_count: profile.followers_count, media_count: profile.media_count });

  let insights: { name: string; values: { value: number; end_time: string }[] }[] = [];
  let insightsError: unknown = null;
  if (insightsRes.ok) {
    const data = await insightsRes.json();
    insights = data.data || [];
    if (insights.length === 0) {
      console.warn(`[insights] Insights API returned empty data array for ${accountId}. Full response:`, JSON.stringify(data));
    } else {
      console.log(`[insights] Insights OK for ${accountId}:`, insights.map(m => `${m.name}: ${m.values?.length || 0} data points`));
    }
  } else {
    const errText = await insightsRes.text();
    let parsed: unknown;
    try { parsed = JSON.parse(errText); } catch { parsed = errText; }
    console.error(`[insights] Insights API error for ${accountId}:`, JSON.stringify(parsed));
    insightsError = parsed;
  }

  // Debug: check token scopes
  console.log(`[insights] Checking token scopes for ${accountId}...`);
  try {
    const debugRes = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${accessToken}&access_token=${accessToken}`);
    const debugData = await debugRes.json();
    if (debugData?.data?.scopes) {
      console.log(`[insights] Token scopes for ${accountId}:`, debugData.data.scopes);
    } else {
      console.warn(`[insights] Token debug returned no scopes:`, JSON.stringify(debugData));
    }
  } catch (e) {
    console.error(`[insights] Token debug call failed:`, e);
  }

  const insightsMap: Record<string, { date: string; value: number }[]> = {};
  for (const metric of insights) {
    insightsMap[metric.name] = (metric.values || []).map((v: { value: number; end_time: string }) => ({
      date: v.end_time.split("T")[0],
      value: v.value,
    }));
  }

  const today = now.toISOString().split("T")[0];
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const thisWeekStart = new Date(now.getTime() - now.getDay() * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [totalPublished, thisMonthCount, thisWeekCount, postsByDayData] = await Promise.all([
    supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("platform", "instagram")
      .eq("account_id", accountId)
      .eq("status", "published"),
    supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("platform", "instagram")
      .eq("account_id", accountId)
      .eq("status", "published")
      .gte("published_at", thisMonthStart),
    supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("platform", "instagram")
      .eq("account_id", accountId)
      .eq("status", "published")
      .gte("published_at", thisWeekStart),
    supabase
      .from("posts")
      .select("published_at, status")
      .eq("platform", "instagram")
      .eq("account_id", accountId)
      .gte("published_at", thirtyDaysAgo.toISOString())
      .order("published_at", { ascending: true }),
  ]);

  const postsByDay: Record<string, { published: number; failed: number }> = {};
  for (const post of postsByDayData.data || []) {
    const day = post.published_at?.split("T")[0] || today;
    if (!postsByDay[day]) postsByDay[day] = { published: 0, failed: 0 };
    if (post.status === "published") postsByDay[day].published++;
    else if (post.status === "failed") postsByDay[day].failed++;
  }

  const postsByDayArray = Object.entries(postsByDay)
    .map(([date, counts]) => ({ date, ...counts }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const failedCount = await supabase
    .from("posts")
    .select("*", { count: "exact", head: true })
    .eq("platform", "instagram")
    .eq("account_id", accountId)
    .eq("status", "failed");

  const totalAttempts = (totalPublished.count || 0) + (failedCount.count || 0);
  const successRate = totalAttempts > 0 ? Math.round(((totalPublished.count || 0) / totalAttempts) * 100) : 0;

  const followerGrowth = insightsMap["follower_count"] || [];
  const followerThisMonth = followerGrowth.length >= 2
    ? followerGrowth[followerGrowth.length - 1].value - followerGrowth[0].value
    : 0;

  return new Response(
    JSON.stringify({
      account: {
        username: profile.username || account.account_name,
        profile_picture_url: profile.profile_picture_url || null,
        followers_count: profile.followers_count ?? null,
        media_count: profile.media_count ?? null,
        connected_since: account.connected_at,
      },
      insights: {
        follower_count: followerGrowth,
        impressions: insightsMap["impressions"] || [],
        reach: insightsMap["reach"] || [],
        profile_views: insightsMap["profile_views"] || [],
      },
      insights_error_detail: insightsError,
      flowpost_stats: {
        total_published: totalPublished.count || 0,
        this_month: thisMonthCount.count || 0,
        this_week: thisWeekCount.count || 0,
        success_rate: successRate,
        follower_net_growth_90d: followerThisMonth,
        posts_by_day: postsByDayArray,
      },
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
