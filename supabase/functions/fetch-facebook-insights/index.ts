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

  const rangeParam = url.searchParams.get("range");
  const rangeDays = Math.max(7, Math.min(90, parseInt(rangeParam || "30", 10)));

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
  const since = Math.floor(new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).getTime() / 1000);
  const until = Math.floor(now.getTime() / 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  async function fetchMeta(path: string): Promise<Response> {
    const base = "https://graph.facebook.com/v25.0";
    return fetch(`${base}${path}&access_token=${accessToken}`);
  }

  const [profileRes] = await Promise.all([
    fetchMeta(`/${accountId}?fields=id,name,fan_count,picture,about`),
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

  const metrics = ["page_follows", "page_media_view", "page_post_engagements", "page_views_total"];

  async function fetchSingleMetric(metric: string): Promise<{
    metricName: string;
    data: { name: string; values: { value: number; end_time: string }[] } | null;
    error: unknown;
  }> {
    const url = `/${accountId}/insights?metric=${metric}&period=day&since=${since}&until=${until}`;
    try {
      const res = await fetchMeta(url);
      if (!res.ok) {
        const errText = await res.text();
        let parsed: unknown;
        try { parsed = JSON.parse(errText); } catch { parsed = errText; }
        console.error(`[fb-insights] Metric "${metric}" error for ${accountId}:`, JSON.stringify(parsed));
        return { metricName: metric, data: null, error: parsed };
      }
      const json = await res.json();
      const entry = (json.data || [])[0] || null;
      console.log(`[fb-insights] Metric "${metric}" OK for ${accountId}: ${entry?.values?.length || 0} data points`);
      return { metricName: metric, data: entry, error: null };
    } catch (err) {
      console.error(`[fb-insights] Metric "${metric}" fetch exception:`, err);
      return { metricName: metric, data: null, error: String(err) };
    }
  }

  const metricResults = await Promise.all(metrics.map(fetchSingleMetric));

  const insightsMap: Record<string, { date: string; value: number }[]> = {};
  const insightsErrors: Record<string, unknown> = {};

  for (const result of metricResults) {
    if (result.error) {
      insightsErrors[result.metricName] = result.error;
    } else if (result.data) {
      insightsMap[result.metricName] = (result.data.values || []).map((v) => ({
        date: v.end_time.split("T")[0],
        value: v.value,
      }));
    } else {
      console.warn(`[fb-insights] Metric "${result.metricName}" returned no data for ${accountId}.`);
    }
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

  const pageFollows = insightsMap["page_follows"] || [];
  const pageFollowGrowth = pageFollows.length >= 2
    ? pageFollows[pageFollows.length - 1].value - pageFollows[0].value
    : 0;

  const pageViewsTotal = insightsMap["page_views_total"] || [];
  const totalPageViews = pageViewsTotal.reduce((sum, d) => sum + d.value, 0);

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
        page_follows: pageFollows,
        page_media_view: insightsMap["page_media_view"] || [],
        page_post_engagements: insightsMap["page_post_engagements"] || [],
      },
      totals: { page_views_total: totalPageViews },
      range_days: rangeDays,
      insights_errors: insightsErrors,
      flowpost_stats: {
        total_published: totalPublished.count || 0,
        this_month: thisMonthCount.count || 0,
        this_week: thisWeekCount.count || 0,
        success_rate: successRate,
        page_follow_growth_30d: pageFollowGrowth,
        posts_by_day: postsByDayArray,
      },
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
