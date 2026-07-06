import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Loader2, BarChart3, Instagram, AlertCircle, RefreshCw } from "lucide-react";

const VITE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const VITE_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface InstagramAccount {
  id: string;
  account_id: string;
  account_name: string | null;
  connected_at: string | null;
  metadata: { profile_picture?: string; followers_count?: number } | null;
}

interface InsightsData {
  account: {
    username: string;
    profile_picture_url: string | null;
    followers_count: number | null;
    media_count: number | null;
    connected_since: string | null;
  };
  insights: {
    follower_count: { date: string; value: number }[];
    views: { date: string; value: number }[];
    reach: { date: string; value: number }[];
    profile_views: { date: string; value: number }[];
  };
  flowpost_stats: {
    total_published: number;
    this_month: number;
    this_week: number;
    success_rate: number;
    follower_net_growth_30d: number;
    posts_by_day: { date: string; published: number; failed: number }[];
  };
}

function ChartLoader() {
  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">
      <Loader2 size={24} className="animate-spin mr-2" />
      Loading...
    </div>
  );
}

export default function InsightsPage() {
  const { userId } = useAuth();
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    supabase
      .from("connected_accounts")
      .select("id, account_id, account_name, connected_at, metadata")
      .eq("user_id", userId)
      .eq("platform", "instagram")
      .eq("is_connected", true)
      .then(({ data: accountsData, error: accountsError }) => {
        setLoading(false);
        if (accountsError) {
          setError("Failed to load Instagram accounts");
          return;
        }
        const list = (accountsData || []) as InstagramAccount[];
        setAccounts(list);
        if (list.length > 0) {
          setSelectedAccountId(list[0].account_id);
        }
      });
  }, [userId]);

  useEffect(() => {
    if (!selectedAccountId) return;
    setFetching(true);
    setError(null);
    setData(null);
    fetch(
      `${VITE_SUPABASE_URL}/functions/v1/fetch-instagram-insights?account_id=${selectedAccountId}`,
      {
        headers: {
          Authorization: `Bearer ${VITE_SUPABASE_ANON_KEY}`,
        },
      },
    )
      .then(async (res) => {
        const body = await res.json();
        console.log(`[InsightsPage] Response for ${selectedAccountId}:`, body);
        if (!res.ok) {
          if (body.needs_refresh) {
            setError("Instagram token expired. Please reconnect the account.");
          } else {
            setError(body.error || "Failed to fetch insights");
          }
          return;
        }
        setData(body as InsightsData);
        console.log(`[InsightsPage] insights data:`, {
          follower_count: body.insights?.follower_count?.length,
          views: body.insights?.views?.length,
          reach: body.insights?.reach?.length,
          profile_views: body.insights?.profile_views?.length,
          insights_error_detail: body.insights_error_detail,
        });
        if (body.insights_error_detail) {
          console.warn(`[InsightsPage] Insights API returned an error:`, body.insights_error_detail);
        }
      })
      .catch(() => {
        setError("Network error fetching insights");
      })
      .finally(() => setFetching(false));
  }, [selectedAccountId]);

  if (!userId) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground">
        <Loader2 size={24} className="animate-spin mr-2" />
        Loading accounts...
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <BarChart3 size={24} className="text-primary" />
          <h1 className="text-2xl font-bold">Instagram Insights</h1>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <Instagram size={48} className="text-muted-foreground" />
            <p className="text-muted-foreground text-lg">
              No Instagram accounts connected yet.
            </p>
            <Button asChild className="gradient-primary text-primary-foreground">
              <Link to="/accounts">Connect Instagram</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const followerGrowth = data?.insights.follower_count || [];
  const reach = data?.insights.reach || [];
  const views = data?.insights.views || [];
  const postsByDay = data?.flowpost_stats.posts_by_day || [];

  const formatFollowerChart = followerGrowth.map((d) => ({
    date: d.date.slice(5),
    Followers: d.value,
  }));

  const formatReachChart = reach.map((d) => ({
    date: d.date.slice(5),
    Reach: d.value,
  }));

  const formatViewsChart = views.map((d) => ({
    date: d.date.slice(5),
    Views: d.value,
  }));

  const formatPostsChart = postsByDay.map((d) => ({
    date: d.date.slice(5),
    Published: d.published,
    Failed: d.failed,
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 size={24} className="text-primary" />
          <h1 className="text-2xl font-bold">Instagram Insights</h1>
        </div>
        <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((acc) => (
              <SelectItem key={acc.account_id} value={acc.account_id}>
                {acc.account_name || acc.account_id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle size={20} className="text-destructive shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-destructive">{error}</p>
              {error.includes("reconnect") && (
                <Button variant="link" asChild className="h-auto p-0 text-sm">
                  <Link to="/accounts">Go to Accounts</Link>
                </Button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setSelectedAccountId(selectedAccountId)}>
              <RefreshCw size={14} className="mr-1" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {fetching && !data && <ChartLoader />}

      {data && (
        <>
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground mb-1">Followers</p>
                <p className="text-2xl font-bold">{data.account.followers_count?.toLocaleString() || "—"}</p>
                {data.account.followers_count && followerGrowth.length >= 2 && (
                  <p className={`text-xs mt-1 ${data.flowpost_stats.follower_net_growth_30d >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {data.flowpost_stats.follower_net_growth_30d >= 0 ? "+" : ""}{data.flowpost_stats.follower_net_growth_30d} in 30 days
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground mb-1">Total Posts</p>
                <p className="text-2xl font-bold">{data.account.media_count?.toLocaleString() || "—"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground mb-1">Posted via FlowPost</p>
                <p className="text-2xl font-bold">{data.flowpost_stats.total_published}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground mb-1">Success Rate</p>
                <p className="text-2xl font-bold">{data.flowpost_stats.success_rate}%</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle className="text-sm">Follower Growth (30 days)</CardTitle>
              </CardHeader>
              <CardContent>
                {formatFollowerChart.length === 0 ? (
                  <p className="text-sm text-muted-foreground h-64 flex items-center justify-center">No follower data available</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={formatFollowerChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                      <Tooltip />
                      <Line type="monotone" dataKey="Followers" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Connected Since</p>
                  <p className="text-sm font-medium">
                    {data.account.connected_since
                      ? new Date(data.account.connected_since).toLocaleDateString()
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">This Month</p>
                  <p className="text-sm font-medium">{data.flowpost_stats.this_month} posts published</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">This Week</p>
                  <p className="text-sm font-medium">{data.flowpost_stats.this_week} posts published</p>
                </div>
                {data.flowpost_stats.posts_by_day.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Last Post</p>
                    <p className="text-sm font-medium">
                      {data.flowpost_stats.posts_by_day[data.flowpost_stats.posts_by_day.length - 1].date}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Reach (30 days)</CardTitle>
              </CardHeader>
              <CardContent>
                {formatReachChart.length === 0 ? (
                  <p className="text-sm text-muted-foreground h-48 flex items-center justify-center">No reach data available</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={formatReachChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="Reach" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Views (30 days)</CardTitle>
              </CardHeader>
              <CardContent>
                {formatViewsChart.length === 0 ? (
                  <p className="text-sm text-muted-foreground h-48 flex items-center justify-center">No views data available</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={formatViewsChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="Views" stroke="#a855f7" fill="#a855f7" fillOpacity={0.15} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">FlowPost Posting Activity (30 days)</CardTitle>
            </CardHeader>
            <CardContent>
              {formatPostsChart.length === 0 ? (
                <p className="text-sm text-muted-foreground h-48 flex items-center justify-center">No posts published in the last 30 days</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={formatPostsChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="Published" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Failed" fill="hsl(var(--destructive))" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
