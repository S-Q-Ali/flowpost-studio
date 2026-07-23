import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Wrench, Chrome, CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";

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
  const [extInstalled, setExtInstalled] = useState<boolean | null>(null);
  const [pages, setPages] = useState<PageAccount[]>([]);
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<PageResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("connected_accounts")
      .select("account_id, account_name")
      .eq("user_id", userId)
      .eq("platform", "facebook")
      .eq("is_connected", true)
      .then(({ data }) => setPages((data || []) as PageAccount[]));
  }, [userId]);

  const checkExtension = useCallback(async () => {
    const res = await sendExt('PING', {});
    setExtInstalled(res !== null && (res as { ok?: boolean })?.ok === true);
  }, []);

  useEffect(() => { checkExtension(); }, [checkExtension]);

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
            <Button onClick={runToolCheck} disabled={checking || !extInstalled} className="mt-4">
              {checking ? <Loader2 size={14} className="animate-spin mr-1" /> : <RefreshCw size={14} className="mr-1" />}
              {checking ? 'Checking...' : 'Run Tool Check'}
            </Button>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle size={20} className="text-destructive shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {results && results.map((page) => (
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
