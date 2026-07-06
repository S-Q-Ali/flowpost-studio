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
    .eq("platform", "facebook")
    .eq("is_connected", true)
    .single();

  if (accountError || !account) {
    return new Response(
      JSON.stringify({ error: "Facebook page not found" }),
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
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const since = Math.floor(thirtyDaysAgo.getTime() / 1000);
  const until = Math.floor(now.getTime() / 1000);

  async function fetchMeta(path: string): Promise<Response> {
    const base = "https://graph.facebook.com/v23.0";
    return fetch(`${base}${path}&access_token=${accessToken}`);
  }

  const [profileRes, insightsRes] = await Promise.all([
    fetchMeta(`/${accountId}?fields=id,name,fan_count,picture,about`),
    fetchMeta(`/${accountId}/insights?metric=page_fans,page_impressions,page_engaged_users,page_views_total&period=day&since=${since}&until=${until}`),
  ]);

  if (!profileRes.ok) {
    const err = await profileRes.text();
    console.error(`[fb-insights] Profile API error for ${accountId}:`, err);
    return new Response(
      JSON.stringify({ error: "Meta API error (profile)", detail: err, needs_refresh: err.includes("190") }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const profile = await profileRes.json();
  console.log(`[fb-insights] Profile OK for ${accountId}:`, { name: profile.name, fan_count: profile.fan_count });

  let insights: { name: string; values: { value: number; end_time: string }[] }[] = [];
  let insightsError: unknown = null;

  if (insightsRes.ok) {
    const data = await insightsRes.json();
    insights = data.data || [];
    if (insights.length === 0) {
      console.warn(`[fb-insights] Insights API returned empty data for ${accountId}.`);
    } else {
      console.log(`[fb-insights] Insights OK for ${accountId}:`, insights.map(m => `${m.name}: ${m.values?.length || 0} data points`));
    }
  } else {
    const errText = await insightsRes.text();
    let parsed: unknown;
    try { parsed = JSON.parse(errText); } catch { parsed = errText; }
    console.error(`[fb-insights] Insights API error for ${accountId}:`, JSON.stringify(parsed));
    insightsError = parsed;
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
      .eq("platform", "facebook")
      .eq("account_id", accountId)
      .eq("status", "published"),
    supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("platform", "facebook")
      .eq("account_id", accountId)
      .eq("status", "published")
      .gte("published_at", thisMonthStart),
    supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("platform", "facebook")
      .eq("account_id", accountId)
      .eq("status", "published")
      .gte("published_at", thisWeekStart),
    supabase
      .from("posts")
      .select("published_at, status")
      .eq("platform", "facebook")
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
    .eq("platform", "facebook")
    .eq("account_id", accountId)
    .eq("status", "failed");

  const totalAttempts = (totalPublished.count || 0) + (failedCount.count || 0);
  const successRate = totalAttempts > 0 ? Math.round(((totalPublished.count || 0) / totalAttempts) * 100) : 0;

  const pageFans = insightsMap["page_fans"] || [];
  const pageFanGrowth = pageFans.length >= 2
    ? pageFans[pageFans.length - 1].value - pageFans[0].value
    : 0;

  return new Response(
    JSON.stringify({
      account: {
        name: profile.name || account.account_name,
        profile_picture_url: profile.picture?.data?.url || null,
        fan_count: profile.fan_count ?? null,
        about: profile.about || null,
        connected_since: account.connected_at,
      },
      insights: {
        page_fans: pageFans,
        page_impressions: insightsMap["page_impressions"] || [],
        page_engaged_users: insightsMap["page_engaged_users"] || [],
        page_views_total: insightsMap["page_views_total"] || [],
      },
      insights_error_detail: insightsError,
      flowpost_stats: {
        total_published: totalPublished.count || 0,
        this_month: thisMonthCount.count || 0,
        this_week: thisWeekCount.count || 0,
        success_rate: successRate,
        page_fan_growth_30d: pageFanGrowth,
        posts_by_day: postsByDayArray,
      },
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
