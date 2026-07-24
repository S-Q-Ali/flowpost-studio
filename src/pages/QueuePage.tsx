import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePageLoading } from "@/hooks/usePageLoading";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PlatformIcon } from "@/components/PlatformIcon";
import { StatusBadge } from "@/components/StatusBadge";
import { Trash2, Pencil, ListTodo, Video, CalendarIcon, RotateCw } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { Post, Platform, PostStatus } from "@/lib/types";
const filters = ["all", "scheduled", "processing", "published", "failed"] as const;

type PostWithDetails = Post & { channelName?: string | null };

export default function QueuePage() {
  const { userId } = useAuth();
  const { loading, done } = usePageLoading();
  const [posts, setPosts] = useState<PostWithDetails[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editPost, setEditPost] = useState<PostWithDetails | null>(null);
  const [deletePostId, setDeletePostId] = useState<string | null>(null);

  // Edit form state
  const [editCaption, setEditCaption] = useState("");
  const [editHashtags, setEditHashtags] = useState("");
  const [editContainsAltered, setEditContainsAltered] = useState(false);
  const [editScheduleDate, setEditScheduleDate] = useState<Date>();
  const [editScheduleTime, setEditScheduleTime] = useState("12:00");
  const [saving, setSaving] = useState(false);

  const fetchPosts = async () => {
    if (!userId) return;
    const { data: postsData } = await supabase
      .from("posts")
      .select("*, videos(id, title, file_url, thumbnail_url, uploaded_at)")
      .eq("user_id", userId)
      .order("scheduled_at", { ascending: true });

    let list = (postsData as PostWithDetails[]) ?? [];
    if (filter !== "all") list = list.filter((p) => p.status === filter);

    const accountIds = [...new Set(list.map((p) => p.account_id).filter(Boolean))] as string[];
    let accountMap: Record<string, string> = {};
    if (accountIds.length > 0) {
      const { data: accounts } = await supabase
        .from("connected_accounts")
        .select("account_id, account_name")
        .eq("user_id", userId)
        .in("account_id", accountIds);
      if (accounts) {
        accountMap = Object.fromEntries(accounts.map((a) => [a.account_id, a.account_name ?? ""]));
      }
    }

    setPosts(
      list.map((p) => ({
        ...p,
        channelName: p.account_id ? accountMap[p.account_id] ?? null : null,
      })),
    );
  };

  useEffect(() => {
    fetchPosts().finally(done);
  }, [filter]);

  const openEdit = (post: PostWithDetails) => {
    setEditPost(post);
    setEditCaption(post.caption ?? "");
    setEditHashtags(post.hashtags ?? "");
    setEditContainsAltered(post.contains_altered_content ?? false);
    if (post.scheduled_at) {
      const d = new Date(post.scheduled_at);
      setEditScheduleDate(d);
      setEditScheduleTime(format(d, "HH:mm"));
    } else {
      setEditScheduleDate(undefined);
      setEditScheduleTime("12:00");
    }
  };

  const saveEdit = async () => {
    if (!editPost) return;
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {
        caption: editCaption,
        hashtags: editHashtags,
        contains_altered_content: editContainsAltered,
      };
      if (editPost.status === "scheduled" && editScheduleDate) {
        const [h, m] = editScheduleTime.split(":").map(Number);
        const d = new Date(editScheduleDate);
        d.setHours(h, m, 0, 0);
        updates.scheduled_at = d.toISOString();
      }
      const { error } = await supabase.from("posts").update(updates).eq("id", editPost.id);
      if (error) throw error;
      toast.success("Post updated");
      setEditPost(null);
      fetchPosts();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(posts.map((p) => p.id)));

  const selectCount = (n: number) =>
    setSelected(new Set(posts.slice(0, n).map((p) => p.id)));

  const clearSelection = () => setSelected(new Set());

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    const { error } = await supabase.from("posts").delete().in("id", Array.from(selected));
    if (error) toast.error(error.message);
    else {
      toast.success(`${selected.size} posts deleted`);
      setSelected(new Set());
      fetchPosts();
    }
  };

  const deleteOne = async (id: string) => {
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Post deleted");
      setDeletePostId(null);
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
      fetchPosts();
    }
  };

  const handleRetry = async (postId: string) => {
    const { error } = await supabase
      .from("posts")
      .update({
        status: "scheduled",
        scheduled_at: new Date(Date.now() + 60000).toISOString(),
      })
      .eq("id", postId)
      .eq("status", "failed");

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Post rescheduled for retry");
      fetchPosts();
    }
  };

  const videoTitle = (post: PostWithDetails) => (post as { videos?: { title?: string } }).videos?.title ?? "Untitled";
  const videoThumb = (post: PostWithDetails) => (post as { videos?: { thumbnail_url?: string | null; file_url?: string | null } }).videos?.thumbnail_url ?? (post as { videos?: { file_url?: string | null } }).videos?.file_url;

  const isVideoExpired = (post: PostWithDetails) => {
    const uploadedAt = (post as { videos?: { uploaded_at?: string } }).videos?.uploaded_at;
    if (!uploadedAt) return true;
    return Date.now() - new Date(uploadedAt).getTime() > 24 * 60 * 60 * 1000;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-8 w-20" />
          ))}
        </div>
        <Card>
          <CardContent className="space-y-3 p-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 py-3 border-b border-border last:border-0">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Post Queue</h1>
          <p className="text-sm text-muted-foreground">{posts.length} posts</p>
        </div>
        {posts.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={() => selectCount(20)}>
              Select 20
            </Button>
            {selected.size > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={clearSelection}>
                  Clear
                </Button>
                <Button variant="destructive" size="sm" onClick={bulkDelete} className="gap-2">
                  <Trash2 size={14} /> Delete {selected.size}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {filters.map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            className={filter === f ? "gradient-primary text-primary-foreground" : ""}
            onClick={() => { setFilter(f); setSelected(new Set()); }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {posts.length === 0 ? (
        <Card className="bg-card border-border shadow-card">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ListTodo size={56} className="text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-1">No posts yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">Upload your first video to get started</p>
            <Button asChild className="gradient-primary text-primary-foreground">
              <Link to="/upload">Upload Video</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {posts.map((post) => (
            <Card key={post.id} className="bg-card border-border shadow-card overflow-hidden">
              <CardContent className="p-0">
                <div className="flex gap-4 p-4">
                  <div className="flex-shrink-0">
                    <Checkbox
                      checked={selected.has(post.id)}
                      onCheckedChange={() => toggleSelect(post.id)}
                      className="mt-2"
                    />
                  </div>
                  <div className="w-24 h-24 rounded-lg bg-secondary flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {videoThumb(post) ? (
                      <img src={videoThumb(post)!} alt="" loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <Video className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-medium text-foreground truncate">{videoTitle(post)}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-youtube">
                            <PlatformIcon platform={post.platform as Platform} size={16} />
                          </span>
                          {post.channelName && (
                            <span className="text-sm text-muted-foreground">{post.channelName}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StatusBadge status={post.status as PostStatus} />
                        {(post as PostWithDetails).contains_altered_content && (
                          <Badge variant="outline" className="bg-amber-500/20 text-amber-600 border-amber-500/40 text-xs">
                            AI Content
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {post.status === "published" && post.published_at
                        ? `Published ${format(new Date(post.published_at), "MMM d, yyyy 'at' h:mm a")}`
                        : post.scheduled_at
                          ? format(new Date(post.scheduled_at), "MMM d, yyyy 'at' h:mm a")
                          : "—"}
                    </p>
                    {post.caption && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                        {post.caption.length > 100 ? `${post.caption.slice(0, 100)}...` : post.caption}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {post.status === "failed" && post.platform === "instagram" && !isVideoExpired(post) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRetry(post.id)}
                        className="text-muted-foreground hover:text-status-published"
                        title="Retry"
                      >
                        <RotateCw size={16} />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(post)}
                      className="text-muted-foreground hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeletePostId(post.id)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit modal */}
      <Dialog open={!!editPost} onOpenChange={(open) => !open && setEditPost(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Post Details</DialogTitle>
            <DialogDescription>
              {editPost?.status === "scheduled" ? "Edit caption, hashtags, and schedule below." : "View-only for published or failed posts."}
            </DialogDescription>
          </DialogHeader>
          {editPost && (
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label className="text-muted-foreground">Video title</Label>
                <p className="text-sm font-medium text-foreground">{videoTitle(editPost)}</p>
              </div>
              {editPost.channelName && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Channel</Label>
                  <p className="text-sm font-medium text-foreground">{editPost.channelName}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label>Caption</Label>
                <Textarea
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  rows={3}
                  disabled={editPost.status !== "scheduled"}
                  className="resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label>Hashtags</Label>
                <Input
                  value={editHashtags}
                  onChange={(e) => setEditHashtags(e.target.value)}
                  placeholder="#viral #shorts"
                  disabled={editPost.status !== "scheduled"}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Contains AI/altered content</Label>
                  <p className="text-xs text-muted-foreground">Required for YouTube disclosure</p>
                </div>
                <Switch
                  checked={editContainsAltered}
                  onCheckedChange={setEditContainsAltered}
                  disabled={editPost.status !== "scheduled"}
                />
              </div>
              {editPost.status === "scheduled" && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label>Reschedule</Label>
                  <p className="text-xs text-muted-foreground">
                    Current: {editPost.scheduled_at ? format(new Date(editPost.scheduled_at), "MMM d, yyyy 'at' h:mm a") : "—"}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("justify-start text-left font-normal", !editScheduleDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {editScheduleDate ? format(editScheduleDate, "PPP") : "Pick date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={editScheduleDate} onSelect={setEditScheduleDate} />
                      </PopoverContent>
                    </Popover>
                    <Input
                      type="time"
                      value={editScheduleTime}
                      onChange={(e) => setEditScheduleTime(e.target.value)}
                      className="w-32"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPost(null)}>
              Cancel
            </Button>
            {editPost?.status === "scheduled" && (
              <Button onClick={saveEdit} disabled={saving} className="gradient-primary text-primary-foreground">
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deletePostId} onOpenChange={(open) => !open && setDeletePostId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete scheduled post?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this scheduled post? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePostId && deleteOne(deletePostId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
