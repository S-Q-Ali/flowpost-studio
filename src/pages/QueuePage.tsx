import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlatformIcon } from "@/components/PlatformIcon";
import { StatusBadge } from "@/components/StatusBadge";
import { Trash2, ListTodo } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Post, Platform, PostStatus } from "@/lib/types";

const PERSONAL_USER_ID = "00000000-0000-0000-0000-000000000000";
const filters = ["all", "scheduled", "published", "failed"] as const;

export default function QueuePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchPosts = async () => {
    let q = supabase.from("posts").select("*, videos(*)").eq("user_id", PERSONAL_USER_ID).order("scheduled_at", { ascending: true });
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
    setPosts((data as any) ?? []);
  };

  useEffect(() => { fetchPosts(); }, [filter]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    const { error } = await supabase.from("posts").delete().in("id", Array.from(selected));
    if (error) toast.error(error.message);
    else { toast.success(`${selected.size} posts deleted`); setSelected(new Set()); fetchPosts(); }
  };

  const deleteOne = async (id: string) => {
    await supabase.from("posts").delete().eq("id", id);
    toast.success("Post deleted");
    fetchPosts();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Post Queue</h1>
          <p className="text-sm text-muted-foreground">{posts.length} posts</p>
        </div>
        {selected.size > 0 && (
          <Button variant="destructive" size="sm" onClick={bulkDelete} className="gap-2">
            <Trash2 size={14} /> Delete {selected.size}
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        {filters.map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            className={filter === f ? "gradient-primary text-primary-foreground" : ""}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      <Card className="bg-card border-border shadow-card">
        <CardContent className="p-0">
          {posts.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <ListTodo size={48} className="mb-4" />
              <p>No posts in the queue</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-10" />
                  <TableHead className="text-muted-foreground">Title</TableHead>
                  <TableHead className="text-muted-foreground">Platform</TableHead>
                  <TableHead className="text-muted-foreground">Scheduled</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => (
                  <TableRow key={post.id} className="border-border">
                    <TableCell>
                      <Checkbox checked={selected.has(post.id)} onCheckedChange={() => toggleSelect(post.id)} />
                    </TableCell>
                    <TableCell className="text-foreground font-medium">{(post as any).videos?.title ?? "Untitled"}</TableCell>
                    <TableCell><PlatformIcon platform={post.platform as Platform} /></TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {post.scheduled_at ? format(new Date(post.scheduled_at), "MMM d, h:mm a") : "—"}
                    </TableCell>
                    <TableCell><StatusBadge status={post.status as PostStatus} /></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => deleteOne(post.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
