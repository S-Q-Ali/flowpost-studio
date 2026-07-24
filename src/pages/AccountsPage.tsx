import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePageLoading } from "@/hooks/usePageLoading";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Switch } from "@/components/ui/switch";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { BetaBadge } from "@/components/BetaBadge";
import { useAuth } from "@/contexts/AuthContext";
import type { ConnectedAccount, Platform } from "@/lib/types";

export default function AccountsPage() {
  const { userId } = useAuth();
  const { loading, done } = usePageLoading();
  const [isYouTubeConnecting, setIsYouTubeConnecting] = useState(false);
  const [isFacebookConnecting, setIsFacebookConnecting] = useState(false);
  const [reconnectingFacebookId, setReconnectingFacebookId] = useState<string | null>(null);
  const [isTikTokConnecting, setIsTikTokConnecting] = useState(false);
  const [isLinkedInConnecting, setIsLinkedInConnecting] = useState(false);
  const [isDriveConnecting, setIsDriveConnecting] = useState(false);
  const [reconnectingDriveId, setReconnectingDriveId] = useState<string | null>(null);
  const [isMegaConnecting, setIsMegaConnecting] = useState(false);
  const [showMegaForm, setShowMegaForm] = useState(false);
  const [megaEmail, setMegaEmail] = useState("");
  const [megaPassword, setMegaPassword] = useState("");

  const [facebookPages, setFacebookPages] = useState<ConnectedAccount[]>([]);
  const [instagramAccounts, setInstagramAccounts] = useState<ConnectedAccount[]>([]);
  const [youtubeConnectedAccounts, setYoutubeConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [tiktokAccounts, setTiktokAccounts] = useState<ConnectedAccount[]>([]);
  const [linkedinAccounts, setLinkedinAccounts] = useState<ConnectedAccount[]>([]);
  const [driveAccounts, setDriveAccounts] = useState<ConnectedAccount[]>([]);
  const [megaAccounts, setMegaAccounts] = useState<ConnectedAccount[]>([]);
  const [megaFiles, setMegaFiles] = useState<Record<string, { name: string; size: number }[]>>({});
  const [megaFilesLoading, setMegaFilesLoading] = useState<Record<string, boolean>>({});
  const [youtubeQuota, setYoutubeQuota] = useState<{ percentage: number; uploadCount: number; estimatedUploadsRemaining: number } | null>(null);

  const fetchFacebook = async (): Promise<ConnectedAccount[]> => {
    const { data, error } = await supabase
      .from("connected_accounts")
      .select("*")
      .eq("user_id", userId)
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
      .eq("user_id", userId)
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
      .eq("user_id", userId)
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

  const fetchMega = async (): Promise<ConnectedAccount[]> => {
    const { data, error } = await supabase
      .from("connected_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("platform", "mega")
      .eq("is_connected", true);

    if (error) {
      toast.error(error.message);
      return [];
    }

    const list = (data as ConnectedAccount[]) ?? [];
    setMegaAccounts(list);
    return list;
  };

  const fetchDrive = async (): Promise<ConnectedAccount[]> => {
    const { data, error } = await supabase
      .from("connected_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("platform", "google_drive")
      .eq("is_connected", true);

    if (error) {
      toast.error(error.message);
      return [];
    }

    const list = (data as ConnectedAccount[]) ?? [];
    setDriveAccounts(list);
    return list;
  };

  const fetchTikTok = async (): Promise<ConnectedAccount[]> => {
    const { data, error } = await supabase
      .from("connected_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("platform", "tiktok")
      .eq("is_connected", true);

    if (error) {
      toast.error(error.message);
      return [];
    }

    const list = (data as ConnectedAccount[]) ?? [];
    setTiktokAccounts(list);
    return list;
  };

  const fetchLinkedIn = async (): Promise<ConnectedAccount[]> => {
    const { data, error } = await supabase
      .from("connected_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("platform", "linkedin")
      .eq("is_connected", true);

    if (error) {
      toast.error(error.message);
      return [];
    }

    const list = (data as ConnectedAccount[]) ?? [];
    setLinkedinAccounts(list);
    return list;
  };

  const [searchParams, setSearchParams] = useSearchParams();

  const refreshAll = async () => {
    await Promise.all([fetchFacebook(), fetchInstagram(), fetchYouTube(), fetchTikTok(), fetchLinkedIn(), fetchDrive(), fetchMega()]);
  };

  useEffect(() => {
    let cancelled = false;
    refreshAll().finally(() => { if (!cancelled) done(); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const platform = searchParams.get("connected");
    if (!platform) return;
    const label: Record<string, string> = {
      facebook: "Facebook & Instagram",
      drive: "Google Drive",
      tiktok: "TikTok",
      youtube: "YouTube",
    };
    toast.success(`${label[platform] || platform} connected!`);
    setSearchParams({}, { replace: true });
    if (window.opener) {
      window.opener.postMessage({ type: "oauth-connected", platform }, "*");
      setTimeout(() => window.close(), 1500);
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "oauth-connected") {
        const p = event.data.platform;
        if (p === "facebook") setIsFacebookConnecting(false);
        else if (p === "youtube") setIsYouTubeConnecting(false);
        else if (p === "drive") setIsDriveConnecting(false);
        else if (p === "tiktok") setIsTikTokConnecting(false);
        refreshAll();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-quota-usage?platform=youtube`,
          { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` } },
        );
        if (res.ok) setYoutubeQuota(await res.json());
      } catch { /* ignore */ }
    })();
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
          filter: `user_id=eq.${userId}`,
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
          filter: `user_id=eq.${userId}`,
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
      const { data, error } = await supabase.functions.invoke(`youtube-auth?action=url&userId=${userId}`, {
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

      window.open(data.url, "youtube-auth", "width=600,height=700,scrollbars=yes");
    } catch (e: any) {
      toast.error(e.message || "YouTube connection failed");
      setIsYouTubeConnecting(false);
    }
  };

  const connectFacebook = async () => {
    setIsFacebookConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke(`facebook-auth?action=url&userId=${userId}`, {
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

      window.open(data.url, "facebook-auth", "width=600,height=700,scrollbars=yes");
    } catch (e: any) {
      toast.error(e.message || "Facebook connection failed");
      setIsFacebookConnecting(false);
    }
  };

  const reconnectFacebook = async () => {
    setReconnectingFacebookId("facebook");
    try {
      const { data, error } = await supabase.functions.invoke(`facebook-auth?action=url&userId=${userId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      });

      if (error) throw new Error(error.message || "Failed to start Facebook OAuth");
      if (!data?.url) throw new Error("Missing OAuth URL");

      let timeoutId: ReturnType<typeof setTimeout>;
      const channel = supabase
        .channel("facebook-reconnect")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "connected_accounts", filter: "platform=eq.facebook" },
          () => {
            channel.unsubscribe();
            clearTimeout(timeoutId);
            refreshAll();
            toast.success("Facebook reconnected!");
            setReconnectingFacebookId(null);
          },
        )
        .subscribe();

      timeoutId = setTimeout(() => {
        channel.unsubscribe();
        setReconnectingFacebookId(null);
        toast.error("Reconnection timed out. Try again.");
      }, 10 * 60 * 1000);

      window.open(data.url, "facebook-auth", "width=600,height=700,scrollbars=yes");
    } catch (e: any) {
      toast.error(e.message || "Facebook reconnection failed");
      setReconnectingFacebookId(null);
    }
  };

  const connectTikTok = async () => {
    setIsTikTokConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke(`tiktok-auth?action=url&userId=${userId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      });

      if (error) throw new Error(error.message || "Failed to start TikTok OAuth");
      if (!data?.url) throw new Error("Missing OAuth URL");

      let timeoutId: ReturnType<typeof setTimeout>;
      const channel = supabase
        .channel("tiktok-connected")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "connected_accounts",
            filter: "platform=eq.tiktok",
          },
          () => {
            clearTimeout(timeoutId);
            channel.unsubscribe();
            fetchTikTok();
            toast.success("TikTok connected!");
            setIsTikTokConnecting(false);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "connected_accounts",
            filter: "platform=eq.tiktok",
          },
          () => {
            clearTimeout(timeoutId);
            channel.unsubscribe();
            fetchTikTok();
            toast.success("TikTok connected!");
            setIsTikTokConnecting(false);
          },
        )
        .subscribe();

      timeoutId = setTimeout(() => {
        channel.unsubscribe();
        setIsTikTokConnecting(false);
      }, 5 * 60 * 1000);

      window.open(data.url, "tiktok-auth", "width=600,height=700,scrollbars=yes");
    } catch (e: any) {
      toast.error(e.message || "TikTok connection failed");
      setIsTikTokConnecting(false);
    }
  };

  const connectLinkedIn = async () => {
    setIsLinkedInConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("linkedin-auth", {
        method: "POST",
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: { action: "url", userId },
      });

      if (error) throw new Error(error.message || "Failed to start LinkedIn OAuth");
      if (!data?.url) throw new Error("Missing OAuth URL");

      let timeoutId: ReturnType<typeof setTimeout>;
      const channel = supabase
        .channel("linkedin-connected")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "connected_accounts",
            filter: "platform=eq.linkedin",
          },
          () => {
            clearTimeout(timeoutId);
            channel.unsubscribe();
            fetchLinkedIn();
            toast.success("LinkedIn connected!");
            setIsLinkedInConnecting(false);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "connected_accounts",
            filter: "platform=eq.linkedin",
          },
          () => {
            clearTimeout(timeoutId);
            channel.unsubscribe();
            fetchLinkedIn();
            toast.success("LinkedIn connected!");
            setIsLinkedInConnecting(false);
          },
        )
        .subscribe();

      timeoutId = setTimeout(() => {
        channel.unsubscribe();
        setIsLinkedInConnecting(false);
      }, 5 * 60 * 1000);

      window.open(data.url, "linkedin-auth", "width=600,height=700,scrollbars=yes");
    } catch (e: any) {
      toast.error(e.message || "LinkedIn connection failed");
      setIsLinkedInConnecting(false);
    }
  };

  const connectDrive = async () => {
    setIsDriveConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke(`google-drive-auth?action=url&userId=${userId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      });

      if (error) throw new Error(error.message || "Failed to start Google Drive OAuth");
      if (!data?.url) throw new Error("Missing OAuth URL");

      let timeoutId: ReturnType<typeof setTimeout>;
      const channel = supabase
        .channel("drive-connected")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "connected_accounts",
            filter: "platform=eq.google_drive",
          },
          () => {
            clearTimeout(timeoutId);
            channel.unsubscribe();
            fetchDrive();
            toast.success("Google Drive connected!");
            setIsDriveConnecting(false);
          },
        )
        .subscribe();

      timeoutId = setTimeout(() => {
        channel.unsubscribe();
        setIsDriveConnecting(false);
      }, 5 * 60 * 1000);

      window.open(data.url, "drive-auth", "width=600,height=700,scrollbars=yes");
    } catch (e: any) {
      toast.error(e.message || "Google Drive connection failed");
      setIsDriveConnecting(false);
    }
  };

  const reconnectDrive = async (rowId: string, email?: string) => {
    setReconnectingDriveId(rowId);
    try {
      let url = `google-drive-auth?action=url&userId=${userId}`;
      if (email) url += `&login_hint=${encodeURIComponent(email)}`;
      const { data, error } = await supabase.functions.invoke(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      });

      if (error) throw new Error(error.message || "Failed to start Google Drive OAuth");
      if (!data?.url) throw new Error("Missing OAuth URL");

      let timeoutId: ReturnType<typeof setTimeout>;
      const channel = supabase
        .channel(`drive-reconnect-${rowId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "connected_accounts",
            filter: `id=eq.${rowId}`,
          },
          () => {
            clearTimeout(timeoutId);
            channel.unsubscribe();
            fetchDrive();
            toast.success("Google Drive reconnected!");
            setReconnectingDriveId(null);
          },
        )
        .subscribe();

      timeoutId = setTimeout(() => {
        channel.unsubscribe();
        setReconnectingDriveId(null);
        toast.error("Reconnection timed out. Try again.");
      }, 30_000);

      window.open(data.url, "drive-auth", "width=600,height=700,scrollbars=yes");
    } catch (e: any) {
      toast.error(e.message || "Google Drive reconnection failed");
      setReconnectingDriveId(null);
    }
  };

  const connectMega = async () => {
    if (!megaEmail.trim() || !megaPassword.trim()) {
      toast.error("Enter email and password");
      return;
    }
    setIsMegaConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("mega-auth", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "connect",
          email: megaEmail.trim(),
          password: megaPassword.trim(),
          userId,
        }),
      });

      if (error || data?.error) throw new Error(data?.error || error?.message || "Mega connection failed");
      setMegaEmail("");
      setMegaPassword("");
      setShowMegaForm(false);
      toast.success("Mega connected!");
      fetchMega();
    } catch (e: any) {
      toast.error(e.message || "Mega connection failed");
    } finally {
      setIsMegaConnecting(false);
    }
  };

  const listMegaFiles = async (accountId: string) => {
    setMegaFilesLoading((prev) => ({ ...prev, [accountId]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("mega-auth", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "files", account_id: accountId }),
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setMegaFiles((prev) => ({ ...prev, [accountId]: data.files }));
    } catch (e: any) {
      toast.error(e.message || "Failed to list files");
    } finally {
      setMegaFilesLoading((prev) => ({ ...prev, [accountId]: false }));
    }
  };

  const disconnectYouTube = async (accountId: string | null | undefined) => {
    if (!accountId) return;
    const { error } = await supabase
      .from("connected_accounts")
      .update({ is_connected: false })
      .eq("user_id", userId)
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
      .eq("user_id", userId)
      .eq("platform", platform)
      .eq("account_id", accountId);

    if (error) {
      toast.error(error.message);
      return;
    }

    refreshAll();
  };

  const disconnectTikTok = async (accountId: string | null | undefined) => {
    if (!accountId) return;
    const { error } = await supabase
      .from("connected_accounts")
      .update({ is_connected: false })
      .eq("user_id", userId)
      .eq("platform", "tiktok")
      .eq("account_id", accountId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("TikTok disconnected");
    fetchTikTok();
  };

  const disconnectLinkedIn = async (accountId: string | null | undefined) => {
    if (!accountId) return;
    const { error } = await supabase
      .from("connected_accounts")
      .update({ is_connected: false })
      .eq("user_id", userId)
      .eq("platform", "linkedin")
      .eq("account_id", accountId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("LinkedIn disconnected");
    fetchLinkedIn();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-64" />
        </div>
        {["Facebook & Instagram", "YouTube", "TikTok", "LinkedIn", "Google Drive", "Mega"].map((section) => (
          <Card key={section}>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-5" />
                  <Skeleton className="h-5 w-36" />
                </div>
                <Skeleton className="h-8 w-28" />
              </div>
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

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
                ) : facebookPages.length > 0 ? (
                  "Add another account"
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
                ) : youtubeAccounts.length > 0 ? (
                  "Add another channel"
                ) : (
                  "Connect YouTube Account"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* TikTok */}
        <Card className="bg-card border-border shadow-card">
          <CardContent className="flex items-center justify-between py-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
                <PlatformIcon platform="tiktok" size={24} />
              </div>
              <div>
                <h3 className="font-medium text-foreground">TikTok <BetaBadge /></h3>
                <p className="text-xs text-muted-foreground">
                  {tiktokAccounts.length > 0 ? `${tiktokAccounts[0].account_name ?? "Connected"}` : "Not connected"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className={tiktokAccounts.length > 0
                  ? "bg-status-published/20 text-status-published border-status-published/30"
                  : "bg-secondary text-muted-foreground border-border"}
              >
                {tiktokAccounts.length > 0 ? "Connected" : "Not Connected"}
              </Badge>
              {tiktokAccounts.length > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => disconnectTikTok(tiktokAccounts[0].account_id)}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  className="gradient-primary text-primary-foreground"
                  size="sm"
                  onClick={connectTikTok}
                  disabled={isTikTokConnecting}
                >
                  {isTikTokConnecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting…
                    </>
                  ) : (
                    "Connect TikTok Account"
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* LinkedIn */}
        <Card className="bg-card border-border shadow-card">
          <CardContent className="flex items-center justify-between py-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
                <PlatformIcon platform="linkedin" size={24} />
              </div>
              <div>
                <h3 className="font-medium text-foreground">LinkedIn <BetaBadge /></h3>
                <p className="text-xs text-muted-foreground">
                  {linkedinAccounts.length > 0 ? `${linkedinAccounts[0].account_name ?? "Connected"}` : "Not connected"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className={linkedinAccounts.length > 0
                  ? "bg-status-published/20 text-status-published border-status-published/30"
                  : "bg-secondary text-muted-foreground border-border"}
              >
                {linkedinAccounts.length > 0 ? "Connected" : "Not Connected"}
              </Badge>
              {linkedinAccounts.length > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => disconnectLinkedIn(linkedinAccounts[0].account_id)}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  className="gradient-primary text-primary-foreground"
                  size="sm"
                  onClick={connectLinkedIn}
                  disabled={isLinkedInConnecting}
                >
                  {isLinkedInConnecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting…
                    </>
                  ) : (
                    "Connect LinkedIn Account"
                  )}
                </Button>
              )}
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
                    {youtubeQuota && youtubeQuota.percentage >= 50 && (
                      <Badge
                        variant="outline"
                        className={
                          youtubeQuota.percentage >= 80
                            ? "bg-red-500/20 text-destructive border-red-500/30 text-[10px]"
                            : "bg-yellow-500/20 text-yellow-600 border-yellow-500/30 text-[10px]"
                        }
                      >
                        {youtubeQuota.percentage >= 80
                          ? `${youtubeQuota.estimatedUploadsRemaining} uploads left today`
                          : `${youtubeQuota.percentage}% quota used`}
                      </Badge>
                    )}
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={reconnectFacebook}
                        disabled={reconnectingFacebookId === "facebook"}
                        title="Reconnect to update permissions"
                      >
                        <RefreshCw className={`h-4 w-4 ${reconnectingFacebookId === "facebook" ? "animate-spin" : ""}`} />
                      </Button>
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

        {/* Google Drive accounts */}
        <div className="space-y-2">
          {driveAccounts.length > 0 && (
            <div className="grid gap-3">
              {driveAccounts.map((a) => {
                const email = (a as any)?.metadata?.email as string | undefined;
                return (
                  <Card key={a.id} className="bg-card border-border shadow-card">
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className="text-green-500">
                            <path d="M12.24 10.28 7.81 2.57H4.28l4.2 7.71h3.76Z" />
                            <path d="M16.06 2.57h-4.1l4.2 7.71h4.1l-4.2-7.71Z" />
                            <path d="M17.56 14.36 19.2 11.4H8.25l-4.3 7.46H13.7l3.86-4.5Z" />
                            <path d="M17.56 14.36 19.2 11.4H8.25l-4.3 7.46H13.7l3.86-4.5Z" opacity="0.5" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-foreground">{a.account_name ?? "Google Drive"}</div>
                          <div className="text-xs text-muted-foreground">{email ?? a.account_id}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="bg-status-published/20 text-status-published border-status-published/30">
                          Connected
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={reconnectingDriveId === a.id}
                          onClick={() => reconnectDrive(a.id!, email ?? a.account_id)}
                          title="Reconnect this account"
                        >
                          <RefreshCw className={`h-4 w-4 ${reconnectingDriveId === a.id ? "animate-spin" : ""}`} />
                        </Button>
                        <Button variant="outline" size="sm" onClick={async () => {
                          if (!a.id) return;
                          await supabase.from("connected_accounts").update({ is_connected: false }).eq("id", a.id);
                          fetchDrive();
                          toast.success("Google Drive disconnected");
                        }}>
                          Disconnect
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          <Button
            className="gradient-primary text-primary-foreground w-full"
            size="sm"
            onClick={connectDrive}
            disabled={isDriveConnecting}
          >
            {isDriveConnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting…
              </>
            ) : (
              "Connect Google Drive"
            )}
          </Button>
        </div>

        {/* Mega accounts */}
        <div className="space-y-2">
          {megaAccounts.length > 0 && (
            <div className="grid gap-3">
              {megaAccounts.map((a) => (
                <Card key={a.id} className="bg-card border-border shadow-card">
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className="text-red-500">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-4-4 1.41-1.41L11 14.17l5.59-5.59L18 10l-7 7z"/>
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">Mega</div>
                        <div className="text-xs text-muted-foreground">{a.account_name}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="bg-status-published/20 text-status-published border-status-published/30">
                        Connected
                      </Badge>
                      <Button variant="outline" size="sm" onClick={() => a.id && listMegaFiles(a.id)} disabled={megaFilesLoading[a.id!]}>
                        {megaFilesLoading[a.id!] ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        Files
                      </Button>
                      <Button variant="outline" size="sm" onClick={async () => {
                        if (!a.id) return;
                        await supabase.from("connected_accounts").update({ is_connected: false }).eq("id", a.id);
                        fetchMega();
                        toast.success("Mega disconnected");
                      }}>
                        Disconnect
                      </Button>
                    </div>
                  </CardContent>
                  {a.id && megaFiles[a.id] && (
                    <div className="border-t border-border px-4 py-3 max-h-48 overflow-y-auto">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Root files:</p>
                      {megaFiles[a.id].length === 0 ? (
                        <p className="text-xs text-muted-foreground">No files in root</p>
                      ) : (
                        <div className="space-y-1">
                          {megaFiles[a.id].map((f, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-foreground font-mono">{f.name}</span>
                              <span className="text-muted-foreground">{(f.size / 1048576).toFixed(1)} MB</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
          {showMegaForm ? (
            <div className="space-y-2 p-3 rounded-lg bg-secondary/50 border border-border">
              <Input
                placeholder="Mega email"
                type="email"
                value={megaEmail}
                onChange={(e) => setMegaEmail(e.target.value)}
              />
              <Input
                placeholder="Mega password"
                type="password"
                value={megaPassword}
                onChange={(e) => setMegaPassword(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  className="gradient-primary text-primary-foreground flex-1"
                  size="sm"
                  onClick={connectMega}
                  disabled={isMegaConnecting}
                >
                  {isMegaConnecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting…
                    </>
                  ) : (
                    "Connect"
                  )}
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setShowMegaForm(false); setMegaEmail(""); setMegaPassword(""); }}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              className="gradient-primary text-primary-foreground w-full"
              size="sm"
              onClick={() => setShowMegaForm(true)}
            >
              Connect Mega
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
