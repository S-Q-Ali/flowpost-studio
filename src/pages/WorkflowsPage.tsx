import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
import { Plus, Workflow, Youtube, Instagram, Facebook, Trash2, Pencil, Link2, Clock3, Play, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Platform, ConnectedAccount } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PERSONAL_USER_ID } from "@/lib/constants";
import { formatDistanceToNow } from "date-fns";

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
  youtube_altered_content: boolean | null;
  post_as_story: boolean | null;
  trigger_hour_start: number;
  trigger_hour_end: number;
  max_videos_per_trigger: number | null;
  last_triggered_at: string | null;
  last_manual_triggered_at: string | null;
  run_days: number[] | null;
  day_time_windows: Record<string, { start: number; end: number }> | null;
  total_posted: number | null;
  created_at: string;
  updated_at: string;
};

type Mode = "create" | "edit";
type Step = 1 | 2 | 3 | 4;

const hourOptions = Array.from({ length: 24 }, (_, i) => i); // 0-23 UTC

const platformOptions: { id: Platform; label: string; icon: React.ComponentType<any>; color: string }[] = [
  { id: "youtube", label: "YouTube Shorts", icon: Youtube, color: "text-red-500" },
  { id: "facebook", label: "Facebook Page", icon: Facebook, color: "text-blue-500" },
  { id: "instagram", label: "Instagram Reels", icon: Instagram, color: "text-pink-500" },
];

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [youtubeAccounts, setYoutubeAccounts] = useState<ConnectedAccount[]>([]);
  const [facebookAccounts, setFacebookAccounts] = useState<ConnectedAccount[]>([]);
  const [instagramAccounts, setInstagramAccounts] = useState<ConnectedAccount[]>([]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [activeStep, setActiveStep] = useState<Step>(1);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowRow | null>(null);

  // Form state
  const [workflowName, setWorkflowName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [selectedYoutubeIds, setSelectedYoutubeIds] = useState<string[]>([]);
  const [selectedFacebookIds, setSelectedFacebookIds] = useState<string[]>([]);
  const [selectedInstagramIds, setSelectedInstagramIds] = useState<string[]>([]);
  const [triggerStartHour, setTriggerStartHour] = useState<number>(0);
  const [triggerEndHour, setTriggerEndHour] = useState<number>(1);
  const [maxVideos, setMaxVideos] = useState<number>(3);
  const [runDays, setRunDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [dayTimeWindows, setDayTimeWindows] = useState<Record<string, { start: number; end: number }>>({});
  const [usePerDayTimes, setUsePerDayTimes] = useState<boolean>(false);
  const [postAsStory, setPostAsStory] = useState<boolean>(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [youtubeAlteredContent, setYoutubeAlteredContent] = useState<boolean>(true);

  const [deleteTarget, setDeleteTarget] = useState<WorkflowRow | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [isAnyWorkflowRunning, setIsAnyWorkflowRunning] = useState(false);

  const loadWorkflows = async () => {
    const { data, error } = await supabase
      .from("workflows")
      .select("*")
      .eq("user_id", PERSONAL_USER_ID)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    setWorkflows((data as WorkflowRow[]) ?? []);
  };

  const loadAccounts = async () => {
    const [{ data: yt }, { data: fb }, { data: ig }] = await Promise.all([
      supabase
        .from("connected_accounts")
        .select("*")
        .eq("user_id", PERSONAL_USER_ID)
        .eq("platform", "youtube")
        .eq("is_connected", true),
      supabase
        .from("connected_accounts")
        .select("*")
        .eq("user_id", PERSONAL_USER_ID)
        .eq("platform", "facebook")
        .eq("is_connected", true),
      supabase
        .from("connected_accounts")
        .select("*")
        .eq("user_id", PERSONAL_USER_ID)
        .eq("platform", "instagram")
        .eq("is_connected", true),
    ]);

    setYoutubeAccounts((yt as ConnectedAccount[]) ?? []);
    setFacebookAccounts((fb as ConnectedAccount[]) ?? []);
    setInstagramAccounts((ig as ConnectedAccount[]) ?? []);
  };

  useEffect(() => {
    loadWorkflows();
    loadAccounts();
  }, []);

  const resetForm = () => {
    setWorkflowName("");
    setIsActive(true);
    setSelectedPlatforms([]);
    setSelectedYoutubeIds([]);
    setSelectedFacebookIds([]);
    setSelectedInstagramIds([]);
    setTriggerStartHour(0);
    setTriggerEndHour(1);
    setMaxVideos(3);
    setPostAsStory(false);
    setYoutubeAlteredContent(true);
    setSheetUrl("");
    setSelectedWorkflow(null);
    setActiveStep(1);
  };

  const openCreate = () => {
    setMode("create");
    resetForm();
    setSheetOpen(true);
  };

  const openEdit = (wf: WorkflowRow) => {
    setMode("edit");
    setSelectedWorkflow(wf);
    setWorkflowName(wf.name);
    setIsActive(wf.is_active);
    const wfPlatforms = (wf.platforms ?? []) as Platform[];
    setSelectedPlatforms(wfPlatforms);
    setSelectedYoutubeIds(wf.youtube_channel_ids ?? []);
    setSelectedFacebookIds(wf.facebook_page_ids ?? []);
    setSelectedInstagramIds(wf.instagram_account_ids ?? []);
    setTriggerStartHour(wf.trigger_hour_start ?? 0);
    setTriggerEndHour(wf.trigger_hour_end ?? 1);
    setMaxVideos(wf.max_videos_per_trigger ?? 3);
    setRunDays(wf.run_days ?? [0, 1, 2, 3, 4, 5, 6]);
    setDayTimeWindows((wf.day_time_windows as Record<string, { start: number; end: number }>) ?? {});
    setUsePerDayTimes(!!wf.day_time_windows && Object.keys(wf.day_time_windows).length > 0);
    setPostAsStory(wf.post_as_story ?? false);
    setYoutubeAlteredContent(wf.youtube_altered_content ?? true);
    setSheetUrl(wf.sheet_url ?? "");
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

  const handleSave = async () => {
    if (!workflowName.trim()) {
      toast.error("Workflow name is required");
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast.error("Select at least one platform");
      return;
    }
    if (!sheetUrl.trim()) {
      toast.error("Google Sheet URL is required");
      return;
    }
    const id = extractSheetId(sheetUrl.trim());
    if (!id) {
      toast.error("Invalid Google Sheet URL format");
      return;
    }
    if (triggerEndHour <= triggerStartHour) {
      toast.error("End hour must be after start hour");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        user_id: PERSONAL_USER_ID,
        name: workflowName.trim(),
        is_active: isActive,
        platforms: selectedPlatforms,
        youtube_channel_ids: selectedYoutubeIds,
        facebook_page_ids: selectedFacebookIds,
        instagram_account_ids: selectedInstagramIds,
        youtube_altered_content: youtubeAlteredContent,
        post_as_story: postAsStory,
        trigger_hour_start: triggerStartHour,
        trigger_hour_end: triggerEndHour,
        max_videos_per_trigger: maxVideos,
        run_days: runDays,
        day_time_windows: Object.keys(dayTimeWindows).length > 0 ? dayTimeWindows : null,
        sheet_url: sheetUrl.trim(),
        sheet_id: id,
      };

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
      { id: 4, label: "Sheet" },
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
                  "flex items-center gap-2 px-3 py-2 rounded-full border text-xs",
                  isActiveStep
                    ? "border-primary text-primary bg-primary/10"
                    : isCompleted
                    ? "border-primary/60 text-primary/80 bg-primary/5"
                    : "border-border text-muted-foreground",
                )}
              >
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-current text-[10px]">
                  {step.id}
                </span>
                <span>{step.label}</span>
              </div>
              {step.id !== 4 && (
                <div className="flex-1 h-px mx-2 bg-border" />
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
            {platformOptions.map(({ id, label, icon: Icon, color }) => {
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
                    </div>
                  </label>
                  {selected && id === "youtube" && (
                    <div className="ml-7 space-y-1">
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
                    <div className="ml-7 space-y-1">
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
                          </label>
                        ))
                      )}
                    </div>
                  )}
                  {selected && id === "instagram" && (
                    <div className="ml-7 space-y-1">
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
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-lg border border-border/80 bg-muted/5 px-3 py-3 flex items-center justify-between gap-4">
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
          <div className="space-y-1">
            <Label>Post between (UTC time)</Label>
            <p className="text-xs text-muted-foreground">
              FlowPost will pick a random time within this window each day.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <Label>Start hour</Label>
              <select
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                value={triggerStartHour}
                onChange={(e) => setTriggerStartHour(Number(e.target.value))}
              >
                {hourOptions.map((h) => (
                  <option key={h} value={h}>
                    {h.toString().padStart(2, "0")}:00 UTC
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 space-y-1">
              <Label>End hour</Label>
              <select
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                value={triggerEndHour}
                onChange={(e) => setTriggerEndHour(Number(e.target.value))}
              >
                {hourOptions.map((h) => (
                  <option key={h} value={h}>
                    {h.toString().padStart(2, "0")}:00 UTC
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
            <p className="text-xs font-medium text-primary">Your local time window:</p>
            <p className="text-sm text-foreground">
              {(() => {
                const now = new Date();
                const startLocal = new Date(now);
                startLocal.setUTCHours(triggerStartHour, 0, 0, 0);
                const endLocal = new Date(now);
                endLocal.setUTCHours(triggerEndHour - 1, 59, 59, 999);
                const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return `${formatTime(startLocal)} - ${formatTime(endLocal)} (your time)`;
              })()}
            </p>
            <p className="text-xs text-muted-foreground">
              Current your time: {new Date().toLocaleTimeString()}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Times are in UTC. Current UTC time: {new Date().toUTCString()}
            </p>
          </div>
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
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
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
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="usePerDayTimes"
                checked={usePerDayTimes}
                onChange={(e) => setUsePerDayTimes(e.target.checked)}
                className="rounded border-border"
              />
              <Label htmlFor="usePerDayTimes" className="font-normal cursor-pointer">
                Set different times for each day
              </Label>
            </div>
            {usePerDayTimes && (
              <div className="space-y-2 pl-2 border-l-2 border-muted">
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
                  const isEnabled = runDays.includes(day.value);
                  const dayStart = dayTimeWindows[dayKey]?.start ?? triggerStartHour;
                  const dayEnd = dayTimeWindows[dayKey]?.end ?? triggerEndHour;
                  if (!isEnabled) return null;
                  return (
                    <div key={day.value} className="flex items-center gap-2 text-sm">
                      <span className="w-20 text-muted-foreground">{day.label}</span>
                      <select
                        className="rounded border border-border bg-background px-1 py-0.5 text-xs"
                        value={dayStart}
                        onChange={(e) =>
                          setDayTimeWindows((prev) => ({
                            ...prev,
                            [dayKey]: { start: Number(e.target.value), end: prev[dayKey]?.end ?? triggerEndHour },
                          }))
                        }
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
                        value={dayEnd}
                        onChange={(e) =>
                          setDayTimeWindows((prev) => ({
                            ...prev,
                            [dayKey]: { start: prev[dayKey]?.start ?? triggerStartHour, end: Number(e.target.value) },
                          }))
                        }
                      >
                        {hourOptions.map((h) => (
                          <option key={h} value={h}>
                            {h.toString().padStart(2, "0")}:00
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground">
                  Only selected days above are editable. Unselected days will be ignored.
                </p>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label>Maximum videos per trigger</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={maxVideos}
              onChange={(e) => setMaxVideos(Number(e.target.value) || 1)}
            />
            <p className="text-xs text-muted-foreground">
              How many videos to post in one trigger.
            </p>
          </div>
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
        </div>
      );
    }

    // Step 4 - Google Sheet
    return (
        <div className="space-y-4">
        <div className="space-y-1">
          <Label>Google Sheet URL</Label>
          <p className="text-xs text-muted-foreground">
            Sheet must include these required columns:{" "}
            <code className="text-[10px]">video_url, title, description, status</code>
          </p>
          <p className="text-xs text-muted-foreground">
            Optional columns:{" "}
            <code className="text-[10px]">platforms, scheduled_time, youtube_channels, facebook_pages</code>
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

  const renderWorkflowTriggerText = (wf: WorkflowRow) => {
    const start = wf.trigger_hour_start ?? 0;
    const end = wf.trigger_hour_end ?? 1;
    const startLabel = `${start.toString().padStart(2, "0")}:00`;
    const endLabel = `${end.toString().padStart(2, "0")}:00`;
    
    // Calculate local time window
    const now = new Date();
    const startLocal = new Date(now);
    startLocal.setUTCHours(start, 0, 0, 0);
    const endLocal = new Date(now);
    endLocal.setUTCHours(end - 1, 59, 59, 999);
    const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const localTimeWindow = `${formatTime(startLocal)} - ${formatTime(endLocal)}`;
    
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-muted-foreground text-xs">Posts between {startLabel} - {endLabel} UTC</span>
        <span className="text-[10px] text-primary/80">{localTimeWindow} your time</span>
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
          <SheetContent className="bg-card border-border overflow-auto">
            <SheetHeader>
              <SheetTitle className="text-foreground">
                {mode === "create" ? "New Workflow" : "Edit Workflow"}
              </SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-6">
              {renderStepIndicator()}
              {renderStepContent()}
              <div className="flex justify-between pt-4 border-t border-border/70">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={activeStep === 1}
                  onClick={() => setActiveStep((prev) => (prev > 1 ? ((prev - 1) as Step) : prev))}
                >
                  Back
                </Button>
                {activeStep < 4 ? (
                  <Button
                    type="button"
                    size="sm"
                    className="gradient-primary text-primary-foreground"
                    onClick={() => setActiveStep((prev) => (prev < 4 ? ((prev + 1) as Step) : prev))}
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
              No workflows yet. Create your first workflow to automate posting from Google Sheets.
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
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        Active
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/60">
                        Paused
                      </span>
                    )}
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
                    Max videos:{" "}
                    <span className="text-foreground">
                      {wf.max_videos_per_trigger ?? 3} per trigger
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
                        wf.sheet_url ? "bg-emerald-400" : "bg-yellow-400",
                      )}
                    />
                    {wf.sheet_url ? "Sheet connected" : "Sheet not set"}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/70">
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
