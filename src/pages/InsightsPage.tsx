import { useEffect, useState, useCallback } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Loader2, BarChart3, Instagram, Facebook, AlertCircle, RefreshCw } from "lucide-react";

const VITE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const VITE_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

type Platform = "instagram" | "facebook";
type DateRange = 7 | 14 | 30 | 90;

const RANGE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
];

interface ConnectedAccount {
  id: string;
  account_id: string;
  account_name: string | null;
  connected_at: string | null;
  metadata: Record<string, unknown> | null;
}

interface InsightsResponse {
  account: Record<string, unknown>;
  insights: Record<string, { date: string; value: number }[]>;
  totals?: Record<string, number>;
  range_days?: number;
  insights_errors?: Record<string, unknown>;
  flowpost_stats: {
    total_published: number;
    this_month: number;
    this_week: number;
    success_rate: number;
    posts_by_day: { date: string; published: number; failed: number }[];
    [key: string]: unknown;
  };
}

const platformConfig: Record<Platform, {
  label: string;
  icon: typeof Instagram;
  functionName: string;
  emptyIcon: typeof Instagram;
  emptyMsg: string;
  connectLink: string;
  stats: {
    primaryLabel: string;
    primaryField: string;
    secondaryLabel: string;
    secondaryField: string;
    growthField: string;
  };
  charts: {
    primary: { title: string; dataKey: string; metric: string };
    secondary: { title: string; dataKey: string; metric: string };
    tertiary?: { title: string; dataKey: string; metric: string };
  };
}> = {
  instagram: {
    label: "Instagram",
    icon: Instagram,
    functionName: "fetch-instagram-insights",
    emptyIcon: Instagram,
    emptyMsg: "No Instagram accounts connected yet.",
    connectLink: "/accounts",
    stats: {
      primaryLabel: "Followers",
      primaryField: "followers_count",
      secondaryLabel: "Total Posts",
      secondaryField: "media_count",
      growthField: "follower_net_growth_30d",
    },
    charts: {
      primary: { title: "Follower Growth (30 days)", dataKey: "Followers", metric: "follower_count" },
      secondary: { title: "Reach (30 days)", dataKey: "Reach", metric: "reach" },
    },
  },
  facebook: {
    label: "Facebook",
    icon: Facebook,
    functionName: "fetch-facebook-insights",
    emptyIcon: Facebook,
    emptyMsg: "No Facebook pages connected yet.",
    connectLink: "/accounts",
    stats: {
      primaryLabel: "Page Likes",
      primaryField: "fan_count",
      secondaryLabel: "About",
      secondaryField: "about",
      growthField: "page_follow_growth_30d",
    },
    charts: {
      primary: { title: "Page Follows Growth (30 days)", dataKey: "Page Follows", metric: "page_follows" },
      secondary: { title: "Media Views (30 days)", dataKey: "Media Views", metric: "page_media_view" },
      tertiary: { title: "Post Engagements (30 days)", dataKey: "Engagements", metric: "page_post_engagements" },
    },
  },
};

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
  const [platform, setPlatform] = useLocalStorage<Platform>("insights_platform", "instagram");
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [dateRange, setDateRange] = useLocalStorage<DateRange>("insights_date_range", 30);
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = platformConfig[platform];

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setData(null);
    setError(null);
    supabase
      .from("connected_accounts")
      .select("id, account_id, account_name, connected_at, metadata")
      .eq("user_id", userId)
      .eq("platform", platform)
      .eq("is_connected", true)
      .then(({ data: accountsData, error: accountsError }) => {
        setLoading(false);
        if (accountsError) {
          setError(`Failed to load ${config.label} accounts`);
          return;
        }
        const list = (accountsData || []) as ConnectedAccount[];
        setAccounts(list);
        if (list.length > 0) {
          const storedAccount = list.find((a) => a.account_id === localStorage.getItem(`insights_account_${platform}`));
          setSelectedAccountId(storedAccount ? storedAccount.account_id : list[0].account_id);
        }
      });
  }, [userId, platform, config.label]);

  const fetchInsights = useCallback(() => {
    if (!selectedAccountId) return;
    setFetching(true);
    setError(null);
    setData(null);
    fetch(
      `${VITE_SUPABASE_URL}/functions/v1/${config.functionName}?account_id=${selectedAccountId}&range=${dateRange}`,
      {
        headers: {
          Authorization: `Bearer ${VITE_SUPABASE_ANON_KEY}`,
        },
      },
    )
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          if (body.needs_refresh) {
            setError(`${config.label} token expired. Please reconnect the account.`);
          } else {
            setError(body.error || `Failed to fetch ${config.label} insights`);
          }
          return;
        }
        setData(body as InsightsResponse);
        console.log(`[InsightsPage] Response for ${platform} account ${selectedAccountId}:`, body);
      })
      .catch(() => {
        setError("Network error fetching insights");
      })
      .finally(() => setFetching(false));
  }, [selectedAccountId, config, dateRange]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const handlePlatformChange = (newPlatform: Platform) => {
    localStorage.removeItem(`insights_account_${platform}`);
    setPlatform(newPlatform);
    setSelectedAccountId("");
    setData(null);
    setError(null);
  };

  const Icon = config.icon;

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
    const EmptyIcon = config.emptyIcon;
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 size={24} className="text-primary" />
            <h1 className="text-2xl font-bold">Insights</h1>
          </div>
          <Select value={platform} onValueChange={(v) => handlePlatformChange(v as Platform)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="instagram">
                <div className="flex items-center gap-2">
                  <Instagram size={14} /> Instagram
                </div>
              </SelectItem>
              <SelectItem value="facebook">
                <div className="flex items-center gap-2">
                  <Facebook size={14} /> Facebook
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <EmptyIcon size={48} className="text-muted-foreground" />
            <p className="text-muted-foreground text-lg">{config.emptyMsg}</p>
            <Button asChild className="gradient-primary text-primary-foreground">
              <Link to={config.connectLink}>Connect {config.label}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const chartMetrics = config.charts;
  const primaryData = (data?.insights[chartMetrics.primary.metric] || []);
  const secondaryData = (data?.insights[chartMetrics.secondary.metric] || []);
  const tertiaryData = chartMetrics.tertiary ? (data?.insights[chartMetrics.tertiary.metric] || []) : [];
  const postsByDay = data?.flowpost_stats.posts_by_day || [];

  const formatPrimaryChart = primaryData.map((d) => ({
    date: d.date.slice(5),
    [chartMetrics.primary.dataKey]: d.value,
  }));

  const formatSecondaryChart = secondaryData.map((d) => ({
    date: d.date.slice(5),
    [chartMetrics.secondary.dataKey]: d.value,
  }));

  const formatTertiaryChart = chartMetrics.tertiary
    ? tertiaryData.map((d) => ({
        date: d.date.slice(5),
        [chartMetrics.tertiary!.dataKey]: d.value,
      }))
    : [];

  const formatPostsChart = postsByDay.map((d) => ({
    date: d.date.slice(5),
    Published: d.published,
    Failed: d.failed,
  }));

  const accountData = data?.account || {};
  const stats = config.stats;
  const primaryValue = (accountData[stats.primaryField] as number | null) ?? null;
  const growthValue = data?.flowpost_stats[stats.growthField] as number | undefined;
  const secondaryValue = (accountData[stats.secondaryField] as number | string | null) ?? null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 size={24} className="text-primary" />
          <h1 className="text-2xl font-bold">Insights</h1>
        </div>
        <div className="flex items-center gap-2">
          <Select value={platform} onValueChange={(v) => handlePlatformChange(v as Platform)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="instagram">
                <div className="flex items-center gap-2">
                  <Instagram size={14} /> Instagram
                </div>
              </SelectItem>
              <SelectItem value="facebook">
                <div className="flex items-center gap-2">
                  <Facebook size={14} /> Facebook
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedAccountId} onValueChange={(id) => { setSelectedAccountId(id); localStorage.setItem(`insights_account_${platform}`, id); }}>
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
          {platform === "instagram" && (
            <Select value={String(dateRange)} onValueChange={(v) => setDateRange(Number(v) as DateRange)}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
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
            <Button variant="outline" size="sm" onClick={fetchInsights}>
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
                <p className="text-sm text-muted-foreground mb-1">{stats.primaryLabel}</p>
                <p className="text-2xl font-bold">{primaryValue?.toLocaleString() || "—"}</p>
                {primaryValue != null && primaryData.length >= 2 && growthValue !== undefined && (
                  <p className={`text-xs mt-1 ${growthValue >= 0 ? "text-status-published" : "text-destructive"}`}>
                    {growthValue >= 0 ? "+" : ""}{growthValue} in {dateRange} days
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground mb-1">{stats.secondaryLabel}</p>
                <p className="text-2xl font-bold">
                  {platform === "instagram"
                    ? (secondaryValue as number)?.toLocaleString() || "—"
                    : typeof secondaryValue === "string"
                      ? secondaryValue
                      : "—"}
                </p>
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
                <CardTitle className="text-sm">{chartMetrics.primary.title.replace("30 days", `${dateRange} days`)}</CardTitle>
              </CardHeader>
              <CardContent>
                {formatPrimaryChart.length === 0 ? (
                  <p className="text-sm text-muted-foreground h-64 flex items-center justify-center">No data available</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={formatPrimaryChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                      <Tooltip />
                      <Line type="monotone" dataKey={chartMetrics.primary.dataKey} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
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
                      ? new Date(data.account.connected_since as string).toLocaleDateString()
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

          {chartMetrics.tertiary ? (
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">{chartMetrics.secondary.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  {formatSecondaryChart.length === 0 ? (
                    <p className="text-sm text-muted-foreground h-48 flex items-center justify-center">No data available</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={formatSecondaryChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Area type="monotone" dataKey={chartMetrics.secondary.dataKey} stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">{chartMetrics.tertiary.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  {formatTertiaryChart.length === 0 ? (
                    <p className="text-sm text-muted-foreground h-48 flex items-center justify-center">No data available</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={formatTertiaryChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Area type="monotone" dataKey={chartMetrics.tertiary.dataKey} stroke="#a855f7" fill="#a855f7" fillOpacity={0.15} strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">{chartMetrics.secondary.title.replace("30 days", `${dateRange} days`)}</CardTitle>
                </CardHeader>
                <CardContent>
                  {formatSecondaryChart.length === 0 ? (
                    <p className="text-sm text-muted-foreground h-48 flex items-center justify-center">No data available</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={formatSecondaryChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Area type="monotone" dataKey={chartMetrics.secondary.dataKey} stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 flex flex-col justify-center h-full">
                  <p className="text-sm text-muted-foreground mb-1">Views ({dateRange} days)</p>
                  <p className="text-3xl font-bold">{data.totals?.views?.toLocaleString() || "—"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 flex flex-col justify-center h-full">
                  <p className="text-sm text-muted-foreground mb-1">Profile Visits ({dateRange} days)</p>
                  <p className="text-3xl font-bold">{data.totals?.profile_views?.toLocaleString() || "—"}</p>
                </CardContent>
              </Card>
            </div>
          )}

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
