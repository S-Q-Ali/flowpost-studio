import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePageLoading } from "@/hooks/usePageLoading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Badge } from "@/components/ui/badge";
import { BetaBadge } from "@/components/BetaBadge";
import { CaptionPromptEditor } from "@/components/CaptionPromptEditor";
import { Plus, Workflow, Youtube, Instagram, Facebook, Trash2, Pencil, Link2, Clock3, Play, Loader2, Folder, Copy } from "lucide-react";
import { toast } from "sonner";
import type { Platform, ConnectedAccount, MasterPrompt } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type WorkflowRow = {
  id: string;
  user_id: string;
  name: string;
  is_active: boolean;
  sheet_url: string | null;
  sheet_id: string | null;
  platforms: string[] | null;
  youtube_channel_ids: string[] | null;
  facebook_page_ids: string[] | null;
  instagram_account_ids: string[] | null;
  tiktok_account_ids: string[] | null;
  linkedin_account_ids: string[] | null;
  youtube_altered_content: boolean | null;
  post_as_story: boolean | null;
  max_videos_per_trigger: number | null;
  run_interval_hours: number | null;
  videos_per_run: number | null;
  last_triggered_at: string | null;
  last_manual_triggered_at: string | null;
  run_days: number[] | null;
  total_posted: number | null;
  media_type: "video" | "image";
  scheduling_mode: string | null;
  custom_schedule: Record<string, { start: number; end: number }[]> | null;
  drive_account_id: string | null;
  drive_folder_id: string | null;
  data_source: string;
  created_at: string;
  updated_at: string;
};

type Mode = "create" | "edit";
type Step = 1 | 2 | 3 | 4 | 5;

const hourOptions = Array.from({ length: 24 }, (_, i) => i); // 0-23 UTC

const TikTokWorkflowIcon = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-label="TikTok"
  >
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.65a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.08Z" />
  </svg>
);

const platformOptions: { id: Platform; label: string; icon: React.ComponentType<any>; color: string }[] = [
  { id: "youtube", label: "YouTube Shorts", icon: Youtube, color: "text-red-500" },
  { id: "facebook", label: "Facebook Page", icon: Facebook, color: "text-blue-500" },
  { id: "instagram", label: "Instagram Reels", icon: Instagram, color: "text-pink-500" },
  { id: "tiktok", label: "TikTok", icon: TikTokWorkflowIcon, color: "text-foreground" },
  { id: "linkedin", label: "LinkedIn", icon: TikTokWorkflowIcon, color: "text-linkedin" },
];

export default function WorkflowsPage() {
  const { userId } = useAuth();
  const { loading, done } = usePageLoading();
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [youtubeAccounts, setYoutubeAccounts] = useState<ConnectedAccount[]>([]);
  const [facebookAccounts, setFacebookAccounts] = useState<ConnectedAccount[]>([]);
  const [instagramAccounts, setInstagramAccounts] = useState<ConnectedAccount[]>([]);
  const [tiktokAccounts, setTiktokAccounts] = useState<ConnectedAccount[]>([]);
  const [linkedinAccounts, setLinkedinAccounts] = useState<ConnectedAccount[]>([]);
  const [pageEligibility, setPageEligibility] = useState<Record<string, string>>({});

  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [activeStep, setActiveStep] = useState<Step>(1);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowRow | null>(null);

  // Form state
  const [workflowName, setWorkflowName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [mediaType, setMediaType] = useState<"video" | "image" | "carousel">("video");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [selectedYoutubeIds, setSelectedYoutubeIds] = useState<string[]>([]);
  const [selectedFacebookIds, setSelectedFacebookIds] = useState<string[]>([]);
  const [selectedInstagramIds, setSelectedInstagramIds] = useState<string[]>([]);
  const [selectedTiktokIds, setSelectedTiktokIds] = useState<string[]>([]);
  const [selectedLinkedinIds, setSelectedLinkedinIds] = useState<string[]>([]);
  const [runIntervalHours, setRunIntervalHours] = useState<number>(1);
  const [videosPerRun, setVideosPerRun] = useState<number>(1);
  const [runDays, setRunDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [schedulingMode, setSchedulingMode] = useState<string>("once_daily");
  const [customSchedule, setCustomSchedule] = useState<Record<string, { start: number; end: number }[]>>({});
  const [postAsStory, setPostAsStory] = useState<boolean>(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [youtubeAlteredContent, setYoutubeAlteredContent] = useState<boolean>(true);
  const [selectedDriveId, setSelectedDriveId] = useState<string>("");
  const [driveAccounts, setDriveAccounts] = useState<{ id: string; account_name: string | null; account_id: string | null; metadata: unknown; display_name?: string | null }[]>([]);
  const [dataSource, setDataSource] = useState<"g_sheet" | "flowpost">("g_sheet");
  const [driveParentId, setDriveParentId] = useState<string>("root");
  const [driveBreadcrumbs, setDriveBreadcrumbs] = useState<{ id: string; name: string }[]>([]);
  const [driveFolderFiles, setDriveFolderFiles] = useState<any[]>([]);
  const [driveFolderLoading, setDriveFolderLoading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedFolderName, setSelectedFolderName] = useState<string | null>(null);
  const [captionMasterPrompt, setCaptionMasterPrompt] = useState<MasterPrompt | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<WorkflowRow | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [isAnyWorkflowRunning, setIsAnyWorkflowRunning] = useState(false);

  const loadWorkflows = async () => {
    const { data, error } = await supabase
      .from("workflows")
      .select("id, user_id, name, description, platforms, schedule, status, is_active, created_at, updated_at, drive_account_id, caption_master_prompt, instagram_business_account_id, is_ai_captions_enabled, selected_pages")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    setWorkflows((data as WorkflowRow[]) ?? []);
    const { data: eligData } = await supabase
      .from("page_eligibility")
      .select("page_id, eligibility_bucket")
      .eq("user_id", userId);
    const map: Record<string, string> = {};
    (eligData ?? []).forEach((r) => { if (r.page_id) map[r.page_id] = r.eligibility_bucket ?? "unknown"; });
    setPageEligibility(map);
  };

  const loadAccounts = async () => {
    const [{ data: yt }, { data: fb }, { data: ig }, { data: tt }, { data: li }, { data: gd }] = await Promise.all([
      supabase
        .from("connected_accounts")
        .select("id, user_id, platform, account_name, account_id, display_name, is_connected, connected_at, token_expiry, metadata")
        .eq("user_id", userId)
        .eq("platform", "youtube")
        .eq("is_connected", true),
      supabase
        .from("connected_accounts")
        .select("id, user_id, platform, account_name, account_id, display_name, is_connected, connected_at, token_expiry, metadata")
        .eq("user_id", userId)
        .eq("platform", "facebook")
        .eq("is_connected", true),
      supabase
        .from("connected_accounts")
        .select("id, user_id, platform, account_name, account_id, display_name, is_connected, connected_at, token_expiry, metadata")
        .eq("user_id", userId)
        .eq("platform", "instagram")
        .eq("is_connected", true),
      supabase
        .from("connected_accounts")
        .select("id, user_id, platform, account_name, account_id, display_name, is_connected, connected_at, token_expiry, metadata")
        .eq("user_id", userId)
        .eq("platform", "tiktok")
        .eq("is_connected", true),
      supabase
        .from("connected_accounts")
        .select("id, user_id, platform, account_name, account_id, display_name, is_connected, connected_at, token_expiry, metadata")
        .eq("user_id", userId)
        .eq("platform", "linkedin")
        .eq("is_connected", true),
      supabase
        .from("connected_accounts")
        .select("id, account_name, account_id, metadata, display_name")
        .eq("user_id", userId)
        .eq("platform", "google_drive")
        .eq("is_connected", true),
    ]);

    setYoutubeAccounts((yt as ConnectedAccount[]) ?? []);
    setFacebookAccounts((fb as ConnectedAccount[]) ?? []);
    setInstagramAccounts((ig as ConnectedAccount[]) ?? []);
    setTiktokAccounts((tt as ConnectedAccount[]) ?? []);
    setLinkedinAccounts((li as ConnectedAccount[]) ?? []);
    setDriveAccounts((gd ?? []) as any[]);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.all([loadWorkflows(), loadAccounts()]);
      if (!cancelled) done();
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (dataSource === "flowpost" && selectedDriveId) {
      setDriveParentId("root");
      setDriveBreadcrumbs([]);
      fetchDriveFolder("root");
    }
  }, [dataSource, selectedDriveId]);

  const resetForm = () => {
    setWorkflowName("");
    setIsActive(true);
    setMediaType("video");
    setSelectedPlatforms([]);
    setSelectedYoutubeIds([]);
    setSelectedFacebookIds([]);
    setSelectedInstagramIds([]);
    setSelectedTiktokIds([]);
    setRunIntervalHours(1);
    setVideosPerRun(1);
    setPostAsStory(false);
    setYoutubeAlteredContent(true);
    setSheetUrl("");
    setSelectedDriveId("");
    setDataSource("g_sheet");
    setSelectedFolderId(null);
    setSelectedFolderName(null);
    setDriveParentId("root");
    setDriveBreadcrumbs([]);
    setDriveFolderFiles([]);
    setSelectedWorkflow(null);
    setActiveStep(1);
    setSchedulingMode("once_daily");
    setCustomSchedule({});
    setCaptionMasterPrompt(null);
  };

  const fetchDriveAccounts = async () => {
    const { data } = await supabase
      .from("connected_accounts")
      .select("id, account_name, account_id, metadata, display_name")
      .eq("user_id", userId)
      .eq("platform", "google_drive")
      .eq("is_connected", true);
    setDriveAccounts((data ?? []) as any[]);
  };

  const openCreate = () => {
    setMode("create");
    resetForm();
    fetchDriveAccounts();
    setSheetOpen(true);
  };

  const openEdit = (wf: WorkflowRow) => {
    setMode("edit");
    setSelectedWorkflow(wf);
    setWorkflowName(wf.name);
    setIsActive(wf.is_active);
    setMediaType(wf.media_type ?? "video");
    const wfPlatforms = (wf.platforms ?? []) as Platform[];
    setSelectedPlatforms(wfPlatforms);
    setSelectedYoutubeIds(wf.youtube_channel_ids ?? []);
    setSelectedFacebookIds(wf.facebook_page_ids ?? []);
    setSelectedInstagramIds(wf.instagram_account_ids ?? []);
    setSelectedTiktokIds(wf.tiktok_account_ids ?? []);
    setSelectedLinkedinIds(wf.linkedin_account_ids ?? []);
    setRunIntervalHours(wf.run_interval_hours ?? 1);
    setVideosPerRun(wf.videos_per_run ?? 1);
    setRunDays(wf.run_days ?? [0, 1, 2, 3, 4, 5, 6]);
    setPostAsStory(wf.post_as_story ?? false);
    setYoutubeAlteredContent(wf.youtube_altered_content ?? true);
    setSheetUrl(wf.sheet_url ?? "");
    setDataSource((wf as any).data_source === "flowpost" ? "flowpost" : "g_sheet");
    setSelectedFolderId((wf as any).drive_folder_id ?? null);
    setSelectedFolderName(null);
    setSchedulingMode(wf.scheduling_mode ?? "once_daily");
    setCustomSchedule((wf.custom_schedule as Record<string, { start: number; end: number }[]>) ?? {});
    setSelectedDriveId(wf.drive_account_id ?? "");
    setCaptionMasterPrompt((wf as any).caption_master_prompt ?? null);
    fetchDriveAccounts();
    setActiveStep(1);
    setSheetOpen(true);
  };

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  };

  const toggleAccount = (
    existing: string[],
    setter: (ids: string[]) => void,
    id: string,
  ) => {
    setter(existing.includes(id) ? existing.filter((x) => x !== id) : [...existing, id]);
  };

  const extractSheetId = (url: string): string | null => {
    const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  };

  const handleTestSheet = () => {
    if (!sheetUrl.trim()) {
      toast.error("Enter a Google Sheet URL first");
      return;
    }
    if (!extractSheetId(sheetUrl.trim())) {
      toast.error("Invalid Google Sheet URL format");
      return;
    }
    toast.success("Sheet URL looks valid!");
  };

  const formatBytes = (b: number): string => {
    if (!b) return "0 B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
  };

  const fetchDriveFolder = async (parentId: string) => {
    if (!selectedDriveId) return;
    setDriveFolderLoading(true);
    let allFiles: any[] = [];
    let pageToken: string | null = null;
    let hasError = false;

    do {
      const { data, error } = await supabase.functions.invoke("google-drive-auth", {
        method: "POST",
        headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "list-files",
          account_id: selectedDriveId,
          parent_id: parentId,
          page_token: pageToken,
        }),
      });
      if (error || !data) {
        console.error("list-files error:", error);
        toast.error("Failed to list Drive folder. Try reconnecting the account.");
        hasError = true;
        break;
      }
      if (data.files) allFiles = allFiles.concat(data.files);
      pageToken = data.nextPageToken ?? null;
    } while (pageToken);

    if (!hasError) setDriveFolderFiles(allFiles);
    setDriveFolderLoading(false);
  };

  const navigateDriveFolder = (folderId: string, folderName: string) => {
    setDriveBreadcrumbs((prev) => [...prev, { id: driveParentId, name: folderName }]);
    setDriveParentId(folderId);
    fetchDriveFolder(folderId);
  };

  const selectFolder = (folderId: string, folderName: string) => {
    setSelectedFolderId(folderId);
    setSelectedFolderName(folderName);
  };

  const handleSave = async () => {
    if (!workflowName.trim()) {
      toast.error("Workflow name is required");
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast.error("Select at least one platform");
      return;
    }
    if (dataSource === "g_sheet") {
      if (!sheetUrl.trim()) {
        toast.error("Google Sheet URL is required");
        return;
      }
      const id = extractSheetId(sheetUrl.trim());
      if (!id) {
        toast.error("Invalid Google Sheet URL format");
        return;
      }
    } else {
      if (!selectedFolderId) {
        toast.error("Select a Drive folder for your videos");
        return;
      }
    }
    if (!selectedDriveId) {
      toast.error("Select a Google Drive account");
      return;
    }

    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        user_id: userId,
        name: workflowName.trim(),
        is_active: isActive,
        media_type: mediaType,
        platforms: selectedPlatforms,
        youtube_channel_ids: selectedYoutubeIds,
        facebook_page_ids: selectedFacebookIds,
        instagram_account_ids: selectedInstagramIds,
        tiktok_account_ids: selectedTiktokIds,
        linkedin_account_ids: selectedLinkedinIds,
        youtube_altered_content: youtubeAlteredContent,
        post_as_story: postAsStory,
        run_interval_hours: runIntervalHours,
        videos_per_run: videosPerRun,
        run_days: runDays,
        scheduling_mode: schedulingMode,
        custom_schedule: Object.keys(customSchedule).length > 0 ? customSchedule : null,
        drive_account_id: selectedDriveId,
        data_source: dataSource,
        caption_master_prompt: captionMasterPrompt,
      };

      if (dataSource === "g_sheet") {
        const id = extractSheetId(sheetUrl.trim());
        payload.sheet_url = sheetUrl.trim();
        payload.sheet_id = id;
        payload.drive_folder_id = null;
      } else {
        payload.sheet_url = null;
        payload.sheet_id = null;
        payload.drive_folder_id = selectedFolderId;
      }

      if (mode === "create") {
        const { error } = await supabase.from("workflows").insert(payload);
        if (error) throw error;
        toast.success("Workflow created!");
      } else if (selectedWorkflow) {
        const { error } = await supabase
          .from("workflows")
          .update(payload)
          .eq("id", selectedWorkflow.id);
        if (error) throw error;
        toast.success("Workflow updated!");
      }

      setSheetOpen(false);
      resetForm();
      loadWorkflows();
    } catch (err: any) {
      toast.error(err.message || "Failed to save workflow");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (wf: WorkflowRow) => {
    const { error } = await supabase
      .from("workflows")
      .update({ is_active: !wf.is_active })
      .eq("id", wf.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    loadWorkflows();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from("workflows")
      .delete()
      .eq("id", deleteTarget.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Workflow deleted");
    setDeleteTarget(null);
    loadWorkflows();
  };

  const cloneWorkflow = async (wf: WorkflowRow) => {
    const { id, created_at, updated_at, last_triggered_at,
            last_manual_triggered_at, total_posted, is_active, ...settings } = wf;

    const { data: newWf, error } = await supabase
      .from("workflows")
      .insert({ ...(settings as any), name: `${wf.name} (Copy)`, is_active: false })
      .select()
      .single();

    if (error) { toast.error("Failed to clone workflow"); return; }

    const { data: items } = await supabase
      .from("workflow_items")
      .select("id, workflow_id, drive_file_id, file_name, mime_type, file_size, status, created_at, posted_at, sort_order, post_type, platforms, error_message")
      .eq("workflow_id", id);

    if (items?.length) {
      const clonedItems = items.map(
        ({ id: _i, workflow_id, created_at, posted_at, status, ...rest }) => ({
          ...(rest as any),
          workflow_id: newWf.id,
          status: "pending" as const,
        }),
      );
      const { error: itemsError } = await supabase
        .from("workflow_items")
        .insert(clonedItems);
      if (itemsError) console.error("Failed to clone items", itemsError);
    }

    setWorkflows((prev) => {
      const idx = prev.findIndex((w) => w.id === wf.id);
      const copy = [...prev];
      copy.splice(idx + 1, 0, newWf as WorkflowRow);
      return copy;
    });

    toast.success(`Workflow cloned as "${newWf.name}"`);
  };

  const runWorkflow = async (workflowId: string) => {
    // Check if another workflow is already running
    if (runningId || isAnyWorkflowRunning) {
      toast.error("Another workflow is currently running. Please wait.");
      return;
    }
    
    setRunningId(workflowId);
    setIsAnyWorkflowRunning(true);
    try {
      const token = localStorage.getItem("flowpost_token");
      const { data, error } = await supabase.functions.invoke<{
        processed: number;
        workflows_triggered: number;
        error?: string;
      }>("process-workflow", {
        body: { workflowId },
        headers: { "x-admin-token": token || "" },
      });
      
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      
      const processed = data?.processed ?? 0;
      toast.success(`Workflow triggered! ${processed} videos processed`);
      loadWorkflows();
    } catch (e: any) {
      console.error(e);
      const errorMsg = e?.message || e?.data?.error || "Failed to run workflow";
      if (errorMsg.includes("another workflow is currently running")) {
        toast.error("Another workflow is already running. Please wait for it to complete.");
      } else {
        toast.error(errorMsg);
      }
    } finally {
      setRunningId(null);
      setIsAnyWorkflowRunning(false);
    }
  };

  const renderStepIndicator = () => {
    const steps: { id: Step; label: string }[] = [
      { id: 1, label: "Basic Info" },
      { id: 2, label: "Platforms" },
      { id: 3, label: "Schedule" },
      { id: 4, label: "Source" },
      { id: 5, label: "AI Captions" },
    ];
    return (
      <div className="flex items-center justify-between mb-4">
        {steps.map((step) => {
          const isActiveStep = step.id === activeStep;
          const isCompleted = step.id < activeStep;
          return (
            <div key={step.id} className="flex-1 flex items-center">
              <div
                className={cn(
                  "flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-full border text-xs",
                  isActiveStep
                    ? "border-primary text-primary bg-primary/10"
                    : isCompleted
                    ? "border-primary/60 text-primary/80 bg-primary/5"
                    : "border-border text-muted-foreground",
                )}
              >
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-current text-[10px] shrink-0">
                  {step.id}
                </span>
                <span className="hidden sm:inline">{step.label}</span>
              </div>
                  {step.id !== 5 && (
                <div className="flex-1 h-px mx-1 sm:mx-2 bg-border" />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderStepContent = () => {
    if (activeStep === 1) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Workflow Name</Label>
              <p className="text-xs text-muted-foreground">
                Give this workflow a clear, descriptive name.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {isActive ? "Active" : "Paused"}
              </span>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
          <Input
            placeholder="e.g. Post from Sheet to all channels"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
          />
          <div className="space-y-2">
            <Label>Media Type</Label>
            {mode === "edit" ? (
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border border-border">
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
                  {mediaType === "video" ? "Video" : mediaType === "carousel" ? "Carousel" : "Image"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Media type cannot be changed after creation.
                </span>
              </div>
            ) : (
              <div className="flex gap-4 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mediaType"
                    checked={mediaType === "video"}
                    onChange={() => setMediaType("video")}
                    className="accent-primary"
                  />
                  <span className="text-sm text-foreground">Video</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mediaType"
                    checked={mediaType === "image"}
                    onChange={() => {
                      setMediaType("image");
                      setSelectedPlatforms((prev) => prev.filter((p) => p !== "youtube" && p !== "tiktok"));
                      setSelectedYoutubeIds([]);
                      setSelectedTiktokIds([]);
                    }}
                    className="accent-primary"
                  />
                  <span className="text-sm text-foreground">Image</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mediaType"
                    checked={mediaType === "carousel"}
                    onChange={() => {
                      setMediaType("carousel");
                      setSelectedPlatforms(["instagram"]);
                      setSelectedYoutubeIds([]);
                      setSelectedTiktokIds([]);
                      setSelectedFacebookIds([]);
                      setSelectedLinkedinIds([]);
                    }}
                    className="accent-primary"
                  />
                  <span className="text-sm text-foreground">Carousel (Instagram)</span>
                </label>
              </div>
            )}
            {mediaType === "image" && mode === "create" && (
              <p className="text-xs text-muted-foreground">
                Image workflows support Facebook and Instagram only. YouTube and TikTok do not support image posts.
              </p>
            )}
            {mediaType === "carousel" && mode === "create" && (
              <p className="text-xs text-muted-foreground">
                Carousel workflows support Instagram only. Requires 2-10 images per row using <code className="text-xs bg-muted px-1 rounded">image_url_1</code>, <code className="text-xs bg-muted px-1 rounded">image_url_2</code>, ... columns in your sheet.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Google Drive Account</Label>
            <p className="text-xs text-muted-foreground">
              Select the Drive account to access your sheet and media files.
            </p>
            {driveAccounts.length === 0 ? (
              <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30">
                <p className="text-sm text-destructive">
                  No Google Drive connected.{' '}
                  <a href="/accounts" className="underline hover:text-destructive">
                    Connect one in Accounts
                  </a>.
                </p>
              </div>
            ) : (
              <Select
                value={selectedDriveId}
                onValueChange={setSelectedDriveId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a Drive account" />
                </SelectTrigger>
                <SelectContent>
                  {driveAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.display_name ?? a.account_name ?? (a.metadata as any)?.email ?? a.account_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      );
    }

    if (activeStep === 2) {
      return (
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Platforms & Accounts</Label>
            <p className="text-xs text-muted-foreground">
              Choose where this workflow is allowed to post from the Sheet.
            </p>
          </div>
          <div className="space-y-3">
            {platformOptions
              .filter((p) => mediaType !== "image" || (p.id !== "youtube" && p.id !== "tiktok"))
              .map(({ id, label, icon: Icon, color }) => {
              const selected = selectedPlatforms.includes(id);
              return (
                <div
                  key={id}
                  className={cn(
                    "rounded-lg border p-3 space-y-2",
                    selected ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => togglePlatform(id)}
                    />
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-4 w-4", color)} />
                      <span className="text-sm text-foreground">{label}</span>
                      {id === "tiktok" && <BetaBadge />}
                      {id === "linkedin" && <BetaBadge />}
                    </div>
                  </label>
                  {selected && id === "youtube" && (
                    <div className="pl-6 sm:pl-7 space-y-1">
                      {youtubeAccounts.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No YouTube channels connected. Connect them in Accounts.
                        </p>
                      ) : (
                        youtubeAccounts.map((acc) => (
                          <label
                            key={acc.id}
                            className="flex items-center gap-2 cursor-pointer text-xs"
                          >
                            <Checkbox
                              checked={selectedYoutubeIds.includes(acc.account_id ?? "")}
                              onCheckedChange={() =>
                                toggleAccount(
                                  selectedYoutubeIds,
                                  setSelectedYoutubeIds,
                                  acc.account_id ?? "",
                                )
                              }
                            />
                            <span className="text-foreground">
                              {acc.account_name ?? "YouTube"} ({acc.account_id})
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                  {selected && id === "facebook" && (
                    <div className="pl-6 sm:pl-7 space-y-1">
                      {facebookAccounts.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No Facebook Pages connected. Connect them in Accounts.
                        </p>
                      ) : (
                        facebookAccounts.map((acc) => (
                          <label
                            key={acc.id}
                            className="flex items-center gap-2 cursor-pointer text-xs"
                          >
                            <Checkbox
                              checked={selectedFacebookIds.includes(acc.account_id ?? "")}
                              onCheckedChange={() =>
                                toggleAccount(
                                  selectedFacebookIds,
                                  setSelectedFacebookIds,
                                  acc.account_id ?? "",
                                )
                              }
                            />
                            <span className="text-foreground">
                              {acc.account_name ?? "Facebook Page"} ({acc.account_id})
                            </span>
                            {acc.account_id && pageEligibility[acc.account_id] && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-auto ${
                                pageEligibility[acc.account_id] === "eligible"
                                  ? "bg-status-published/10 text-status-published"
                                  : "bg-destructive/10 text-destructive"
                              }`}>
                                {pageEligibility[acc.account_id] === "eligible" ? "Eligible" : "Ineligible"}
                              </span>
                            )}
                            {acc.account_id && !pageEligibility[acc.account_id] && (
                              <span className="text-[10px] text-muted-foreground ml-auto">Not checked</span>
                            )}
                          </label>
                        ))
                      )}
                    </div>
                  )}
                  {selected && id === "instagram" && (
                    <div className="pl-6 sm:pl-7 space-y-1">
                      {instagramAccounts.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No Instagram Business accounts connected.
                        </p>
                      ) : (
                        instagramAccounts.map((acc) => (
                          <label
                            key={acc.id}
                            className="flex items-center gap-2 cursor-pointer text-xs"
                          >
                            <Checkbox
                              checked={selectedInstagramIds.includes(acc.account_id ?? "")}
                              onCheckedChange={() =>
                                toggleAccount(
                                  selectedInstagramIds,
                                  setSelectedInstagramIds,
                                  acc.account_id ?? "",
                                )
                              }
                            />
                            <span className="text-foreground">
                              {acc.account_name ?? "Instagram"} ({acc.account_id})
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                  {selected && id === "tiktok" && (
                    <div className="pl-6 sm:pl-7 space-y-1">
                      {tiktokAccounts.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No TikTok account connected. Connect one in Accounts.
                        </p>
                      ) : (
                        tiktokAccounts.map((acc) => (
                          <label
                            key={acc.id}
                            className="flex items-center gap-2 cursor-pointer text-xs"
                          >
                            <Checkbox
                              checked={selectedTiktokIds.includes(acc.account_id ?? "")}
                              onCheckedChange={() =>
                                toggleAccount(
                                  selectedTiktokIds,
                                  setSelectedTiktokIds,
                                  acc.account_id ?? "",
                                )
                              }
                            />
                            <span className="text-foreground">
                              {acc.account_name ?? "TikTok"} ({acc.account_id})
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                  {selected && id === "linkedin" && (
                    <div className="pl-6 sm:pl-7 space-y-1">
                      {linkedinAccounts.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No LinkedIn account connected. Connect one in Accounts.
                        </p>
                      ) : (
                        linkedinAccounts.map((acc) => (
                          <label
                            key={acc.id}
                            className="flex items-center gap-2 cursor-pointer text-xs"
                          >
                            <Checkbox
                              checked={selectedLinkedinIds.includes(acc.account_id ?? "")}
                              onCheckedChange={() =>
                                toggleAccount(
                                  selectedLinkedinIds,
                                  setSelectedLinkedinIds,
                                  acc.account_id ?? "",
                                )
                              }
                            />
                            <span className="text-foreground">
                              {acc.account_name ?? "LinkedIn"} ({acc.account_id})
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-lg border border-border/80 bg-muted/5 px-3 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div className="space-y-1">
              <Label>Also Post as Story</Label>
              <p className="text-xs text-muted-foreground">
                Automatically post as Facebook &amp; Instagram Story alongside regular posts when supported.
              </p>
            </div>
            <Switch
              checked={postAsStory}
              onCheckedChange={setPostAsStory}
            />
          </div>
        </div>
      );
    }

    if (activeStep === 3) {
      return (
        <div className="space-y-4">
          {/* Mode Selector */}
          <div className="space-y-2">
            <Label>Scheduling Mode</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "once_daily", label: "Once Daily" },
                { value: "interval", label: "Every X Hours" },
                { value: "custom_ranges", label: "Custom Ranges" },
              ].map((modeOpt) => (
                <button
                  key={modeOpt.value}
                  type="button"
                  onClick={() => setSchedulingMode(modeOpt.value)}
                  className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                    schedulingMode === modeOpt.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {modeOpt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mode 1: Once Daily */}
          {schedulingMode === "once_daily" && (
            <>
              <div className="space-y-2">
                <Label>Run on days</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 0, label: "Sun" },
                    { value: 1, label: "Mon" },
                    { value: 2, label: "Tue" },
                    { value: 3, label: "Wed" },
                    { value: 4, label: "Thu" },
                    { value: 5, label: "Fri" },
                    { value: 6, label: "Sat" },
                  ].map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() =>
                        setRunDays((prev) =>
                          prev.includes(day.value)
                            ? prev.filter((d) => d !== day.value)
                            : [...prev, day.value].sort()
                        )
                      }
                      className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                        runDays.includes(day.value)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Select the days to run the workflow (UTC).
                </p>
              </div>
            </>
          )}

          {/* Mode 2: Every X Hours */}
          {schedulingMode === "interval" && (
            <>
              <div className="space-y-2">
                <Label>Run on days</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 0, label: "Sun" },
                    { value: 1, label: "Mon" },
                    { value: 2, label: "Tue" },
                    { value: 3, label: "Wed" },
                    { value: 4, label: "Thu" },
                    { value: 5, label: "Fri" },
                    { value: 6, label: "Sat" },
                  ].map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() =>
                        setRunDays((prev) =>
                          prev.includes(day.value)
                            ? prev.filter((d) => d !== day.value)
                            : [...prev, day.value].sort()
                        )
                      }
                      className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                        runDays.includes(day.value)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Run every</Label>
                <Select
                  value={runIntervalHours.toString()}
                  onValueChange={(v) => setRunIntervalHours(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 hours</SelectItem>
                    <SelectItem value="3">3 hours</SelectItem>
                    <SelectItem value="4">4 hours</SelectItem>
                    <SelectItem value="6">6 hours</SelectItem>
                    <SelectItem value="8">8 hours</SelectItem>
                    <SelectItem value="12">12 hours</SelectItem>
                    <SelectItem value="24">24 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Mode 3: Custom Ranges */}
          {schedulingMode === "custom_ranges" && (
            <div className="space-y-3">
              <Label>Custom time ranges per day</Label>
              <p className="text-xs text-muted-foreground">
                Define one or more time ranges per day. Each range gets a random posting time.
              </p>
              {[
                { value: 0, label: "Sunday" },
                { value: 1, label: "Monday" },
                { value: 2, label: "Tuesday" },
                { value: 3, label: "Wednesday" },
                { value: 4, label: "Thursday" },
                { value: 5, label: "Friday" },
                { value: 6, label: "Saturday" },
              ].map((day) => {
                const dayKey = day.value.toString();
                const ranges = customSchedule[dayKey] ?? [];
                return (
                  <div key={day.value} className="border border-border rounded-md p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{day.label}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = { ...customSchedule };
                          if (!updated[dayKey]) updated[dayKey] = [];
                          updated[dayKey] = [...updated[dayKey], { start: 0, end: 1 }];
                          setCustomSchedule(updated);
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        + Add range
                      </button>
                    </div>
                    {ranges.length === 0 && (
                      <p className="text-xs text-muted-foreground">No ranges set — day will be skipped</p>
                    )}
                    {ranges.map((range, ri) => (
                      <div key={ri} className="flex items-center gap-2 text-sm flex-wrap">
                        <select
                          className="rounded border border-border bg-background px-1 py-0.5 text-xs"
                          value={range.start}
                          onChange={(e) => {
                            const updated = { ...customSchedule };
                            updated[dayKey] = [...updated[dayKey]];
                            updated[dayKey][ri] = { ...updated[dayKey][ri], start: Number(e.target.value) };
                            setCustomSchedule(updated);
                          }}
                        >
                          {hourOptions.map((h) => (
                            <option key={h} value={h}>
                              {h.toString().padStart(2, "0")}:00
                            </option>
                          ))}
                        </select>
                        <span className="text-muted-foreground">to</span>
                        <select
                          className="rounded border border-border bg-background px-1 py-0.5 text-xs"
                          value={range.end}
                          onChange={(e) => {
                            const updated = { ...customSchedule };
                            updated[dayKey] = [...updated[dayKey]];
                            updated[dayKey][ri] = { ...updated[dayKey][ri], end: Number(e.target.value) };
                            setCustomSchedule(updated);
                          }}
                        >
                          {hourOptions.map((h) => (
                            <option key={h} value={h}>
                              {h.toString().padStart(2, "0")}:00
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = { ...customSchedule };
                            updated[dayKey] = updated[dayKey].filter((_, i) => i !== ri);
                            if (updated[dayKey].length === 0) delete updated[dayKey];
                            setCustomSchedule(updated);
                          }}
                          className="text-destructive hover:underline text-xs"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* Videos per run — shared across all modes */}
          <div className="space-y-1">
            <Label>{mediaType === "image" ? "Images" : "Videos"} per run</Label>
            <Select
              value={videosPerRun.toString()}
              onValueChange={(v) => setVideosPerRun(Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 {mediaType === "image" ? "image" : "video"}</SelectItem>
                <SelectItem value="2">2 {mediaType === "image" ? "images" : "videos"}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mediaType === "video" && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>YouTube Altered Content</Label>
                <p className="text-xs text-muted-foreground">
                  Mark YouTube videos as AI-generated or altered content.
                </p>
              </div>
              <Switch
                checked={youtubeAlteredContent}
                onCheckedChange={setYoutubeAlteredContent}
              />
            </div>
          </div>
          )}
        </div>
      );
    }

    if (activeStep === 5) {
      return (
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>AI Caption Generation</Label>
            <p className="text-xs text-muted-foreground">
              Configure how AI generates captions for your videos. Choose a template preset or write a custom prompt.
            </p>
          </div>
          <CaptionPromptEditor
            value={captionMasterPrompt}
            onChange={setCaptionMasterPrompt}
          />
        </div>
      );
    }

    // Step 4 - Source
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <Label>Video Source</Label>
          <p className="text-xs text-muted-foreground">
            Choose where this workflow reads videos and captions from.
          </p>
        </div>

        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="dataSource"
              checked={dataSource === "g_sheet"}
              onChange={() => setDataSource("g_sheet")}
              className="accent-primary"
            />
            <span className="text-sm text-foreground">Google Sheet</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="dataSource"
              checked={dataSource === "flowpost"}
              onChange={() => setDataSource("flowpost")}
              className="accent-primary"
            />
            <span className="text-sm text-foreground">FlowPost (recommended)</span>
          </label>
        </div>

        {dataSource === "g_sheet" ? (
          <>
            <div className="space-y-1">
              <Label>Google Sheet URL</Label>
              <p className="text-xs text-muted-foreground">
                Sheet must include these required columns:{" "}
                <code className="text-[10px]">{mediaType === "image" ? "image_url" : "video_url"}, title, description, status, {mediaType === "image" ? "image_fb_ig_caption" : "fb_ig_caption"}</code>
              </p>
              <p className="text-xs text-muted-foreground">
                Optional columns:{" "}
                <code className="text-[10px]">platforms, scheduled_time, yt_video_title, yt_video_description, fb_ig_caption, tiktok_caption, youtube_channels, facebook_pages</code>
              </p>
            </div>
            <Input
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleTestSheet}
              >
                <Link2 className="h-3 w-3" />
                Test Connection
              </Button>
            </div>
            <details className="mt-2 text-xs text-muted-foreground space-y-1">
              <summary className="cursor-pointer text-foreground text-sm">
                How to set up your Google Sheet
              </summary>
              <p>
                Each row represents a video to post. Use <code>platforms</code> to optionally override
                the workflow platforms (e.g. <code>youtube,facebook</code>). Use <code>status</code> with
                values like <code>ready to post</code> / <code>posted</code> to control posting.
              </p>
            </details>
          </>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Drive Folder</Label>
              <p className="text-xs text-muted-foreground">
                Select the folder containing your videos. Files can be managed and captioned after workflow creation.
              </p>
            </div>

            {selectedFolderId && selectedFolderName && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-primary/10 border border-primary/30">
                <Folder size={14} className="text-primary shrink-0" />
                <span className="text-xs text-foreground font-medium truncate">{selectedFolderName}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] ml-auto shrink-0"
                  onClick={() => { setSelectedFolderId(null); setSelectedFolderName(null); }}
                >
                  Change
                </Button>
              </div>
            )}

            <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
              <button
                type="button"
                className="hover:text-foreground transition-colors"
                onClick={() => { setDriveParentId("root"); setDriveBreadcrumbs([]); fetchDriveFolder("root"); }}
              >
                Root
              </button>
              {driveBreadcrumbs.map((cr, i) => (
                <span key={cr.id} className="flex items-center gap-1">
                  <span>/</span>
                  <button
                    type="button"
                    className="hover:text-foreground transition-colors"
                    onClick={() => {
                      setDriveParentId(cr.id);
                      setDriveBreadcrumbs((crumbs) => crumbs.slice(0, i));
                      fetchDriveFolder(cr.id);
                    }}
                  >
                    {cr.name}
                  </button>
                </span>
              ))}
            </div>

            {driveFolderLoading ? (
              <div className="flex items-center gap-2 py-4">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Loading files...</span>
              </div>
            ) : driveFolderFiles.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                This folder is empty.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1 border border-border rounded-md p-1">
                {driveFolderFiles.map((f: any) => {
                  const isFolder = f.mimeType === "application/vnd.google-apps.folder";
                  return (
                    <div key={f.id} className="flex items-center gap-2 p-2 rounded-md bg-secondary/40 border border-border/40">
                      <Folder size={14} className="text-blue-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{f.name}</p>
                        {!isFolder && (
                          <p className="text-[10px] text-muted-foreground">{formatBytes(f.size)}</p>
                        )}
                      </div>
                      {isFolder && (
                        <div className="flex gap-1 shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => navigateDriveFolder(f.id, f.name)}
                          >
                            Open
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 text-xs gradient-primary text-primary-foreground"
                            onClick={() => selectFolder(f.id, f.name)}
                          >
                            Select
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderWorkflowCardPlatforms = (wf: WorkflowRow) => {
    const platforms = (wf.platforms ?? []) as Platform[];
    if (!platforms.length) return <p className="text-xs text-muted-foreground">No platforms selected</p>;
    return (
      <div className="flex gap-1 flex-wrap items-center">
        {platforms.map((p) => {
          const meta = platformOptions.find((x) => x.id === p);
          if (!meta) return null;
          const Icon = meta.icon;
          return (
            <Badge
              key={p}
              variant="outline"
              className="flex items-center gap-1 border-border/60 bg-background/40 text-xs"
            >
              <Icon className={cn("h-3 w-3", meta.color)} />
              <span>{meta.label}</span>
            </Badge>
          );
        })}
        {wf.post_as_story && (
          <Badge
            variant="outline"
            className="ml-1 text-[10px] border-emerald-500/40 bg-emerald-500/5 text-emerald-500"
          >
            Stories: On
          </Badge>
        )}
      </div>
    );
  };

  const renderEligibilityBadge = (wf: WorkflowRow) => {
    const fbPageIds = wf.facebook_page_ids ?? [];
    if (!fbPageIds.length) return null;
    let eligible = 0, notEligible = 0, unchecked = 0;
    fbPageIds.forEach((pid) => {
      const bucket = pageEligibility[pid];
      if (!bucket) unchecked++;
      else if (bucket === "eligible") eligible++;
      else notEligible++;
    });
    if (unchecked === fbPageIds.length) return null;
    if (notEligible === 0 && unchecked === 0) {
      return (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-published/10 text-status-published border border-status-published/30">
          {eligible > 1 ? `${eligible} eligible` : "Monetized"}
        </span>
      );
    }
    if (eligible > 0 && notEligible > 0) {
      return (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30">
          {notEligible} ineligible
        </span>
      );
    }
    if (notEligible > 0) {
      return (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30">
          {notEligible > 1 ? `${notEligible} ineligible` : "Not eligible"}
        </span>
      );
    }
    if (unchecked > 0) {
      return (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/30">
          {unchecked} unchecked
        </span>
      );
    }
    return null;
  };

  const renderWorkflowTriggerText = (wf: WorkflowRow) => {
    const mode = wf.scheduling_mode ?? "once_daily";
    
    if (mode === "custom_ranges") {
      const cs = wf.custom_schedule;
      const rangeCount = cs ? Object.values(cs).flat().length : 0;
      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs">Custom Ranges ({rangeCount} total)</span>
        </div>
      );
    }

    const modeLabel = mode === "interval" ? `Every ${wf.run_interval_hours ?? 2}h` : "Once Daily";
    
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-muted-foreground text-xs">{modeLabel}</span>
      </div>
    );
  };

  const renderLastTriggered = (wf: WorkflowRow) => {
    const scheduled = wf.last_triggered_at;
    const manual = wf.last_manual_triggered_at;

    if (!scheduled && !manual) return "Never";

    const scheduledText = scheduled
      ? `Last ran ${formatDistanceToNow(new Date(scheduled), { addSuffix: true })}`
      : "Scheduled: Never";

    const manualText = manual
      ? `Manual run ${formatDistanceToNow(new Date(manual), { addSuffix: true })}`
      : "Manual: Never";

    return `${scheduledText} • ${manualText}`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="bg-card border-border shadow-card">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-32" />
                  <div className="flex gap-1">
                    <Skeleton className="h-5 w-10" />
                    <Skeleton className="h-5 w-10" />
                    <Skeleton className="h-5 w-10" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                  <div className="flex gap-1">
                    <Skeleton className="h-5 w-5" />
                    <Skeleton className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Automate posting from Google Sheets into your connected channels.
          </p>
        </div>
        <Sheet open={sheetOpen} onOpenChange={(open) => { setSheetOpen(open); if (!open) resetForm(); }}>
          <SheetTrigger asChild>
            <Button className="gradient-primary text-primary-foreground gap-2" onClick={openCreate}>
              <Plus size={16} /> Create Workflow
            </Button>
          </SheetTrigger>
          <SheetContent className="bg-card border-border flex flex-col p-0 gap-0 w-full sm:max-w-xl">
            <SheetHeader className="p-4 sm:p-6 pb-0 shrink-0">
              <SheetTitle className="text-foreground">
                {mode === "create" ? "New Workflow" : "Edit Workflow"}
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4 space-y-6">
              {renderStepIndicator()}
              {renderStepContent()}
            </div>
            <div className="sticky bottom-0 bg-card border-t border-border/70 px-4 sm:px-6 py-3 shrink-0">
              <div className="flex justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={activeStep === 1}
                  onClick={() => setActiveStep((prev) => (prev > 1 ? ((prev - 1) as Step) : prev))}
                >
                  Back
                </Button>
                {activeStep < 5 ? (
                  <Button
                    type="button"
                    size="sm"
                    className="gradient-primary text-primary-foreground"
                    onClick={() => setActiveStep((prev) => (prev < 5 ? ((prev + 1) as Step) : prev))}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    className="gradient-primary text-primary-foreground"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : mode === "create" ? "Save Workflow" : "Update Workflow"}
                  </Button>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {workflows.length === 0 ? (
        <Card className="bg-card border-border shadow-card">
          <CardContent className="flex flex-col items-center py-16 space-y-3">
            <Workflow size={48} className="text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No workflows yet. Create your first workflow to automate posting from Google Sheets or Drive folders.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={openCreate}
            >
              <Plus size={14} className="mr-1" /> Create Workflow
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {workflows.map((wf) => (
            <Card
              key={wf.id}
              className="bg-card border-border shadow-card hover:border-primary/40 transition-colors"
            >
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-foreground text-base flex items-center gap-2">
                    {wf.name}
                    {wf.is_active ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                        Active
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/60">
                        Paused
                      </span>
                    )}
                    {renderEligibilityBadge(wf)}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock3 className="h-3 w-3" />
                    {renderWorkflowTriggerText(wf)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={wf.is_active}
                    onCheckedChange={() => toggleActive(wf)}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Platforms</p>
                  {renderWorkflowCardPlatforms(wf)}
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {wf.media_type === "image" ? "Images" : "Videos"}:{" "}
                    <span className="text-foreground">
                      {wf.videos_per_run ?? 1} per run
                    </span>
                  </span>
                  <span>{renderLastTriggered(wf)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    Total posted:{" "}
                    <span className="text-foreground">
                      {wf.total_posted ?? 0} videos
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className={cn(
                        "inline-block w-2 h-2 rounded-full",
                        (wf as any).data_source === "flowpost" ? "bg-blue-400" : wf.sheet_url ? "bg-emerald-400" : "bg-yellow-400",
                      )}
                    />
                    {(wf as any).data_source === "flowpost" ? "FlowPost folder" : wf.sheet_url ? "Sheet connected" : "Sheet not set"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span />
                  <span className="flex items-center gap-1">
                    <span
                      className={cn(
                        "inline-block w-2 h-2 rounded-full",
                        wf.drive_account_id ? "bg-emerald-400" : "bg-red-400",
                      )}
                    />
                    {wf.drive_account_id
                      ? (() => {
                          const da = driveAccounts.find((a: any) => a.id === wf.drive_account_id);
                          return da
                            ? `Drive: ${da.display_name ?? da.account_name ?? (da.metadata as any)?.email ?? da.account_id}`
                            : "Drive connected";
                        })()
                      : "Drive not set"}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/70">
                  {(wf as any).data_source === "flowpost" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-blue-400 hover:text-blue-300"
                      title="Manage Videos"
                      onClick={() => navigate(`/workflows/${wf.id}/items`)}
                    >
                      <Folder className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-primary hover:text-primary-foreground"
                    onClick={() => runWorkflow(wf.id)}
                    disabled={runningId === wf.id || isAnyWorkflowRunning}
                  >
                    {runningId === wf.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => cloneWorkflow(wf)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => openEdit(wf)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive/80 hover:text-destructive"
                    onClick={() => setDeleteTarget(wf)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-semibold text-foreground">
                {deleteTarget?.name}
              </span>{" "}
              and it will no longer trigger posts from your Google Sheet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
