import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/PlatformIcon";
import { User } from "lucide-react";
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

  const fetchAccounts = async () => {
    const { data } = await supabase.from("connected_accounts").select("*").eq("user_id", PERSONAL_USER_ID);
    setAccounts((data as any) ?? []);
  };

  useEffect(() => { fetchAccounts(); }, []);

  const getAccount = (platform: Platform) => accounts.find((a) => a.platform === platform);

  const connect = async (platform: Platform) => {
    const existing = getAccount(platform);
    if (existing) {
      await supabase.from("connected_accounts").update({ is_connected: true, account_name: `My ${platform} account`, connected_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      await supabase.from("connected_accounts").insert({ user_id: PERSONAL_USER_ID, platform, account_name: `My ${platform} account`, is_connected: true, connected_at: new Date().toISOString() });
    }
    toast.success(`${platform} connected (mock)`);
    fetchAccounts();
  };

  const disconnect = async (platform: Platform) => {
    const account = getAccount(platform);
    if (!account) return;
    await supabase.from("connected_accounts").update({ is_connected: false }).eq("id", account.id);
    toast.success(`${platform} disconnected`);
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
          const connected = account?.is_connected ?? false;
          return (
            <Card key={platform} className="bg-card border-border shadow-card">
              <CardContent className="flex items-center justify-between py-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
                    <PlatformIcon platform={platform} size={24} />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">{label}</h3>
                    {connected ? (
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
                  {connected ? (
                    <Button variant="outline" size="sm" onClick={() => disconnect(platform)}>Disconnect</Button>
                  ) : (
                    <Button className="gradient-primary text-primary-foreground" size="sm" onClick={() => connect(platform)}>Connect Account</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
