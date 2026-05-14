import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlatformIcon } from "@/components/PlatformIcon";
import { StatusBadge } from "@/components/StatusBadge";
import { ChevronLeft, ChevronRight, List, CalendarDays } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from "date-fns";
import { PERSONAL_USER_ID } from "@/lib/constants";
import type { Post, Platform, PostStatus } from "@/lib/types";
import { toast } from "sonner";

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [view, setView] = useState<"month" | "list">("month");

  const fetchPosts = async () => {
    const start = startOfMonth(currentMonth).toISOString();
    const end = endOfMonth(currentMonth).toISOString();
    const { data } = await supabase
      .from("posts")
      .select("*, videos(*)")
      .eq("user_id", PERSONAL_USER_ID)
      .gte("scheduled_at", start)
      .lte("scheduled_at", end)
      .order("scheduled_at", { ascending: true });
    setPosts((data as any) ?? []);
  };

  useEffect(() => {
    let cancelled = false;
    fetchPosts().then(() => { if (cancelled) setPosts([]); });
    return () => { cancelled = true; };
  }, [currentMonth]);

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const startDayOfWeek = startOfMonth(currentMonth).getDay();

  const cancelPost = async (post: Post) => {
    await supabase.from("posts").delete().eq("id", post.id);
    toast.success("Post cancelled");
    setSelectedPost(null);
    fetchPosts();
  };

  const statusColor = (status: PostStatus) => {
    if (status === "published") return "bg-status-published";
    if (status === "failed") return "bg-status-failed";
    if (status === "processing") return "bg-status-processing";
    return "bg-status-scheduled";
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Content Calendar</h1>
          <p className="text-sm text-muted-foreground">{format(currentMonth, "MMMM yyyy")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setView(view === "month" ? "list" : "month")}>
            {view === "month" ? <List size={16} /> : <CalendarDays size={16} />}
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft size={16} /></Button>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight size={16} /></Button>
        </div>
      </div>

      {view === "month" ? (
        <Card className="bg-card border-border shadow-card overflow-hidden">
          <CardContent className="p-0">
            <div className="grid grid-cols-7">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-center text-xs text-muted-foreground py-3 border-b border-border font-medium">{d}</div>
              ))}
              {Array.from({ length: startDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-border" />
              ))}
              {days.map((day) => {
                const dayPosts = posts.filter((p) => p.scheduled_at && isSameDay(new Date(p.scheduled_at), day));
                return (
                  <div key={day.toISOString()} className="min-h-[100px] border-b border-r border-border p-1.5">
                    <p className="text-xs text-muted-foreground mb-1">{format(day, "d")}</p>
                    <div className="space-y-1">
                      {dayPosts.slice(0, 3).map((post) => (
                        <button
                          key={post.id}
                          onClick={() => setSelectedPost(post)}
                          className={`w-full flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] truncate ${statusColor(post.status as PostStatus)}/20 hover:${statusColor(post.status as PostStatus)}/30 transition-colors text-foreground`}
                        >
                          <PlatformIcon platform={post.platform as Platform} size={10} />
                          <span className="truncate">{(post as any).videos?.title ?? "—"}</span>
                        </button>
                      ))}
                      {dayPosts.length > 3 && (
                        <p className="text-[10px] text-muted-foreground px-1">+{dayPosts.length - 3} more</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {posts.length === 0 ? (
            <Card className="bg-card border-border shadow-card"><CardContent className="py-12 text-center text-muted-foreground">No posts this month</CardContent></Card>
          ) : posts.map((post) => (
            <Card key={post.id} className="bg-card border-border shadow-card cursor-pointer hover:bg-secondary/50 transition-colors" onClick={() => setSelectedPost(post)}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <PlatformIcon platform={post.platform as Platform} size={18} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{(post as any).videos?.title ?? "Untitled"}</p>
                    <p className="text-xs text-muted-foreground">{post.scheduled_at ? format(new Date(post.scheduled_at), "PPp") : "—"}</p>
                  </div>
                </div>
                <StatusBadge status={post.status as PostStatus} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedPost} onOpenChange={() => setSelectedPost(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="text-foreground">{(selectedPost as any)?.videos?.title ?? "Post Details"}</DialogTitle></DialogHeader>
          {selectedPost && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <PlatformIcon platform={selectedPost.platform as Platform} />
                <StatusBadge status={selectedPost.status as PostStatus} />
              </div>
              {selectedPost.caption && <div><p className="text-xs text-muted-foreground mb-1">Caption</p><p className="text-sm text-foreground">{selectedPost.caption}</p></div>}
              {selectedPost.scheduled_at && <div><p className="text-xs text-muted-foreground mb-1">Scheduled</p><p className="text-sm text-foreground">{format(new Date(selectedPost.scheduled_at), "PPpp")}</p></div>}
              {selectedPost.status === "scheduled" && (
                <Button variant="destructive" className="w-full" onClick={() => cancelPost(selectedPost)}>Cancel Post</Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
