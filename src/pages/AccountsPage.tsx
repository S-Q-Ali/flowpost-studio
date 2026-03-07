import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Loader2, User } from "lucide-react";
import { toast } from "sonner";
import type { ConnectedAccount, Platform } from "@/lib/types";

const PERSONAL_USER_ID = "00000000-0000-0000-0000-000000000000";

const platformSections: { platform: Platform; label: string }[] = [
  { platform: "facebook", label: "Facebook" },
  { platform: "instagram", label: "Instagram" },
  { platform: "youtube", label: "YouTube" },
];

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [isYouTubeConnecting, setIsYouTubeConnecting] = useState(false);

  const fetchAccounts = async (): Promise<ConnectedAccount[]> => {
    const { data, error } = await supabase
      .from("connected_accounts")
      .select("*")
      .eq("user_id", PERSONAL_USER_ID);

    if (error) {
      toast.error(error.message);
      return [];
    }

    const list = (data as ConnectedAccount[]) ?? [];
    setAccounts(list);
    return list;
  };

  useEffect(() => { fetchAccounts(); }, []);

  const getAccount = (platform: Platform) => accounts.find((a) => a.platform === platform);

  const youtubeAccounts = useMemo(
    () => accounts.filter((a) => a.platform === "youtube" && a.is_connected),
    [accounts],
  );

  const connectYouTube = async () => {
    setIsYouTubeConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("youtube-auth?action=url", {
        method: "GET",
      });

      if (error) throw new Error(error.message || "Failed to start YouTube OAuth");
      if (!data?.url) throw new Error("Missing OAuth URL");

      let timeoutId: ReturnType<typeof setTimeout>;
      const channel = supabase
        .channel("youtube-connected")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "connected_accounts",
            filter: "platform=eq.youtube",
          },
          () => {
            clearTimeout(timeoutId);
            channel.unsubscribe();
            fetchAccounts();
            toast.success("YouTube channel connected!");
            setIsYouTubeConnecting(false);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "connected_accounts",
            filter: "platform=eq.youtube",
          },
          () => {
            clearTimeout(timeoutId);
            channel.unsubscribe();
            fetchAccounts();
            toast.success("YouTube channel connected!");
            setIsYouTubeConnecting(false);
          },
        )
        .subscribe();

      timeoutId = setTimeout(() => {
        channel.unsubscribe();
        setIsYouTubeConnecting(false);
      }, 5 * 60 * 1000);

      window.open(data.url, "_blank");
    } catch (e: any) {
      toast.error(e.message || "YouTube connection failed");
      setIsYouTubeConnecting(false);
    }
  };

  const disconnectYouTube = async (accountId: string | null | undefined) => {
    if (!accountId) return;
    const { error } = await supabase
      .from("connected_accounts")
      .update({ is_connected: false })
      .eq("user_id", PERSONAL_USER_ID)
      .eq("platform", "youtube")
      .eq("account_id", accountId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("YouTube disconnected");
    fetchAccounts();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Connected Accounts</h1>
        <p className="text-sm text-muted-foreground">Manage your social media connections</p>
      </div>

      <div className="grid gap-4">
        {platformSections.map(({ platform, label }) => {
          const account = getAccount(platform);
          const connected = platform === "youtube"
            ? youtubeAccounts.length > 0
            : (account?.is_connected ?? false);
          return (
            <Card key={platform} className="bg-card border-border shadow-card">
              <CardContent className="flex items-center justify-between py-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
                    <PlatformIcon platform={platform} size={24} />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">{label}</h3>
                    {platform === "youtube" ? (
                      <p className="text-xs text-muted-foreground">
                        {youtubeAccounts.length > 0 ? `${youtubeAccounts.length} channel(s) connected` : "Not connected"}
                      </p>
                    ) : connected ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <User size={10} /> {account?.account_name}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Not connected</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={connected ? "bg-status-published/20 text-status-published border-status-published/30" : "bg-secondary text-muted-foreground border-border"}>
                    {connected ? "Connected" : "Not Connected"}
                  </Badge>
                  {platform === "youtube" ? (
                    <Button
                      className="gradient-primary text-primary-foreground"
                      size="sm"
                      onClick={connectYouTube}
                      disabled={isYouTubeConnecting}
                    >
                      {isYouTubeConnecting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Connecting…
                        </>
                      ) : (
                        "Connect YouTube Account"
                      )}
                    </Button>
                  ) : connected ? (
                    <Button variant="outline" size="sm" disabled>
                      Disconnect
                    </Button>
                  ) : (
                    <Button className="gradient-primary text-primary-foreground" size="sm" disabled>
                      Connect Account
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* YouTube connected channels */}
        {youtubeAccounts.length > 0 && (
          <div className="grid gap-3">
            {youtubeAccounts.map((a) => (
              <Card key={a.id} className="bg-card border-border shadow-card">
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
                      <PlatformIcon platform="youtube" size={20} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{a.account_name ?? "YouTube Channel"}</div>
                      <div className="text-xs text-muted-foreground">
                        {typeof (a as any)?.metadata?.subscriber_count === "number"
                          ? `${(a as any).metadata.subscriber_count.toLocaleString()} subscribers`
                          : a.account_id}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="bg-status-published/20 text-status-published border-status-published/30">
                      Connected
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => disconnectYouTube(a.account_id)}>
                      Disconnect
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
