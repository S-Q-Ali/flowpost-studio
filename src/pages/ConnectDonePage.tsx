import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

const CONNECT_PLATFORMS: Record<string, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  google_drive: "Google Drive",
  mega: "MEGA",
};

type Outcome = "connected" | "denied" | "failed";

const OUTCOME_COPY: Record<Outcome, { title: (label: string) => string; body: string }> = {
  connected: {
    title: (label) => `Connected to ${label}`,
    body: "You can close this tab and keep working in FlowPost.",
  },
  denied: {
    title: (label) => `${label} was not connected`,
    body: "The connection was cancelled in the browser. Nothing was saved.",
  },
  failed: {
    title: () => "The connection did not finish",
    body: "Start it again in FlowPost.",
  },
};

const NONCE = /^[0-9a-f]{64}$/;

function openInOS(link: string) {
  window.location.href = link;
}

/**
 * The page a finished desktop connect leaves in the browser.
 *
 * The auth functions answer the browser callback with a redirect here — they
 * cannot serve the page themselves, because Supabase returns their HTML as
 * plain text — and this page hands the app its `flowpost://` link. A browser
 * that blocks the automatic jump still shows the link, so one click finishes
 * what the OS handoff could not.
 *
 * Every field of that link is re-validated against the connect contract and
 * rebuilt here; nothing from the query reaches the page or the link raw, so a
 * crafted address cannot put text — or another host — into either.
 */
export default function ConnectDonePage({
  openApp = openInOS,
}: {
  openApp?: (link: string) => void;
}) {
  const [params] = useSearchParams();

  const connect = useMemo(() => {
    const platform = params.get("platform") ?? "";
    const nonce = params.get("nonce") ?? "";
    const result = params.get("result") ?? "";
    const label = CONNECT_PLATFORMS[platform];
    if (!label || !NONCE.test(nonce) || !(result in OUTCOME_COPY)) return null;
    return {
      label,
      outcome: result as Outcome,
      link: `flowpost://connect-callback?platform=${platform}&nonce=${nonce}&result=${result}`,
    };
  }, [params]);

  useEffect(() => {
    if (connect) openApp(connect.link);
  }, [connect, openApp]);

  if (!connect) {
    return (
      <Panel
        title="This link is not valid"
        body="Start the connection again in FlowPost."
      />
    );
  }

  const copy = OUTCOME_COPY[connect.outcome];
  return (
    <Panel
      title={copy.title(connect.label)}
      body={copy.body}
      link={connect.link}
    />
  );
}

function Panel({ title, body, link }: { title: string; body: string; link?: string }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 bg-background text-foreground">
      <Logo size="lg" />
      <section className="w-full max-w-sm rounded-lg border bg-card p-8 text-center text-card-foreground">
        <h1 className="text-2xl font-semibold leading-none tracking-tight">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{body}</p>
        {link && (
          <Button asChild className="mt-6">
            <a href={link}>Open FlowPost</a>
          </Button>
        )}
      </section>
    </main>
  );
}
