import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PERSONAL_USER_ID } from "@/lib/constants";
import type { ConnectedAccount, Platform } from "@/lib/types";

export default function AccountsPage() {
  const [isYouTubeConnecting, setIsYouTubeConnecting] = useState(false);
  const [isFacebookConnecting, setIsFacebookConnecting] = useState(false);

  const [facebookPages, setFacebookPages] = useState<ConnectedAccount[]>([]);
  const [instagramAccounts, setInstagramAccounts] = useState<ConnectedAccount[]>([]);
  const [youtubeConnectedAccounts, setYoutubeConnectedAccounts] = useState<ConnectedAccount[]>([]);

  const fetchFacebook = async (): Promise<ConnectedAccount[]> => {
    const { data, error } = await supabase
      .from("connected_accounts")
      .select("*")
      .eq("user_id", PERSONAL_USER_ID)
      .eq("platform", "facebook")
      .eq("is_connected", true);

    if (error) {
      toast.error(error.message);
      return [];
    }

    const list = (data as ConnectedAccount[]) ?? [];
    setFacebookPages(list);
    return list;
  };

  const fetchInstagram = async (): Promise<ConnectedAccount[]> => {
    const { data, error } = await supabase
      .from("connected_accounts")
      .select("*")
      .eq("user_id", PERSONAL_USER_ID)
      .eq("platform", "instagram")
      .eq("is_connected", true);

    if (error) {
      toast.error(error.message);
      return [];
    }

    const list = (data as ConnectedAccount[]) ?? [];
    setInstagramAccounts(list);
    return list;
  };

  const fetchYouTube = async (): Promise<ConnectedAccount[]> => {
    const { data, error } = await supabase
      .from("connected_accounts")
      .select("*")
      .eq("user_id", PERSONAL_USER_ID)
      .eq("platform", "youtube")
      .eq("is_connected", true);

    if (error) {
      toast.error(error.message);
      return [];
    }

    const list = (data as ConnectedAccount[]) ?? [];
    setYoutubeConnectedAccounts(list);
    return list;
  };

  const refreshAll = async () => {
    await Promise.all([fetchFacebook(), fetchInstagram(), fetchYouTube()]);
  };

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("connected-accounts-live")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "connected_accounts",
          filter: `user_id=eq.${PERSONAL_USER_ID}`,
        },
        () => {
          refreshAll();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "connected_accounts",
          filter: `user_id=eq.${PERSONAL_USER_ID}`,
        },
        () => {
          refreshAll();
        },
      )
      .subscribe();

    const timeoutId = setTimeout(() => {
      channel.unsubscribe();
    }, 10 * 60 * 1000);

    return () => {
      clearTimeout(timeoutId);
      channel.unsubscribe();
    };
  }, []);

  const youtubeAccounts = useMemo(() => youtubeConnectedAccounts, [youtubeConnectedAccounts]);

  const connectYouTube = async () => {
    setIsYouTubeConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("youtube-auth?action=url", {
        method: "GET",
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
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
            fetchYouTube();
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
            fetchYouTube();
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

  const connectFacebook = async () => {
    setIsFacebookConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("facebook-auth?action=url", {
        method: "GET",
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      });

      if (error) throw new Error(error.message || "Failed to start Facebook OAuth");
      if (!data?.url) throw new Error("Missing OAuth URL");

      let timeoutId: ReturnType<typeof setTimeout>;
      const channel = supabase
        .channel("facebook-connected")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "connected_accounts",
            filter: "platform=eq.facebook",
          },
          () => {
            clearTimeout(timeoutId);
            channel.unsubscribe();
            refreshAll();
            toast.success("Facebook & Instagram connected!");
            setIsFacebookConnecting(false);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "connected_accounts",
            filter: "platform=eq.facebook",
          },
          () => {
            clearTimeout(timeoutId);
            channel.unsubscribe();
            refreshAll();
            toast.success("Facebook & Instagram connected!");
            setIsFacebookConnecting(false);
          },
        )
        .subscribe();

      timeoutId = setTimeout(() => {
        channel.unsubscribe();
        setIsFacebookConnecting(false);
      }, 10 * 60 * 1000);

      window.open(data.url, "_blank");
    } catch (e: any) {
      toast.error(e.message || "Facebook connection failed");
      setIsFacebookConnecting(false);
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
    fetchYouTube();
  };

  const setConnected = async (platform: Platform, accountId: string | null | undefined, next: boolean) => {
    if (!accountId) return;
    const { error } = await supabase
      .from("connected_accounts")
      .update({ is_connected: next })
      .eq("user_id", PERSONAL_USER_ID)
      .eq("platform", platform)
      .eq("account_id", accountId);

    if (error) {
      toast.error(error.message);
      return;
    }

    refreshAll();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Connected Accounts</h1>
        <p className="text-sm text-muted-foreground">Manage your social media connections</p>
      </div>

      <div className="grid gap-4">
        {/* Facebook */}
        <Card className="bg-card border-border shadow-card">
          <CardContent className="flex items-center justify-between py-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
                <PlatformIcon platform="facebook" size={24} />
              </div>
              <div>
                <h3 className="font-medium text-foreground">Facebook</h3>
                <p className="text-xs text-muted-foreground">
                  {facebookPages.length > 0 ? `${facebookPages.length} page(s) connected` : "Not connected"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className={facebookPages.length > 0
                  ? "bg-status-published/20 text-status-published border-status-published/30"
                  : "bg-secondary text-muted-foreground border-border"}
              >
                {facebookPages.length > 0 ? "Connected" : "Not Connected"}
              </Badge>
              <Button
                className="gradient-primary text-primary-foreground"
                size="sm"
                onClick={connectFacebook}
                disabled={isFacebookConnecting}
              >
                {isFacebookConnecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  "Connect Facebook & Instagram"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Instagram */}
        <Card className="bg-card border-border shadow-card">
          <CardContent className="flex items-center justify-between py-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
                <PlatformIcon platform="instagram" size={24} />
              </div>
              <div>
                <h3 className="font-medium text-foreground">Instagram</h3>
                <p className="text-xs text-muted-foreground">
                  Instagram accounts are connected via Facebook
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className={instagramAccounts.length > 0
                  ? "bg-status-published/20 text-status-published border-status-published/30"
                  : "bg-secondary text-muted-foreground border-border"}
              >
                {instagramAccounts.length > 0 ? "Connected" : "Not Connected"}
              </Badge>
              <Button className="gradient-primary text-primary-foreground" size="sm" disabled>
                Connect via Facebook
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* YouTube */}
        <Card className="bg-card border-border shadow-card">
          <CardContent className="flex items-center justify-between py-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
                <PlatformIcon platform="youtube" size={24} />
              </div>
              <div>
                <h3 className="font-medium text-foreground">YouTube</h3>
                <p className="text-xs text-muted-foreground">
                  {youtubeAccounts.length > 0 ? `${youtubeAccounts.length} channel(s) connected` : "Not connected"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className={youtubeAccounts.length > 0
                  ? "bg-status-published/20 text-status-published border-status-published/30"
                  : "bg-secondary text-muted-foreground border-border"}
              >
                {youtubeAccounts.length > 0 ? "Connected" : "Not Connected"}
              </Badge>
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
            </div>
          </CardContent>
        </Card>

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

        {/* Facebook pages */}
        {facebookPages.length > 0 && (
          <div className="grid gap-3">
            {facebookPages.map((a) => {
              const category = (a as any)?.metadata?.category as string | undefined;
              return (
                <Card key={a.id} className="bg-card border-border shadow-card">
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
                        <PlatformIcon platform="facebook" size={20} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{a.account_name ?? "Facebook Page"}</div>
                        <div className="text-xs text-muted-foreground">{category ?? a.account_id}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="bg-status-published/20 text-status-published border-status-published/30">
                        Connected
                      </Badge>
                      <Switch
                        checked={!!a.is_connected}
                        onCheckedChange={(next) => setConnected("facebook", a.account_id, next)}
                      />
                      <Button variant="outline" size="sm" onClick={() => setConnected("facebook", a.account_id, false)}>
                        Disconnect
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Instagram accounts */}
        <div className="space-y-2">
          {instagramAccounts.length > 0 ? (
            <div className="grid gap-3">
              {instagramAccounts.map((a) => {
                const followers = (a as any)?.metadata?.followers_count as number | undefined;
                return (
                  <Card key={a.id} className="bg-card border-border shadow-card">
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
                          <PlatformIcon platform="instagram" size={20} />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-foreground">{a.account_name ?? "Instagram"}</div>
                          <div className="text-xs text-muted-foreground">
                            {typeof followers === "number" ? `${followers.toLocaleString()} followers` : a.account_id}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="bg-status-published/20 text-status-published border-status-published/30">
                          Connected
                        </Badge>
                        <Switch
                          checked={!!a.is_connected}
                          onCheckedChange={(next) => setConnected("instagram", a.account_id, next)}
                        />
                        <Button variant="outline" size="sm" onClick={() => setConnected("instagram", a.account_id, false)}>
                          Disconnect
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="bg-card border-border shadow-card">
              <CardContent className="py-4 text-sm text-muted-foreground">
                No Instagram Business accounts found. Make sure your Instagram is connected to a Facebook Page.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
