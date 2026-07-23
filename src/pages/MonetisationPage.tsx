import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BadgeDollarSign,
  Instagram,
  Facebook,
  Loader2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  XCircle,
  CircleHelp,
} from "lucide-react";

const VITE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const VITE_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

type Platform = "facebook";

interface ConnectedAccount {
  id: string;
  account_id: string;
  account_name: string | null;
  connected_at: string | null;
  metadata: Record<string, unknown> | null;
}

interface FBInsightsResponse {
  account: {
    name: string;
    profile_picture_url: string | null;
    fan_count: number | null;
    about: string | null;
    connected_since: string | null;
  };
  insights: {
    page_follows: { date: string; value: number }[];
    page_media_view: { date: string; value: number }[];
    page_post_engagements: { date: string; value: number }[];
  };
  totals: Record<string, number>;
  range_days: number;
  insights_errors?: Record<string, unknown>;
  flowpost_stats: {
    total_published: number;
    this_month: number;
    this_week: number;
    success_rate: number;
    page_follow_growth_30d: number;
    posts_by_day: { date: string; published: number; failed: number }[];
  };
}

interface NumericReq {
  id: string;
  type: "numeric";
  label: string;
  target: number;
  current: number | null;
  format?: (v: number) => string;
}

interface BooleanReq {
  id: string;
  type: "boolean";
  label: string;
  current: boolean | null;
}

type Requirement = NumericReq | BooleanReq;

interface MonetisationTool {
  id: string;
  name: string;
  description: string;
  docsUrl: string;
  requirements: Requirement[];
}

function useConfirmed(key: string): [boolean, () => void] {
  const [confirmed, setConfirmed] = useState(() => {
    try {
      return localStorage.getItem(key) === "true";
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setConfirmed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(key, String(next));
      } catch { /* noop */ }
      return next;
    });
  }, [key]);
  return [confirmed, toggle];
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function getStatusIcon(met: boolean | null) {
  if (met === true) return <CheckCircle2 size={16} className="text-status-published shrink-0" />;
  if (met === false) return <XCircle size={16} className="text-destructive shrink-0" />;
  return <CircleHelp size={16} className="text-muted-foreground shrink-0" />;
}

function RequirementRow({ req, confirmed, onToggle }: {
  req: Requirement;
  confirmed: boolean;
  onToggle: () => void;
}) {
  if (req.type === "numeric") {
    const current = req.current;
    const met = current !== null ? current >= req.target : null;
    const pct = current !== null ? Math.min(100, Math.round((current / req.target) * 100)) : 0;

    return (
      <div className="flex items-center gap-3 py-2">
        {getStatusIcon(met)}
        <span className="text-sm flex-1">{req.label}</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground whitespace-nowrap w-28 text-right tabular-nums">
            {current !== null ? formatNum(current) : "—"} / {formatNum(req.target)}
          </span>
          <div className="w-20">
            <Progress value={pct} className="h-1.5" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2">
      {getStatusIcon(confirmed)}
      <span className="text-sm flex-1">{req.label}</span>
      {confirmed ? (
        <span className="text-xs text-status-published font-medium">Confirmed</span>
      ) : (
        <Button variant="outline" size="sm" onClick={onToggle} className="h-7 text-xs">
          Confirm
        </Button>
      )}
    </div>
  );
}

function BooleanReqRow({ accountId, req }: { accountId: string; req: BooleanReq }) {
  const [confirmed, toggle] = useConfirmed(`monetisation_fb_${accountId}_${req.id}`);
  return <RequirementRow req={req} confirmed={confirmed} onToggle={toggle} />;
}

function ToolCard({ tool, accountId }: {
  tool: MonetisationTool;
  accountId: string;
}) {
  const isCmp = tool.id === "cmp";
  const metCount = tool.requirements.filter((r) => {
    if (r.type === "numeric") return r.current !== null && r.current >= r.target;
    const key = `monetisation_fb_${accountId}_${r.id}`;
    return localStorage.getItem(key) === "true";
  }).length;
  const totalCount = tool.requirements.length;
  const allMet = metCount === totalCount;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{tool.name}</CardTitle>
            {isCmp && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                Invite-only
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{tool.description}</p>
          <a
            href={tool.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary inline-flex items-center gap-1 mt-1 hover:underline"
          >
            Read more <ExternalLink size={10} />
          </a>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-xs font-semibold px-2 py-1 rounded-full ${
            allMet
              ? "bg-status-published/10 text-status-published"
              : "bg-destructive/10 text-destructive"
          }`}>
            {metCount}/{totalCount} met
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border-t border-border pt-2">
          {tool.requirements.map((req) => {
            if (req.type === "boolean") {
              return <BooleanReqRow key={req.id} accountId={accountId} req={req} />;
            }
            return <RequirementRow key={req.id} req={req} confirmed={false} onToggle={() => {}} />;
          })}
        </div>
        <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Status:</span>
          {allMet ? (
            isCmp ? (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <CircleHelp size={12} /> Requirements met — invite required
              </span>
            ) : (
              <span className="text-xs font-medium text-status-published flex items-center gap-1">
                <CheckCircle2 size={12} /> Eligible
              </span>
            )
          ) : (
            <span className="text-xs font-medium text-destructive flex items-center gap-1">
              <XCircle size={12} /> Not yet eligible
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function buildTools(data: FBInsightsResponse): MonetisationTool[] {
  const followers = data.account.fan_count ?? null;
  const published = data.flowpost_stats.total_published;
  const totalViews = (data.insights.page_media_view || []).reduce((s, d) => s + d.value, 0);
  const totalEngagements = (data.insights.page_post_engagements || []).reduce((s, d) => s + d.value, 0);

  return [
    {
      id: "cmp",
      name: "Content Monetization (CMP)",
      description: "Invite-only. Earn from Reels, videos, photos & text. Replaced In-stream Ads in Aug 2025.",
      docsUrl: "https://creators.facebook.com/tools/facebook-content-monetization",
      requirements: [
        { id: "followers", type: "numeric", label: "Page followers", target: 10000, current: followers },
        { id: "views", type: "numeric", label: "Minutes viewed (60 days)", target: 600000, current: totalViews },
        { id: "videos", type: "numeric", label: "Active videos posted", target: 5, current: published },
        { id: "confirmed_18", type: "boolean", label: "18+ years old" },
        { id: "confirmed_policies", type: "boolean", label: "Partner Monetisation Policies" },
        { id: "confirmed_country", type: "boolean", label: "Available in your country" },
      ] as Requirement[],
    },
    {
      id: "stars",
      name: "Facebook Stars",
      description: "Receive virtual tips from your audience — requires 500 followers for 30 consecutive days.",
      docsUrl: "https://creators.facebook.com/tools/stars/",
      requirements: [
        { id: "followers", type: "numeric", label: "Page followers (30+ days)", target: 500, current: followers },
        { id: "confirmed_18", type: "boolean", label: "18+ years old" },
        { id: "confirmed_policies", type: "boolean", label: "Content Guidelines accepted" },
      ] as Requirement[],
    },
    {
      id: "subscriptions",
      name: "Facebook Subscriptions",
      description: "Offer paid monthly subscriptions. Also eligible with 250+ return weekly viewers.",
      docsUrl: "https://www.facebook.com/help/154105411310549",
      requirements: [
        { id: "followers", type: "numeric", label: "Page followers", target: 10000, current: followers },
        { id: "engagements", type: "numeric", label: "Post engagements (60 days)", target: 50000, current: totalEngagements },
        { id: "confirmed_18", type: "boolean", label: "18+ years old" },
        { id: "confirmed_policies", type: "boolean", label: "Content Guidelines accepted" },
      ] as Requirement[],
    },
    {
      id: "branded_content",
      name: "Branded Content",
      description: "Get paid for brand partnerships. No minimum follower requirement.",
      docsUrl: "https://www.facebook.com/help/115435258014891",
      requirements: [
        { id: "confirmed_policies", type: "boolean", label: "Content Guidelines accepted" },
        { id: "confirmed_country", type: "boolean", label: "Available in your country" },
      ] as Requirement[],
    },
  ];
}

export default function MonetisationPage() {
  const { userId } = useAuth();
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [data, setData] = useState<FBInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setData(null);
    setError(null);
    supabase
      .from("connected_accounts")
      .select("id, account_id, account_name, connected_at, metadata")
      .eq("user_id", userId)
      .eq("platform", "facebook")
      .eq("is_connected", true)
      .then(({ data: accountsData, error: accountsError }) => {
        setLoading(false);
        if (accountsError) {
          setError("Failed to load Facebook accounts");
          return;
        }
        const list = (accountsData || []) as ConnectedAccount[];
        setAccounts(list);
        if (list.length > 0) {
          const storedAccount = list.find(
            (a) => a.account_id === localStorage.getItem("monetisation_fb_account"),
          );
          setSelectedAccountId(
            storedAccount ? storedAccount.account_id : list[0].account_id,
          );
        }
      })
      .catch(() => {
        setLoading(false);
        setError("Network error loading accounts");
      });
  }, [userId]);

  const fetchInsights = useCallback(() => {
    if (!selectedAccountId) return;
    setFetching(true);
    setError(null);
    setData(null);
    fetch(
      `${VITE_SUPABASE_URL}/functions/v1/fetch-facebook-insights?account_id=${selectedAccountId}&range=60`,
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
            setError("Facebook token expired. Please reconnect the account.");
          } else {
            setError(body.error || "Failed to fetch Facebook insights");
          }
          return;
        }
        setData(body as FBInsightsResponse);
      })
      .catch(() => {
        setError("Network error fetching insights");
      })
      .finally(() => setFetching(false));
  }, [selectedAccountId]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  if (!userId) return null;

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 bg-muted rounded" />
            <div className="h-8 w-36 bg-muted rounded" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-10 w-40 bg-muted rounded-md" />
            <div className="h-10 w-64 bg-muted rounded-md" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="h-5 w-32 bg-muted rounded" />
                <div className="h-3 w-48 bg-muted rounded mt-1" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-4 bg-muted rounded" />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BadgeDollarSign size={24} className="text-primary" />
            <h1 className="text-2xl font-bold">Monetisation</h1>
          </div>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <Facebook size={48} className="text-muted-foreground" />
            <p className="text-muted-foreground text-lg">No Facebook pages connected yet.</p>
            <Button asChild className="gradient-primary text-primary-foreground">
              <Link to="/accounts">Connect Facebook</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tools = data ? buildTools(data) : [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BadgeDollarSign size={24} className="text-primary" />
          <h1 className="text-2xl font-bold">Monetisation</h1>
        </div>
        <div className="flex items-center gap-2">
          <Select value="facebook" disabled>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="facebook">
                <div className="flex items-center gap-2">
                  <Facebook size={14} /> Facebook
                </div>
              </SelectItem>
              <SelectItem value="instagram" disabled>
                <div className="flex items-center gap-2">
                  <Instagram size={14} /> Instagram
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={selectedAccountId}
            onValueChange={(id) => {
              setSelectedAccountId(id);
              localStorage.setItem("monetisation_fb_account", id);
            }}
          >
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

      {fetching && !data && (
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          <Loader2 size={24} className="animate-spin mr-2" />
          Loading monetisation data...
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tools.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              accountId={selectedAccountId}
            />
          ))}
        </div>
      )}

      {data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">About Monetisation Data</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>
              Requirements shown are based on publicly available Facebook monetisation policies.
              Some requirements cannot be checked via API (e.g. age, policy acceptance) and require manual confirmation.
            </p>
            <p>
              "Video views" uses your Page's media view count as a proxy — actual requirements may differ.
              Visit Facebook Creator Studio for the most accurate eligibility check.
            </p>
            <p>
              Data refreshes when you visit this page. Last fetched based on the selected account.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
