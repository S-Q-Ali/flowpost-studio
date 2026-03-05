import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/PlatformIcon";
import { StatusBadge } from "@/components/StatusBadge";
import { Video, Upload, Calendar, Link2, Plus } from "lucide-react";
import type { Post, Platform, PostStatus } from "@/lib/types";

const PERSONAL_USER_ID = "00000000-0000-0000-0000-000000000000";

export default function Dashboard() {
  const [stats, setStats] = useState({ videos: 0, scheduled: 0, published: 0, accounts: 0 });
  const [recentPosts, setRecentPosts] = useState<Post[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const [{ count: videos }, { count: scheduled }, { count: published }, { count: accounts }, { data: posts }] =
        await Promise.all([
          supabase.from("videos").select("*", { count: "exact", head: true }).eq("user_id", PERSONAL_USER_ID),
          supabase.from("posts").select("*", { count: "exact", head: true }).eq("user_id", PERSONAL_USER_ID).eq("status", "scheduled"),
          supabase.from("posts").select("*", { count: "exact", head: true }).eq("user_id", PERSONAL_USER_ID).eq("status", "published"),
          supabase.from("connected_accounts").select("*", { count: "exact", head: true }).eq("user_id", PERSONAL_USER_ID).eq("is_connected", true),
          supabase.from("posts").select("*, videos(*)").eq("user_id", PERSONAL_USER_ID).order("created_at", { ascending: false }).limit(5),
        ]);
      setStats({
        videos: videos ?? 0,
        scheduled: scheduled ?? 0,
        published: published ?? 0,
        accounts: accounts ?? 0,
      });
      setRecentPosts((posts as any) ?? []);
    };
    fetchData();
  }, []);

  const statCards = [
    { label: "Videos Uploaded", value: stats.videos, icon: Video, color: "text-primary" },
    { label: "Scheduled", value: stats.scheduled, icon: Calendar, color: "text-status-scheduled" },
    { label: "Published", value: stats.published, icon: Upload, color: "text-status-published" },
    { label: "Connected Accounts", value: stats.accounts, icon: Link2, color: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of your content distribution</p>
        </div>
        <Button asChild className="gradient-primary text-primary-foreground gap-2">
          <Link to="/upload"><Plus size={16} /> Upload & Distribute</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label} className="bg-card border-border shadow-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-3xl font-bold text-foreground mt-1">{s.value}</p>
                </div>
                <s.icon size={28} className={s.color} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-foreground">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentPosts.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No posts yet. Upload your first video to get started!</p>
          ) : (
            <div className="space-y-3">
              {recentPosts.map((post) => (
                <div key={post.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <PlatformIcon platform={post.platform as Platform} size={20} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{(post as any).videos?.title ?? "Untitled"}</p>
                      <p className="text-xs text-muted-foreground">
                        {post.scheduled_at ? new Date(post.scheduled_at).toLocaleString() : "—"}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={post.status as PostStatus} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
