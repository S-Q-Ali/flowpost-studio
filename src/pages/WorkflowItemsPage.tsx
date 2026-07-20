import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ArrowLeft, Loader2, Folder, File as FileIcon, Save, RefreshCw, Trash2, CheckCircle2, Circle, CheckCheck, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { Workflow, WorkflowItem } from "@/lib/types";
import { CaptionPreviewModal } from "@/components/CaptionPreviewModal";
import { generateAICaptions, regenerateCaptions, type StepProgress } from "@/lib/captions";

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

const platformCaptionConfig: Record<string, { field: string; label: string; inputType: "input" | "textarea" }[]> = {
  youtube: [
    { field: "yt_video_title", label: "YT Title", inputType: "input" },
    { field: "yt_video_description", label: "YT Description", inputType: "textarea" },
  ],
  facebook: [{ field: "fb_ig_caption", label: "FB/IG Caption", inputType: "textarea" }],
  instagram: [{ field: "fb_ig_caption", label: "FB/IG Caption", inputType: "textarea" }],
  tiktok: [{ field: "tiktok_caption", label: "TikTok Caption", inputType: "textarea" }],
  linkedin: [{ field: "linkedin_caption", label: "LinkedIn Caption", inputType: "textarea" }],
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
  const [postStatusMap, setPostStatusMap] = useState<Record<string, Record<string, string>>>({});
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const queueRef = useRef<WorkflowItem[]>([]);
  interface CaptionResult {
    captions: Record<string, string>;
    transcript: string;
    visualDescription: string;
    fileName: string;
  }
  const [results, setResults] = useState<Record<string, CaptionResult>>({});
  const [viewingItemId, setViewingItemId] = useState<string | null>(null);
  const [previewCaptions, setPreviewCaptions] = useState<Record<string, string> | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewProgress, setPreviewProgress] = useState<StepProgress | null>(null);
  const previewLoading = previewProgress !== null;

  const visiblePlatforms = (() => {
    const platforms = workflow?.platforms ?? [];
    const result: { platformId: string; label: string; fields: { field: string; label: string; inputType: "input" | "textarea" }[] }[] = [];
    const addedFields = new Set<string>();
    for (const p of platforms) {
      const fields = platformCaptionConfig[p];
      if (!fields) continue;
      const fieldKey = fields[0].field;
      if (fieldKey && addedFields.has(fieldKey)) continue;
      if (fieldKey) addedFields.add(fieldKey);
      const hasBoth = platforms.includes("facebook") && platforms.includes("instagram");
      const label = p === "facebook" ? (hasBoth ? "FB/IG" : "FB") : p === "instagram" ? (hasBoth ? "FB/IG" : "IG") : p.charAt(0).toUpperCase() + p.slice(1);
      result.push({ platformId: p, label, fields });
    }
    return result;
  })();

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

      // Fetch per-platform post statuses
      if (wfItems && wfItems.length > 0) {
        const itemIds = wfItems.map((i) => i.id);
        const { data: postData } = await supabase
          .from("posts")
          .select("workflow_item_id, platform, status")
          .in("workflow_item_id", itemIds);
        if (postData) {
          const map: Record<string, Record<string, string>> = {};
          for (const p of postData) {
            const iid = p.workflow_item_id as string;
            const plat = p.platform as string;
            const st = p.status as string;
            if (!iid || !plat || !st) continue;
            if (!map[iid]) map[iid] = {};
            const current = map[iid][plat];
            // Derive worst status per platform
            const rank: Record<string, number> = { failed: 0, publishing: 1, processing: 2, scheduled: 3, published: 4 };
            if (current === undefined || (rank[st] ?? 99) < (rank[current] ?? 99)) {
              map[iid][plat] = st;
            }
          }
          setPostStatusMap(map);
        }
      }

      setLoading(false);
    })();
  }, [workflowId, userId]);

  // Realtime subscription for post status updates
  useEffect(() => {
    if (!items.length) return;
    const ids = items.map((i) => i.id);
    const channel = supabase
      .channel("workflow-items-post-status")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "posts" },
        (payload) => {
          const row = payload.new as { workflow_item_id?: string; platform?: string; status?: string };
          if (!row.workflow_item_id || !row.platform || !row.status) return;
          if (!ids.includes(row.workflow_item_id)) return;
          setPostStatusMap((prev) => ({
            ...prev,
            [row.workflow_item_id]: {
              ...(prev[row.workflow_item_id] ?? {}),
              [row.platform]: row.status,
            },
          }));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [items]);

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
      const updates = { ...localItems[itemId], status: "ready" };
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
    const pendingEdits = localItems[itemId] ?? {};
    const updates = { ...pendingEdits, status: "ready" };
    const { error } = await supabase
      .from("workflow_items")
      .update(updates)
      .eq("id", itemId);
    if (error) {
      toast.error("Failed to mark as ready");
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...updates, status: "ready" as const } : i)));
    setDirtyIds((prev) => { const n = new Set(prev); n.delete(itemId); return n; });
    setLocalItems((prev) => { const n = { ...prev }; delete n[itemId]; return n; });
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
        }
      }
    }
    setSyncing(false);
  };

  const saveCaptions = async (itemId: string, captions: Record<string, string>) => {
    const CAPTION_KEY_MAP: Record<string, string> = {
      caption: "fb_ig_caption",
      yt_video_title: "yt_video_title",
      yt_video_description: "yt_video_description",
      fb_ig_caption: "fb_ig_caption",
      tiktok_caption: "tiktok_caption",
      linkedin_caption: "linkedin_caption",
    };
    const updates: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(captions)) {
      const dbField = CAPTION_KEY_MAP[key] || key;
      if (value) updates[dbField] = value;
    }

    const { error } = await supabase
      .from("workflow_items")
      .update(updates)
      .eq("id", itemId);

    if (error) {
      toast.error("Failed to save captions: " + error.message);
      return;
    }

    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, ...updates } as WorkflowItem : i)),
    );
  };

  const generateCaptions = async (item: WorkflowItem) => {
    setGeneratingId(item.id);
    setPreviewProgress({ step: "fetching-key", label: "Preparing...", progress: 0 });

    try {
      const result = await generateAICaptions({
        item: { id: item.id, file_name: item.file_name, mime_type: item.mime_type },
        masterPrompt: workflow?.caption_master_prompt ?? undefined,
        platforms: workflow?.platforms ?? [],
        onProgress: (progress) => setPreviewProgress(progress),
      });
      setResults((prev) => ({
        ...prev,
        [item.id]: {
          captions: result.captions,
          transcript: result.transcript,
          visualDescription: result.visualDescription,
          fileName: item.file_name,
        },
      }));
      await saveCaptions(item.id, result.captions);
      toast.success("AI captions applied!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate captions";
      console.error("[WorkflowItemsPage] generateCaptions error", err);
      toast.error(msg);
    } finally {
      setGeneratingId(null);
      setPreviewProgress(null);
      const next = queueRef.current.shift();
      if (next) generateCaptions(next);
    }
  };

  const queueGeneration = (item: WorkflowItem) => {
    if (generatingId) {
      if (queueRef.current.some((q) => q.id === item.id)) return;
      queueRef.current = [...queueRef.current, item];
      toast.info(`Queued "${item.file_name}" — will generate after current item finishes`);
    } else {
      generateCaptions(item);
    }
  };

  const openResults = (item: WorkflowItem) => {
    const r = results[item.id];
    if (!r) return;
    setViewingItemId(item.id);
    setPreviewFileName(r.fileName);
    setPreviewCaptions(r.captions);
    setPreviewOpen(true);
  };

  const handleRegenerate = async (itemId: string) => {
    const r = results[itemId];
    if (!r) return;

    setPreviewOpen(false);

    const captions = await regenerateCaptions(
      r.transcript,
      r.visualDescription,
      r.fileName,
      workflow?.caption_master_prompt ?? undefined,
      workflow?.platforms ?? [],
    );

    setResults((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], captions },
    }));
    await saveCaptions(itemId, captions);
    toast.success("Captions regenerated!");

    const item = items.find((i) => i.id === itemId);
    if (item) openResults(item);
  };

  const applyCaptions = async (captions: Record<string, string>) => {
    if (!viewingItemId) return;
    const CAPTION_KEY_MAP: Record<string, string> = {
      caption: "fb_ig_caption",
      yt_video_title: "yt_video_title",
      yt_video_description: "yt_video_description",
      fb_ig_caption: "fb_ig_caption",
      tiktok_caption: "tiktok_caption",
      linkedin_caption: "linkedin_caption",
    };
    const updates: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(captions)) {
      const dbField = CAPTION_KEY_MAP[key] || key;
      if (value) updates[dbField] = value;
    }

    const { error } = await supabase
      .from("workflow_items")
      .update(updates)
      .eq("id", viewingItemId);

    if (error) {
      toast.error("Failed to save captions: " + error.message);
      return;
    }

    setItems((prev) =>
      prev.map((i) => (i.id === viewingItemId ? { ...i, ...updates } as WorkflowItem : i)),
    );

    toast.success("AI captions applied!");
    setPreviewOpen(false);
    setPreviewCaptions(null);
    setViewingItemId(null);
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
        <div className="space-y-4">
          {items.map((item) => {
            const sb = statusBadge[item.status] ?? statusBadge.pending;
            const isVideo = !item.mime_type || item.mime_type.startsWith("video/");
            const itemPostStatuses = postStatusMap[item.id] ?? {};
            return (
              <Card key={item.id} className="bg-card border-border">
                <CardContent className="p-4 space-y-4">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Checkbox
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={() => toggleSelect(item.id)}
                      />
                      {isVideo ? (
                        <FileIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                      ) : (
                        <FileIcon className="h-5 w-5 shrink-0 text-amber-400" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-foreground truncate max-w-[300px]">{item.file_name}</p>
                        {item.file_size && (
                          <p className="text-xs text-muted-foreground">{formatBytes(item.file_size)}</p>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${sb.className}`}>
                      {sb.label}
                    </Badge>
                  </div>

                  {/* Platform containers */}
                  <div className="grid gap-3">
                    {visiblePlatforms.map(({ platformId: platId, label: platLabel, fields }) => (
                      <div key={platId} className="border border-border rounded-md p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-semibold ${PLATFORM_COLOR[platId]?.split(" ")[1] || "text-foreground"}`}>
                            {platLabel}
                          </span>
                          {itemPostStatuses[platId] === "published" && (
                            <span className="text-xs text-green-600 font-medium">{platLabel} posted</span>
                          )}
                          {itemPostStatuses[platId] === "failed" && (
                            <span className="text-xs text-red-600 font-medium">{platLabel} failed</span>
                          )}
                        </div>
                        {fields.map((f) =>
                          f.inputType === "input" ? (
                            <Input
                              key={f.field}
                              className="h-8 text-xs"
                              value={getField(item, f.field as keyof WorkflowItem) ?? ""}
                              onChange={(e) => updateLocal(item.id, f.field, e.target.value || null)}
                              placeholder={f.label}
                            />
                          ) : (
                            <Textarea
                              key={f.field}
                              className="h-8 text-xs min-h-0 resize-none"
                              rows={1}
                              value={getField(item, f.field as keyof WorkflowItem) ?? ""}
                              onChange={(e) => updateLocal(item.id, f.field, e.target.value || null)}
                              placeholder={f.label}
                            />
                          )
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Footer: Platforms override + Actions */}
                  <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/50">
                    <div className="flex items-center gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                            <span className="text-muted-foreground">Platforms:</span>
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
                          </Button>
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
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1 text-primary hover:text-primary"
                        onClick={() => {
                          const hasResult = results[item.id];
                          if (hasResult) {
                            openResults(item);
                          } else if (generatingId) {
                            queueGeneration(item);
                          } else {
                            generateCaptions(item);
                          }
                        }}
                        disabled={generatingId === item.id && !results[item.id]}
                      >
                        {generatingId === item.id ? (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="relative w-6 h-6 shrink-0">
                              <svg className="w-6 h-6 -rotate-90" viewBox="0 0 36 36">
                                <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                                <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" strokeDasharray={2 * Math.PI * 14} strokeDashoffset={2 * Math.PI * 14 * (1 - (previewProgress?.progress ?? 0) / 100)} className="transition-all duration-500 ease-out" />
                              </svg>
                              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-foreground">{Math.round(previewProgress?.progress ?? 0)}</span>
                            </div>
                            <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">{previewProgress?.label || "Generating..."}</span>
                          </div>
                        ) : results[item.id] ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-green-500" />
                            View Captions
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3.5 w-3.5" />
                            AI Captions
                          </>
                        )}
                      </Button>
                      {(item.status === "pending" || item.status === "failed") && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-emerald-500 hover:text-emerald-400"
                          onClick={() => markReady(item.id)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Ready
                        </Button>
                      )}
                      {item.status === "ready" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                          onClick={() => markPending(item.id)}
                        >
                          <Circle className="h-3.5 w-3.5" />
                          Unmark
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
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {/* AI Caption Preview Modal */}
      <CaptionPreviewModal
        open={previewOpen}
        onOpenChange={(open) => { setPreviewOpen(open); if (!open) { setPreviewCaptions(null); setViewingItemId(null); setPreviewProgress(null); } }}
        captions={previewCaptions}
        loading={previewLoading}
        fileName={previewFileName}
        onSave={applyCaptions}
        onRegenerate={() => viewingItemId && handleRegenerate(viewingItemId)}
        progressStep={previewProgress?.step ?? null}
        progressPercent={previewProgress?.progress ?? 0}
        progressLabel={previewProgress?.label ?? null}
      />
    </div>
  );
}
