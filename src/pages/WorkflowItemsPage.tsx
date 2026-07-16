import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ArrowLeft, Loader2, Folder, File as FileIcon, Save, RefreshCw, Trash2, CheckCircle2, Circle, CheckCheck, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { Workflow, WorkflowItem } from "@/lib/types";

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function formatBytes(b: number): string {
  if (!b) return "0 B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}

const PLATFORM_LABEL: Record<string, string> = {
  youtube: "YT",
  facebook: "FB",
  instagram: "IG",
  tiktok: "TT",
  linkedin: "LI",
};
const PLATFORM_COLOR: Record<string, string> = {
  youtube: "bg-red-500/10 text-red-600 border-red-500/30",
  facebook: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  instagram: "bg-pink-500/10 text-pink-600 border-pink-500/30",
  tiktok: "bg-foreground/10 text-foreground border-foreground/30",
  linkedin: "bg-blue-700/10 text-blue-700 border-blue-700/30",
};

const statusBadge: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-gray-500/10 text-gray-500 border-gray-500/30" },
  ready: { label: "Ready", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  posted: { label: "Posted", className: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  failed: { label: "Failed", className: "bg-red-500/10 text-red-600 border-red-500/30" },
};

export default function WorkflowItemsPage() {
  const { id: workflowId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userId } = useAuth();

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [items, setItems] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [localItems, setLocalItems] = useState<Record<string, Partial<WorkflowItem>>>({});
  const [bulkPlatformsOpen, setBulkPlatformsOpen] = useState(false);
  const [bulkPlatformsValue, setBulkPlatformsValue] = useState<string[]>([]);

  useEffect(() => {
    if (!workflowId || !userId) return;
    (async () => {
      setLoading(true);
      const { data: wf } = await supabase
        .from("workflows")
        .select("*")
        .eq("id", workflowId)
        .single();
      if (wf) setWorkflow(wf as unknown as Workflow);

      const { data: wfItems } = await supabase
        .from("workflow_items")
        .select("*")
        .eq("workflow_id", workflowId)
        .order("sort_order");
      if (wfItems) setItems(wfItems as WorkflowItem[]);

      setLoading(false);
    })();
  }, [workflowId, userId]);

  const updateLocal = (itemId: string, field: string, value: string | null) => {
    setLocalItems((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
    setDirtyIds((prev) => {
      const next = new Set(prev);
      next.add(itemId);
      return next;
    });
  };

  const setPlatforms = (itemId: string, platforms: string[] | null) => {
    setLocalItems((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], platforms_override: platforms },
    }));
    setDirtyIds((prev) => {
      const next = new Set(prev);
      next.add(itemId);
      return next;
    });
  };

  const getPlatforms = (item: WorkflowItem): string[] | null => {
    const local = localItems[item.id];
    if (local && "platforms_override" in local) return local.platforms_override ?? null;
    return item.platforms_override;
  };

  const getField = (item: WorkflowItem, field: keyof WorkflowItem): string | null => {
    const local = localItems[item.id];
    if (local && field in local) return (local as any)[field] ?? null;
    return (item as any)[field] ?? null;
  };

  const isDirty = (itemId: string) => dirtyIds.has(itemId);
  const hasChanges = dirtyIds.size > 0;

  const saveAll = async () => {
    if (!hasChanges) return;
    setSaving(true);
    let errorCount = 0;
    for (const itemId of dirtyIds) {
      const updates = localItems[itemId];
      if (!updates) continue;
      const { error } = await supabase
        .from("workflow_items")
        .update(updates)
        .eq("id", itemId);
      if (error) {
        console.error("Failed to save item", itemId, error);
        errorCount++;
      }
    }
    if (errorCount === 0) {
      toast.success("All changes saved");
      setDirtyIds(new Set());
      setLocalItems({});
    } else {
      toast.error(`${errorCount} items failed to save`);
    }
    setSaving(false);
  };

  const markReady = async (itemId: string) => {
    const { error } = await supabase
      .from("workflow_items")
      .update({ status: "ready" })
      .eq("id", itemId);
    if (error) {
      toast.error("Failed to mark as ready");
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, status: "ready" as const } : i)));
    setDirtyIds((prev) => { const n = new Set(prev); n.delete(itemId); return n; });
  };

  const markPending = async (itemId: string) => {
    const { error } = await supabase
      .from("workflow_items")
      .update({ status: "pending" })
      .eq("id", itemId);
    if (error) {
      toast.error("Failed to update status");
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, status: "pending" as const } : i)));
  };

  const removeItem = async (itemId: string) => {
    const { error } = await supabase
      .from("workflow_items")
      .delete()
      .eq("id", itemId);
    if (error) {
      toast.error("Failed to remove item");
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(itemId); return n; });
    toast.success("Item removed");
  };

  const toggleSelect = (itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(items.map((i) => i.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const markSelectedReady = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("workflow_items")
      .update({ status: "ready" })
      .in("id", ids);
    if (error) {
      toast.error("Failed to mark items as ready");
      return;
    }
    setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, status: "ready" as const } : i)));
    toast.success(`${ids.length} items marked as ready`);
  };

  const applyBulkPlatforms = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const platforms = bulkPlatformsValue.length > 0 ? bulkPlatformsValue : null;
    for (const id of ids) {
      setPlatforms(id, platforms);
    }
    setBulkPlatformsOpen(false);
    toast.success(`Platforms set for ${ids.length} items`);
  };

  const syncFromDrive = async () => {
    if (!workflow?.drive_account_id || !workflow?.drive_folder_id || !workflowId) return;
    setSyncing(true);
    let newCount = 0;
    let allFiles: any[] = [];
    let pageToken: string | null = null;
    let hasError = false;

    do {
      const { data, error } = await supabase.functions.invoke("google-drive-auth", {
        method: "POST",
        headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "list-files",
          account_id: workflow.drive_account_id,
          parent_id: workflow.drive_folder_id,
          page_token: pageToken,
        }),
      });
      if (error || !data) {
        console.error("list-files error:", error);
        toast.error("Failed to scan Drive folder");
        hasError = true;
        break;
      }
      if (data.files) allFiles = allFiles.concat(data.files);
      pageToken = data.nextPageToken ?? null;
    } while (pageToken);

    if (!hasError) {
      const mediaMimePrefix = workflow.media_type === "image" ? "image/" : "video/";
      const existingIds = new Set(items.map((i) => i.drive_file_id));
      const newFiles = allFiles.filter(
        (f: any) => f.mimeType?.startsWith(mediaMimePrefix) && !existingIds.has(f.id),
      );

      if (newFiles.length === 0) {
        toast.success("No new files found");
      } else {
        const inserts = newFiles.map((f: any, idx: number) => ({
          workflow_id: workflowId,
          drive_file_id: f.id,
          file_name: f.name,
          file_size: f.size ? Number(f.size) : null,
          mime_type: f.mimeType ?? null,
          status: "pending",
          sort_order: items.length + idx,
        }));
        const { data: inserted, error: insError } = await supabase
          .from("workflow_items")
          .insert(inserts)
          .select();
        if (insError) {
          toast.error("Failed to sync files: " + insError.message);
        } else if (inserted) {
          setItems((prev) => [...prev, ...(inserted as WorkflowItem[])]);
          toast.success(`${inserted.length} new files synced`);
          newCount = inserted.length;
        }
      }
    }
    setSyncing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/workflows")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Workflows
        </Button>
        <p className="text-muted-foreground">Workflow not found.</p>
      </div>
    );
  }

  const totalReady = items.filter((i) => i.status === "ready").length;
  const totalPosted = items.filter((i) => i.status === "posted").length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/workflows")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Workflows
          </Button>
          <h1 className="text-xl font-bold text-foreground">{workflow.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={syncFromDrive}
            disabled={syncing}
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync from Drive"}
          </Button>
          <Button
            type="button"
            size="sm"
            className="gradient-primary text-primary-foreground gap-2"
            onClick={saveAll}
            disabled={!hasChanges || saving}
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save All"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="text-xs text-muted-foreground">
        {items.length} items &middot; {totalReady} ready &middot; {totalPosted} posted
        {workflow.drive_folder_id && (
          <span className="ml-2 inline-flex items-center gap-1">
            &middot; <Folder className="h-3 w-3" /> Folder synced
          </span>
        )}
      </div>

      {/* Bulk bar */}
      {items.length > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={selectAll}>
            <CheckCheck className="h-3 w-3" /> Select All
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={deselectAll}>
            <Circle className="h-3 w-3" /> Deselect All
          </Button>
          {selectedIds.size > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={markSelectedReady}
              >
                <CheckCircle2 className="h-3 w-3" />
                Mark Selected as Ready ({selectedIds.size})
              </Button>
              <Popover open={bulkPlatformsOpen} onOpenChange={setBulkPlatformsOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Set Platforms ({selectedIds.size})
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-3" align="start">
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Set platforms for selected</p>
                    {(workflow.platforms || []).map((p) => (
                      <label key={p} className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox
                          checked={bulkPlatformsValue.includes(p)}
                          onCheckedChange={(checked) => {
                            setBulkPlatformsValue((prev) =>
                              checked ? [...prev, p] : prev.filter((x) => x !== p),
                            );
                          }}
                        />
                        {PLATFORM_LABEL[p] || p}
                      </label>
                    ))}
                    <Button size="sm" className="w-full text-xs h-7" onClick={applyBulkPlatforms}>
                      Apply
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </>
          )}
        </div>
      )}

      {/* Items table */}
      {items.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center py-12 space-y-3">
            <Folder size={40} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No items yet. Click "Sync from Drive" to import files from your folder.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="w-10 p-2 text-left">
                  <Checkbox
                    checked={selectedIds.size === items.length}
                    onCheckedChange={(checked) => checked ? selectAll() : deselectAll()}
                  />
                </th>
                <th className="p-2 text-left text-xs text-muted-foreground font-medium">File</th>
                <th className="p-2 text-left text-xs text-muted-foreground font-medium w-20">Status</th>
                <th className="p-2 text-left text-xs text-muted-foreground font-medium min-w-[140px]">YT Title</th>
                <th className="p-2 text-left text-xs text-muted-foreground font-medium min-w-[180px]">YT Description</th>
                <th className="p-2 text-left text-xs text-muted-foreground font-medium min-w-[180px]">FB/IG Caption</th>
                <th className="p-2 text-left text-xs text-muted-foreground font-medium min-w-[140px]">TikTok Caption</th>
                <th className="p-2 text-left text-xs text-muted-foreground font-medium min-w-[140px]">LinkedIn Caption</th>
                <th className="p-2 text-left text-xs text-muted-foreground font-medium w-24">Platforms</th>
                <th className="w-24 p-2 text-left text-xs text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const sb = statusBadge[item.status] ?? statusBadge.pending;
                const isVideo = !item.mime_type || item.mime_type.startsWith("video/");
                return (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="p-2">
                      <Checkbox
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={() => toggleSelect(item.id)}
                      />
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isVideo ? (
                          <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <FileIcon className="h-4 w-4 shrink-0 text-amber-400" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs text-foreground truncate max-w-[180px]">{item.file_name}</p>
                          {item.file_size && (
                            <p className="text-[10px] text-muted-foreground">{formatBytes(item.file_size)}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-2">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${sb.className}`}>
                        {sb.label}
                      </Badge>
                    </td>
                    <td className="p-2">
                      <Input
                        className="h-8 text-xs"
                        value={getField(item, "yt_video_title") ?? ""}
                        onChange={(e) => updateLocal(item.id, "yt_video_title", e.target.value || null)}
                        placeholder="YouTube title"
                      />
                    </td>
                    <td className="p-2">
                      <Textarea
                        className="h-8 text-xs min-h-0 resize-none"
                        rows={1}
                        value={getField(item, "yt_video_description") ?? ""}
                        onChange={(e) => updateLocal(item.id, "yt_video_description", e.target.value || null)}
                        placeholder="YouTube description"
                      />
                    </td>
                    <td className="p-2">
                      <Textarea
                        className="h-8 text-xs min-h-0 resize-none"
                        rows={1}
                        value={getField(item, "fb_ig_caption") ?? ""}
                        onChange={(e) => updateLocal(item.id, "fb_ig_caption", e.target.value || null)}
                        placeholder="FB/IG caption"
                      />
                    </td>
                    <td className="p-2">
                      <Textarea
                        className="h-8 text-xs min-h-0 resize-none"
                        rows={1}
                        value={getField(item, "tiktok_caption") ?? ""}
                        onChange={(e) => updateLocal(item.id, "tiktok_caption", e.target.value || null)}
                        placeholder="TikTok caption"
                      />
                    </td>
                    <td className="p-2">
                      <Textarea
                        className="h-8 text-xs min-h-0 resize-none"
                        rows={1}
                        value={getField(item, "linkedin_caption") ?? ""}
                        onChange={(e) => updateLocal(item.id, "linkedin_caption", e.target.value || null)}
                        placeholder="LinkedIn caption"
                      />
                    </td>
                    <td className="p-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="flex items-center gap-1 flex-wrap cursor-pointer">
                            {(() => {
                              const override = getPlatforms(item);
                              const platforms = override ?? workflow.platforms ?? [];
                              if (!override) {
                                return <span className="text-[10px] text-muted-foreground">All</span>;
                              }
                              return platforms.map((p) => (
                                <span
                                  key={p}
                                  className={`text-[10px] px-1 py-0 rounded border ${PLATFORM_COLOR[p] || ""}`}
                                >
                                  {PLATFORM_LABEL[p] || p}
                                </span>
                              ));
                            })()}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-44 p-3" align="start">
                          <div className="space-y-2">
                            <p className="text-xs font-medium">Platforms</p>
                            {(workflow.platforms || []).map((p) => {
                              const override = getPlatforms(item);
                              const active = override ?? workflow.platforms ?? [];
                              return (
                                <label key={p} className="flex items-center gap-2 text-xs cursor-pointer">
                                  <Checkbox
                                    checked={active.includes(p)}
                                    onCheckedChange={(checked) => {
                                      const current = override ?? workflow.platforms ?? [];
                                      const updated = checked
                                        ? [...current, p]
                                        : current.filter((x) => x !== p);
                                      const defaults = workflow.platforms ?? [];
                                      const sameAsDefault =
                                        updated.length === defaults.length &&
                                        updated.every((x) => defaults.includes(x));
                                      setPlatforms(item.id, sameAsDefault ? null : updated);
                                    }}
                                  />
                                  {PLATFORM_LABEL[p] || p}
                                </label>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        {(item.status === "pending" || item.status === "failed") && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-emerald-500 hover:text-emerald-400"
                            title="Mark as Ready"
                            onClick={() => markReady(item.id)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {item.status === "ready" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Unmark Ready"
                            onClick={() => markPending(item.id)}
                          >
                            <Circle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive/70 hover:text-destructive"
                          title="Remove"
                          onClick={() => removeItem(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        {isDirty(item.id) && (
                          <span className="text-[10px] text-amber-500 font-medium">*</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
