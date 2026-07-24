import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Wrench, Chrome, CheckCircle2, XCircle, AlertCircle, RefreshCw, Clock, CloudDownload } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const EXT_SOURCE = 'FLOWPOST_EXT';
const DASH_SOURCE = 'FLOWPOST_DASH';

interface ExtResponse {
  source: string;
  id: string;
  type: string;
  payload: unknown;
}

interface PageAccount {
  account_id: string;
  account_name: string | null;
}

interface ToolStatus {
  [toolName: string]: string;
}

interface EligibilityCriterion {
  goal?: number;
  count?: number;
  progress?: number;
  status: string;
}

interface EligibilityProgress {
  [criterion: string]: EligibilityCriterion;
}

interface PageResult {
  basicInfo: { id: string; name: string; thumbnail?: string };
  eligibilityBucket: string;
  monetizationToolsEligibilityStatus: ToolStatus;
  eligibilityCriteriaProgress: EligibilityProgress;
}

let msgCounter = 0;

function sendExt(type: string, payload: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    const id = String(++msgCounter);
    const handler = (event: MessageEvent) => {
      if (event.data?.source === EXT_SOURCE && event.data?.id === id) {
        window.removeEventListener('message', handler);
        resolve(event.data.payload);
      }
    };
    window.addEventListener('message', handler);
    window.postMessage({ source: DASH_SOURCE, id, type, payload }, '*');
    setTimeout(() => { window.removeEventListener('message', handler); resolve(null); }, 8000);
  });
}

export default function ToolsPage() {
  const { userId } = useAuth();
  const { toast } = useToast();
  const [extInstalled, setExtInstalled] = useState<boolean | null>(null);
  const [pages, setPages] = useState<PageAccount[]>([]);
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState<PageResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedResults, setSavedResults] = useState<PageResult[] | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  useEffect(() => { loadPages(); }, [loadPages]);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("page_eligibility")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          console.warn("[ToolsPage] Failed to load saved eligibility:", error.message);
          return;
        }
        console.log("[ToolsPage] Saved eligibility rows:", data?.length || 0, data);
        if (data?.length) {
          const mapped: PageResult[] = data.map(r => ({
            basicInfo: { id: r.page_id, name: r.page_name || r.page_id },
            eligibilityBucket: r.eligibility_bucket || '',
            monetizationToolsEligibilityStatus: (r.monetization_tools || {}) as ToolStatus,
            eligibilityCriteriaProgress: (r.criteria_progress || {}) as EligibilityProgress,
          }));
          setSavedResults(mapped);
          const sorted = [...data].sort((a, b) => new Date(b.checked_at).getTime() - new Date(a.checked_at).getTime());
          setLastChecked(sorted[0].checked_at);
        }
      });
  }, [userId]);

  const checkExtension = useCallback(async () => {
    const res = await sendExt('PING', {});
    setExtInstalled(res !== null && (res as { ok?: boolean })?.ok === true);
  }, []);

  useEffect(() => { checkExtension(); }, [checkExtension]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.source !== EXT_SOURCE || event.data?.type !== 'QUERY_PAGES') return;
      if (!userId) return;
      supabase
        .from("connected_accounts")
        .select("account_id, account_name")
        .eq("user_id", userId)
        .eq("platform", "facebook")
        .eq("is_connected", true)
        .then(({ data }) => {
          const pages = (data || []).map(p => ({ id: p.account_id, name: p.account_name || '' }));
          window.postMessage({ source: DASH_SOURCE, type: 'QUERY_PAGES_RESULT', id: event.data.id, payload: { pages } }, event.origin);
        });
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [userId]);

  const loadPages = useCallback(() => {
    if (!userId) return;
    supabase
      .from("connected_accounts")
      .select("account_id, account_name")
      .eq("user_id", userId)
      .eq("platform", "facebook")
      .eq("is_connected", true)
      .then(({ data }) => setPages((data || []) as PageAccount[]));
  }, [userId]);

  const syncPages = async () => {
    if (!userId) return;
    setSyncing(true);
    try {
      // Get current pages from the extension
      const extPages = await sendExt('GET_PAGES', {}) as { pages?: { id: string; name: string }[]; error?: string } | null;
      if (!extPages || extPages.error || !extPages.pages?.length) {
        toast({ title: "Sync failed", description: "Could not fetch pages from the extension. Make sure you have a Facebook tab open.", variant: "destructive" });
        return;
      }

      const { data, error } = await supabase.functions.invoke<{ success: boolean; pages: PageAccount[] }>(
        "facebook-auth?action=sync-pages",
        { body: { userId, pages: extPages.pages.map(p => ({ account_id: p.id, account_name: p.name })) } }
      );

      if (error || !data?.success) {
        throw new Error(error?.message || "Sync failed");
      }

      toast({ title: "Pages synced", description: `${data.pages.length} Facebook pages synced from Facebook.` });
      loadPages();
    } catch (err) {
      toast({ title: "Sync failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const runToolCheck = async () => {
    if (!pages.length) return;
    setChecking(true);
    setError(null);
    setResults(null);

    const res = await sendExt('TOOL_CHECK', { page_ids: pages.map(p => p.account_id) }) as { ok?: boolean; data?: { payload?: PageResult[] }; error?: string } | null;

    if (!res) {
      setError('Extension did not respond. Make sure the extension is installed and you have a Facebook tab open.');
    } else if (res.error) {
      setError(res.error);
    } else if (res.ok && res.data?.payload) {
      setResults(res.data.payload);
      setLastChecked(new Date().toISOString());
      const sessionRes = await supabase.auth.getSession();
      const saveUserId = sessionRes.data.session?.user?.id || userId;
      const rows = res.data.payload.map((page: PageResult) => ({
        user_id: saveUserId,
        page_id: page.basicInfo.id,
        page_name: page.basicInfo.name,
        eligibility_bucket: page.eligibilityBucket,
        monetization_tools: page.monetizationToolsEligibilityStatus,
        criteria_progress: page.eligibilityCriteriaProgress,
      }));
      supabase.from("page_eligibility").upsert(rows, { onConflict: "user_id,page_id" }).then(({ error }) => {
        if (error) console.warn("[ToolsPage] Failed to save eligibility:", error.message);
      });
    } else {
      setError('Unexpected response from extension.');
    }

    setChecking(false);
  };

  const toolLabels: Record<string, string> = {
    branded_content_fb_simple: 'Branded Content',
    ad_breaks_open_program: 'In-stream Ads',
    stars: 'Stars',
    reels_ads: 'Ads on Reels',
    fan_funding: 'Fan Funding',
    rights_manager: 'Rights Manager',
    live_ad_breaks: 'Live Ads',
    creator_store: 'Creator Store',
    brand_collab_manager: 'Brand Collab Manager',
    avatars_store: 'Avatars Store',
    unification_program: 'Content Monetization',
  };

  const criterionLabels: Record<string, string> = {
    follower_count: 'Followers',
    follower_count_in_stream_ads: 'Followers (Ads)',
    l60_eligible_minutes_viewed: 'Watch Minutes (60 days)',
    l60_60s_video_view_count_on_180s_duration: '60s Views (180 days)',
    l60_engagement: 'Engagement (60 days)',
    l60_engagement_fan_subs: 'Engagement (Fan Subs)',
    weekly_returning_viewer_count: 'Returning Viewers / Week',
    follower_count_fan_subs: 'Followers (Fan Subs)',
    l60_minutes_viewed_fan_subs: 'Watch Minutes (Fan Subs)',
    l60_minutes_viewed_live: 'Watch Minutes (Live)',
    follower_count_live_ads: 'Followers (Live Ads)',
    l60_live_total_eligible_minutes_viewed: 'Live Watch Minutes (60 days)',
    l30_follower_count_stars: 'Followers (Stars, 30 days)',
    follower_count_stars: 'Followers (Stars)',
  };

  if (!userId) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wrench size={24} className="text-primary" />
          <h1 className="text-2xl font-bold">Tools</h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Chrome size={14} />
            Extension Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {extInstalled === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              Detecting extension...
            </div>
          ) : extInstalled ? (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 size={16} className="text-status-published" />
              <span className="font-medium text-status-published">Connected</span>
              <span className="text-muted-foreground ml-2">
                FlowPost Bridge v1.0
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <XCircle size={16} className="text-muted-foreground" />
                <span className="font-medium text-muted-foreground">Not detected</span>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
              <p>1. Open <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">chrome://extensions</span></p>
              <p>2. Enable <strong>Developer mode</strong></p>
              <p>3. Click <strong>Load unpacked</strong> and select the <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">flowpost-extension</span> folder</p>
              <p>4. Make sure you're logged into Facebook in at least one tab</p>
              <p className="text-amber-500 dark:text-amber-400">5. <strong>Refresh this page</strong> after installing/reloading the extension</p>
                <Button variant="outline" size="sm" onClick={checkExtension} className="mt-2">
                  <RefreshCw size={14} className="mr-1" />
                  Check again
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {pages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Connected Facebook Pages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pages.map((p) => (
                <div key={p.account_id} className="flex items-center justify-between text-sm py-1.5">
                  <span>{p.account_name || p.account_id}</span>
                  <span className="text-xs text-muted-foreground font-mono">{p.account_id}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-4">
              <Button onClick={syncPages} disabled={syncing || !extInstalled} variant="outline" size="sm">
                {syncing ? <Loader2 size={14} className="animate-spin mr-1" /> : <CloudDownload size={14} className="mr-1" />}
                {syncing ? 'Syncing...' : 'Sync Pages'}
              </Button>
              <Button onClick={runToolCheck} disabled={checking || !extInstalled} size="sm">
                {checking ? <Loader2 size={14} className="animate-spin mr-1" /> : <RefreshCw size={14} className="mr-1" />}
                {checking ? 'Checking...' : 'Run Tool Check'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {lastChecked && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock size={12} />
          <span>Last checked {formatDistanceToNow(new Date(lastChecked), { addSuffix: true })}</span>
          {!results && savedResults && (
            <Button variant="outline" size="sm" onClick={runToolCheck} className="ml-auto h-6 text-xs px-2">
              <RefreshCw size={10} className="mr-1" /> Refresh
            </Button>
          )}
        </div>
      )}

      {!results && savedResults && (
        <div className="bg-muted/50 border border-border rounded-md p-3 text-xs text-muted-foreground flex items-center gap-2">
          <Clock size={14} />
          Showing results from {formatDistanceToNow(new Date(lastChecked!), { addSuffix: true })}
          <Button variant="outline" size="sm" onClick={runToolCheck} className="ml-auto h-6 text-xs px-2">
            <RefreshCw size={10} className="mr-1" /> Refresh
          </Button>
        </div>
      )}

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle size={20} className="text-destructive shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {(results || savedResults) && (results || savedResults).map((page) => (
        <Card key={page.basicInfo.id}>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              {page.basicInfo.name || page.basicInfo.id}
              <span className={`text-xs px-2 py-0.5 rounded-full font-normal ${
                page.eligibilityBucket === 'eligible' ? 'bg-status-published/10 text-status-published' :
                'bg-muted text-muted-foreground'
              }`}>
                {page.eligibilityBucket}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">Monetization Tools</p>
                <div className="space-y-1.5">
                  {Object.entries(page.monetizationToolsEligibilityStatus || {}).map(([tool, status]) => (
                    <div key={tool} className="flex items-center gap-2 text-sm">
                      {status === 'eligible' ? (
                        <CheckCircle2 size={14} className="text-status-published shrink-0" />
                      ) : (
                        <XCircle size={14} className="text-muted-foreground shrink-0" />
                      )}
                      <span className={status === 'eligible' ? '' : 'text-muted-foreground'}>
                        {toolLabels[tool] || tool}
                      </span>
                      <span className={`text-xs ml-auto ${
                        status === 'eligible' ? 'text-status-published' : 'text-muted-foreground'
                      }`}>
                        {status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">Eligibility Progress</p>
                <div className="space-y-2">
                  {Object.entries(page.eligibilityCriteriaProgress || {})
                    .filter(([, c]) => c.goal != null)
                    .slice(0, 8)
                    .map(([key, criterion]) => {
                      const pct = criterion.goal ? Math.min(100, Math.round(((criterion.count || 0) / criterion.goal) * 100)) : 0;
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between text-xs mb-0.5">
                            <span className="text-muted-foreground">{criterionLabels[key] || key}</span>
                            <span className={criterion.status === 'pass' ? 'text-status-published' : 'text-muted-foreground'}>
                              {criterion.count?.toLocaleString() || 0} / {criterion.goal?.toLocaleString() || '?'}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${
                              criterion.status === 'pass' ? 'bg-status-published' : 'bg-muted-foreground/30'
                            }`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
