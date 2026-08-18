import { useEffect, useState, useRef, useMemo } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { usePageLoading } from "@/hooks/usePageLoading";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Loader2, Folder, File as FileIcon, FileText, Save, RefreshCw, Trash2, CheckCircle2, Circle, CheckCheck, Sparkles, Check, XCircle, Archive, ListOrdered, Square } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { Workflow, WorkflowItem } from "@/lib/types";
import { CaptionPreviewModal } from "@/components/CaptionPreviewModal";
import { generateAICaptions, regenerateCaptions, type StepProgress } from "@/lib/captions";
import { getItemPublishTime } from "@/lib/scheduling";

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function formatBytes(b: number): string {
  if (!b) return "0 B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}

function filenameToCaption(fileName: string): string | null {
  if (!fileName || !fileName.trim()) return null;
  let name = fileName.trim();
  const lastDot = name.lastIndexOf(".");
  if (lastDot > 0) name = name.slice(0, lastDot);
  // Protect hashtag tokens so separators inside them are never altered
  name = name.replace(/(#[A-Za-z0-9_]+)/g, "\u0001$1\u0002");
  name = name.replace(/[_\-]+/g, " ");
  name = name.replace(/[\u0001\u0002]/g, "");
  name = name.replace(/\s+/g, " ").trim();
  return name || null;
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
  const { loading, done } = usePageLoading();
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [localItems, setLocalItems] = useState<Record<string, Partial<WorkflowItem>>>({});
  const [bulkPlatformsOpen, setBulkPlatformsOpen] = useState(false);
  const [bulkPlatformsValue, setBulkPlatformsValue] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [unmarkAllOpen, setUnmarkAllOpen] = useState(false);
  const [showPosted, setShowPosted] = useLocalStorage("workflow_items_show_posted", false);
  const [markPostedRangeOpen, setMarkPostedRangeOpen] = useState(false);
  const [markPostedRange, setMarkPostedRange] = useState({ start: 1, end: 100 });
  const [postStatusMap, setPostStatusMap] = useState<Record<string, Record<string, string>>>({});
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const queueRef = useRef<WorkflowItem[]>([]);
  const stopRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const batchRef = useRef<BatchState | null>(null);
  interface BatchState {
    total: number;
    done: number;
    failed: number;
    skipped: number;
    aborted: number;
    currentLabel: string | null;
    stopped: boolean;
  }
  const [batchState, setBatchState] = useState<BatchState | null>(null);
  const [skipAudioMap, setSkipAudioMap] = useState<Record<string, boolean>>({});
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
  const [sortBy, setSortBy] = useLocalStorage("workflow_items_sort", "sort_order");
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

  const sortedItems = useMemo(() => {
    const sorted = [...items];
    switch (sortBy) {
      case "file_name_asc": sorted.sort((a, b) => a.file_name.localeCompare(b.file_name, undefined, { numeric: true })); break;
      case "file_name_desc": sorted.sort((a, b) => b.file_name.localeCompare(a.file_name, undefined, { numeric: true })); break;
      case "file_size_asc": sorted.sort((a, b) => (a.file_size ?? 0) - (b.file_size ?? 0)); break;
      case "file_size_desc": sorted.sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0)); break;
      case "status_ready": sorted.sort((a, b) => a.status === "ready" ? -1 : a.status === "posted" ? 1 : 0); break;
      case "status_pending": sorted.sort((a, b) => a.status === "pending" ? -1 : 1); break;
      case "created_asc": sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); break;
      case "created_desc": sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
    }
    return sorted;
  }, [items, sortBy]);

  useEffect(() => {
    if (!workflowId || !userId) return;
    let cancelled = false;

    (async () => {
      try {
        const [wfResult, itemsResult] = await Promise.all([
          supabase.from("workflows").select("id, user_id, name, is_active, platforms, drive_account_id, drive_folder_id, caption_master_prompt, youtube_channel_ids, facebook_page_ids, instagram_account_ids, tiktok_account_ids, linkedin_account_ids, created_at, updated_at, data_source, media_type, post_as_story, youtube_altered_content, total_posted, scheduling_mode, custom_schedule, run_interval_hours, videos_per_run, run_days, last_triggered_at, last_manual_triggered_at, sheet_url, sheet_id").eq("id", workflowId).single(),
          supabase.from("workflow_items").select("id, workflow_id, drive_file_id, file_name, mime_type, file_size, status, yt_video_title, yt_video_description, fb_ig_caption, tiktok_caption, linkedin_caption, platforms_override, sort_order, created_at, posted_at").eq("workflow_id", workflowId).order("sort_order"),
        ]);

        if (cancelled) return;
        if (wfResult.data) setWorkflow(wfResult.data as unknown as Workflow);
        const wfItems = itemsResult.data as WorkflowItem[] | null;
        if (wfItems) setItems(wfItems);

        if (wfItems && wfItems.length > 0) {
          const itemIds = wfItems.map((i) => i.id);
          const BATCH = 50;
          const batches: string[][] = [];
          for (let i = 0; i < itemIds.length; i += BATCH) batches.push(itemIds.slice(i, i + BATCH));

          const postResults = await Promise.all(
            batches.map((batch) =>
              supabase
                .from("posts")
                .select("workflow_item_id, platform, status")
                .in("workflow_item_id", batch)
            )
          );

          if (cancelled) return;
          const map: Record<string, Record<string, string>> = {};
          const rank: Record<string, number> = { failed: 0, publishing: 1, processing: 2, scheduled: 3, published: 4 };
          for (const { data: postData } of postResults) {
            if (!postData) continue;
            for (const p of postData) {
              const iid = p.workflow_item_id as string;
              const plat = p.platform as string;
              const st = p.status as string;
              if (!iid || !plat || !st) continue;
              if (!map[iid]) map[iid] = {};
              const current = map[iid][plat];
              if (current === undefined || (rank[st] ?? 99) < (rank[current] ?? 99)) {
                map[iid][plat] = st;
              }
            }
          }
          setPostStatusMap(map);
        }
      } catch (err) {
        console.error("Failed to load workflow items", err);
      } finally {
        if (!cancelled) done();
      }
    })();

    return () => { cancelled = true; };
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

  const clearFailedPosts = async (itemId: string) => {
    const { data: deleted } = await supabase
      .from("posts")
      .delete()
      .eq("workflow_item_id", itemId)
      .eq("status", "failed")
      .select("platform");
    if (deleted && deleted.length > 0) {
      setPostStatusMap((prev) => {
        const next = { ...prev };
        const copy = { ...next[itemId] };
        for (const p of deleted) {
          delete copy[p.platform as string];
        }
        next[itemId] = copy;
        return next;
      });
    }
  };

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
      } else {
        await clearFailedPosts(itemId);
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
    await clearFailedPosts(itemId);
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

  const markAllPending = async () => {
    const ids = items.map((i) => i.id);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("workflow_items")
      .update({ status: "pending" })
      .in("id", ids);
    if (error) {
      toast.error("Failed to mark all as pending");
      return;
    }
    setItems((prev) => prev.map((i) => ({ ...i, status: "pending" as const })));
    setUnmarkAllOpen(false);
    toast.success(`All ${ids.length} items marked as pending`);
  };

  const markAsPostedRange = async () => {
    const { start, end } = markPostedRange;
    if (start < 1 || end > sortedItems.length || start > end) {
      toast.error("Invalid range");
      return;
    }
    const ids = sortedItems.slice(start - 1, end).map(i => i.id);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("workflow_items")
      .update({ status: "posted" })
      .in("id", ids);
    if (error) {
      toast.error("Failed to mark items as posted");
      return;
    }
    setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, status: "posted" as const } : i)));
    setMarkPostedRangeOpen(false);
    toast.success(`${ids.length} items marked as posted`);
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

  const markCaptionedReady = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const requiredFields = new Set<string>();
    for (const p of workflow?.platforms ?? []) {
      for (const f of platformCaptionConfig[p] ?? []) {
        requiredFields.add(f.field);
      }
    }

    if (requiredFields.size === 0) {
      toast.error("No platforms configured on this workflow");
      return;
    }

    const eligible: string[] = [];
    let skipped = 0;

    for (const id of ids) {
      const item = items.find((i) => i.id === id);
      if (!item) continue;
      if (item.status === "ready" || item.status === "posted") continue;

      const allFilled = Array.from(requiredFields).every((field) => {
        const val = getField(item, field as keyof WorkflowItem);
        return val && val.trim().length > 0;
      });

      if (allFilled) eligible.push(id);
      else skipped++;
    }

    if (eligible.length === 0) {
      toast.error(skipped > 0 ? `${skipped} items skipped — missing captions` : "Nothing to mark");
      return;
    }

    const { error } = await supabase
      .from("workflow_items")
      .update({ status: "ready" })
      .in("id", eligible);

    if (error) {
      toast.error("Failed to mark items as ready");
      return;
    }

    setItems((prev) =>
      prev.map((i) => (eligible.includes(i.id) ? { ...i, status: "ready" as const } : i))
    );

    toast.success(`${eligible.length} items marked as ready${skipped > 0 ? ` (${skipped} skipped — missing captions)` : ""}`);
  };

  const useFileNameAsCaption = (item: WorkflowItem) => {
    const caption = filenameToCaption(item.file_name);
    if (!caption) {
      toast.error("No file name to use as caption");
      return;
    }
    updateLocal(item.id, "fb_ig_caption", caption);
    toast.success("Caption filled from file name");
  };

  const bulkUseFileNameAsCaption = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    let filled = 0;
    let skipped = 0;
    for (const id of ids) {
      const item = items.find((i) => i.id === id);
      if (!item) continue;
      if (item.status === "posted") {
        skipped++;
        continue;
      }
      const caption = filenameToCaption(item.file_name);
      if (!caption) {
        skipped++;
        continue;
      }
      updateLocal(id, "fb_ig_caption", caption);
      filled++;
    }

    if (filled === 0) {
      toast.error(skipped > 0 ? "Nothing to fill — selected items are posted or have no file name" : "Nothing to fill");
      return;
    }
    toast.success(`${filled} caption${filled !== 1 ? "s" : ""} filled from file names${skipped > 0 ? ` (${skipped} skipped)` : ""}`);
  };

  const bulkDeleteItems = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const { error } = await supabase
      .from("workflow_items")
      .delete()
      .in("id", ids);

    if (error) {
      toast.error("Failed to delete items");
      return;
    }

    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
    toast.success(`${ids.length} items deleted`);
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
      newFiles.sort((a: any, b: any) => a.name.localeCompare(b.name));

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

    const controller = new AbortController();
    abortRef.current = controller;

    let outcome: "success" | "failed" | "aborted" = "success";

    try {
      const result = await generateAICaptions({
        item: { id: item.id, file_name: item.file_name, mime_type: item.mime_type },
        masterPrompt: workflow?.caption_master_prompt ?? undefined,
        platforms: workflow?.platforms ?? [],
        onProgress: (progress) => setPreviewProgress(progress),
        skipAudio: skipAudioMap[item.id] ?? false,
        signal: controller.signal,
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
      toast.success(`AI captions applied for "${item.file_name}"`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        outcome = "aborted";
      } else {
        outcome = "failed";
        const msg = err instanceof Error ? err.message : "Failed to generate captions";
        console.error("[WorkflowItemsPage] generateCaptions error", err);
        toast.error(`${item.file_name}: ${msg}`);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setGeneratingId(null);
      setPreviewProgress(null);

      if (batchRef.current) {
        updateBatch({
          done: batchRef.current.done + 1,
          failed: batchRef.current.failed + (outcome === "failed" ? 1 : 0),
          aborted: batchRef.current.aborted + (outcome === "aborted" ? 1 : 0),
        });
      }

      if (stopRef.current) {
        queueRef.current = [];
        finishBatch(true);
        return;
      }

      const next = queueRef.current.shift();
      if (next) {
        if (batchRef.current) updateBatch({ currentLabel: next.file_name });
        generateCaptions(next);
      } else if (batchRef.current) {
        finishBatch(false);
      }
    }
  };

  const updateBatch = (patch: Partial<BatchState>) => {
    if (!batchRef.current) return;
    batchRef.current = { ...batchRef.current, ...patch };
    setBatchState(batchRef.current);
  };

  const finishBatch = (stopped: boolean) => {
    const meta = batchRef.current;
    batchRef.current = null;
    setBatchState(null);
    stopRef.current = false;
    if (meta) {
      const generated = meta.done - meta.failed - meta.aborted;
      toast.success(
        stopped
          ? `Stopped — generated ${generated}, skipped ${meta.skipped}, failed ${meta.failed}, stopped ${meta.aborted}`
          : `Batch complete — generated ${generated}, skipped ${meta.skipped}, failed ${meta.failed}, stopped ${meta.aborted}`,
      );
    }
  };

  const stopBulkGeneration = () => {
    if (!batchRef.current) return;
    stopRef.current = true;
    updateBatch({ stopped: true });
    abortRef.current?.abort();
  };

  const bulkGenerateCaptions = () => {
    if (batchRef.current || generatingId) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const requiredFields = new Set<string>();
    for (const p of workflow?.platforms ?? []) {
      for (const f of platformCaptionConfig[p] ?? []) {
        requiredFields.add(f.field);
      }
    }

    const inFlight = new Set(queueRef.current.map((q) => q.id));
    if (generatingId) inFlight.add(generatingId);

    const toGenerate: WorkflowItem[] = [];
    let skipped = 0;

    for (const id of ids) {
      const item = items.find((i) => i.id === id);
      if (!item) continue;
      if (item.status === "posted") continue;
      if (inFlight.has(id)) continue;

      const allFilled =
        requiredFields.size > 0 &&
        Array.from(requiredFields).every((field) => {
          const val = getField(item, field as keyof WorkflowItem);
          return val && val.trim().length > 0;
        });

      if (allFilled) {
        skipped++;
        continue;
      }
      toGenerate.push(item);
    }

    if (toGenerate.length === 0) {
      toast.error("Nothing to generate — all selected items already have captions.");
      return;
    }

    stopRef.current = false;
    queueRef.current = toGenerate.slice(1);
    const meta: BatchState = {
      total: toGenerate.length,
      done: 0,
      failed: 0,
      skipped,
      aborted: 0,
      currentLabel: toGenerate[0].file_name,
      stopped: false,
    };
    batchRef.current = meta;
    setBatchState(meta);
    generateCaptions(toGenerate[0]);
  };

  const countNeedsCaptions = () => {
    const requiredFields = new Set<string>();
    for (const p of workflow?.platforms ?? []) {
      for (const f of platformCaptionConfig[p] ?? []) {
        requiredFields.add(f.field);
      }
    }

    let count = 0;
    for (const id of Array.from(selectedIds)) {
      const item = items.find((i) => i.id === id);
      if (!item) continue;
      if (item.status === "posted") continue;
      if (generatingId === item.id) continue;
      if (queueRef.current.some((q) => q.id === item.id)) continue;

      const allFilled =
        requiredFields.size > 0 &&
        Array.from(requiredFields).every((field) => {
          const val = getField(item, field as keyof WorkflowItem);
          return val && val.trim().length > 0;
        });
      if (allFilled) continue;
      count++;
    }
    return count;
  };

  const queueGeneration = (item: WorkflowItem) => {
    if (batchRef.current) {
      toast.info("A bulk caption generation is already running. Click Stop Captions to cancel.");
      return;
    }
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-7 w-48" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        <Skeleton className="h-4 w-48" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="border border-border rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-5 w-5" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="ml-auto h-5 w-14 rounded-full" />
            </div>
            <div className="border border-border rounded-md p-3 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-8 w-full" />
            </div>
            <div className="border border-border rounded-md p-3 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
        ))}
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
    <div className="space-y-6 animate-fade-in pb-20">
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
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={selectAll}>
            <CheckCheck className="h-3 w-3" /> Select All
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={deselectAll}>
            <Circle className="h-3 w-3" /> Deselect All
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive" onClick={() => setUnmarkAllOpen(true)}>
            <XCircle className="h-3 w-3" /> Mark All Pending
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setMarkPostedRangeOpen(true)}>
            <Archive className="h-3 w-3" /> Mark as Posted
          </Button>
          <div className="flex items-center gap-3 sm:ml-auto">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={showPosted}
                onCheckedChange={(c) => setShowPosted(c === true)}
              />
              <span>Show posted</span>
            </label>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-7 text-xs w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sort_order" className="text-xs">Default order</SelectItem>
                <SelectItem value="file_name_asc" className="text-xs">File Name A→Z</SelectItem>
                <SelectItem value="file_name_desc" className="text-xs">File Name Z→A</SelectItem>
                <SelectItem value="file_size_asc" className="text-xs">Size (small first)</SelectItem>
                <SelectItem value="file_size_desc" className="text-xs">Size (large first)</SelectItem>
                <SelectItem value="status_ready" className="text-xs">Ready first</SelectItem>
                <SelectItem value="status_pending" className="text-xs">Pending first</SelectItem>
                <SelectItem value="created_asc" className="text-xs">Oldest first</SelectItem>
                <SelectItem value="created_desc" className="text-xs">Newest first</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Items table */}
      {(() => {
        const displayItems = showPosted ? sortedItems : sortedItems.filter(i => i.status !== "posted");
        return displayItems.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center py-12 space-y-3">
              <Folder size={40} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {showPosted ? "No items yet." : "All items have been posted. Toggle \"Show posted\" to view them."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {displayItems.map((item) => {
            const sb = statusBadge[item.status] ?? statusBadge.pending;
            const isVideo = !item.mime_type || item.mime_type.startsWith("video/");
            const itemPostStatuses = postStatusMap[item.id] ?? {};
            const readyItems = sortedItems.filter(i => i.status === "ready");
            const readyIndex = readyItems.indexOf(item);
            const pubTime = item.status === "ready"
              ? getItemPublishTime(workflow, readyIndex)
              : null;
            return (
              <Card
                key={item.id}
                className={`bg-card border-border cursor-pointer select-none transition-shadow ${
                  selectedIds.has(item.id) ? "ring-2 ring-primary/60 shadow-md" : ""
                }`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("input, textarea, button, [role=button], label")) return;
                  toggleSelect(item.id);
                }}
              >
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
                          <span className="flex items-center gap-2">
                            {pubTime && itemPostStatuses[platId] !== "published" && (
                              <span className={`text-[10px] font-medium ${pubTime.isPast ? "text-muted-foreground" : "text-orange-500"}`}>{pubTime.label}</span>
                            )}
                            {itemPostStatuses[platId] === "published" && (
                              <span className="text-xs text-green-600 font-medium">{platLabel} posted</span>
                            )}
                            {itemPostStatuses[platId] === "failed" && (
                              <span className="text-xs text-red-600 font-medium">{platLabel} failed</span>
                            )}
                          </span>
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
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer shrink-0">
                        <Checkbox
                          checked={skipAudioMap[item.id] ?? false}
                          onCheckedChange={() => setSkipAudioMap((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                          className="h-3 w-3"
                        />
                        No audio
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                        onClick={() => useFileNameAsCaption(item)}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Use File Name
                      </Button>
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
      );
      })()}
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
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm shadow-lg p-3">
          {batchState && (
            <div className="max-w-7xl mx-auto mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="font-medium text-foreground">
                Generating captions {Math.min(batchState.done, batchState.total)}/{batchState.total}
              </span>
              {batchState.currentLabel && (
                <span className="truncate max-w-[40%]">— {batchState.currentLabel}</span>
              )}
              {batchState.failed > 0 && (
                <span className="text-destructive">{batchState.failed} failed</span>
              )}
              {batchState.aborted > 0 && <span>{batchState.aborted} stopped</span>}
            </div>
          )}
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground">
              {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={deselectAll}>
                <Circle className="h-3 w-3" /> Deselect All
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={bulkGenerateCaptions}
                disabled={!!generatingId || countNeedsCaptions() === 0}
              >
                <Sparkles className="h-3 w-3" />
                Generate Captions ({countNeedsCaptions()})
              </Button>
              {batchState && !batchState.stopped && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={stopBulkGeneration}
                >
                  <Square className="h-3 w-3" /> Stop Captions
                </Button>
              )}
              {batchState?.stopped && (
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1" disabled>
                  <Loader2 className="h-3 w-3 animate-spin" /> Stopping…
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={markSelectedReady}>
                <CheckCircle2 className="h-3 w-3" />
                Mark Ready
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={markCaptionedReady}>
                <CheckCircle2 className="h-3 w-3" />
                Mark as Ready with Captions
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={bulkUseFileNameAsCaption}>
                <FileText className="h-3 w-3" />
                Use File Name as Caption
              </Button>
              <Popover open={bulkPlatformsOpen} onOpenChange={setBulkPlatformsOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Set Platforms
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
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1 text-destructive hover:text-destructive"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="h-3 w-3" />
                Delete Selected
              </Button>
            </div>
          </div>
        </div>
      )}
      <AlertDialog open={unmarkAllOpen} onOpenChange={setUnmarkAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark all items as pending?</AlertDialogTitle>
            <AlertDialogDescription>
              This will unmark all {items.length} items. None will be posted until you mark them as ready again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={markAllPending}>
              Mark All Pending
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} items?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The items will be permanently removed from this workflow.
              {selectedIds.size > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Deleting: {items.filter((i) => selectedIds.has(i.id)).map((i) => i.file_name).slice(0, 5).join(", ")}{items.filter((i) => selectedIds.has(i.id)).length > 5 ? ` and ${items.filter((i) => selectedIds.has(i.id)).length - 5} more...` : ""}
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={bulkDeleteItems}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete {selectedIds.size} items
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={markPostedRangeOpen} onOpenChange={setMarkPostedRangeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Posted</AlertDialogTitle>
            <AlertDialogDescription>
              Set a range of items to "posted" status. They will be hidden from the list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-3 py-4">
            <div className="flex items-center gap-2 text-sm">
              <span>Range:</span>
              <Input
                type="number"
                min={1}
                max={sortedItems.length}
                className="w-20 h-8 text-xs"
                value={markPostedRange.start}
                onChange={(e) => setMarkPostedRange((r) => ({ ...r, start: Math.max(1, parseInt(e.target.value) || 1) }))}
              />
              <span>to</span>
              <Input
                type="number"
                min={markPostedRange.start}
                max={sortedItems.length}
                className="w-20 h-8 text-xs"
                value={markPostedRange.end}
                onChange={(e) => setMarkPostedRange((r) => ({ ...r, end: Math.min(sortedItems.length, parseInt(e.target.value) || sortedItems.length) }))}
              />
              <span className="text-muted-foreground">of {sortedItems.length} items</span>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={markAsPostedRange}>
              Mark {Math.max(0, markPostedRange.end - markPostedRange.start + 1)} as Posted
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
