import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePageLoading } from "@/hooks/usePageLoading";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, HardDrive, FolderOpen, File, ChevronRight, Upload, Plus, Check, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { transferDriveToMega, type DriveFileInfo } from "@/lib/driveToMegaTransfer";
import type { ConnectedAccount } from "@/lib/types";
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

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
}
interface MegaItem {
  name: string;
  size?: number;
  nodeId?: string;
}

interface ConfirmDelete {
  open: boolean;
  platform: "drive" | "mega";
  nodeId: string;
  name: string;
  isFolder: boolean;
}

const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const CALL_HEADERS = {
  Authorization: `Bearer ${ANON_KEY}`,
  "Content-Type": "application/json",
};

function formatBytes(b: number): string {
  if (!b) return "0 B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}

function QuotaBar({ used, total }: { used: number; total: number | null }) {
  const pct = total && total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const displayTotal = total ? formatBytes(total) : "Unlimited";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatBytes(used)}</span>
        <span>{displayTotal}</span>
      </div>
      {total && total > 0 && (
        <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export default function StoragePage() {
  const { userId } = useAuth();
  const { loading, done } = usePageLoading();

  const [driveAccounts, setDriveAccounts] = useState<ConnectedAccount[]>([]);
  const [selectedDriveId, setSelectedDriveId] = useState<string | null>(null);
  const [driveQuota, setDriveQuota] = useState<{ limit: number | null; usage: number; usageInDrive: number } | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveBreadcrumbs, setDriveBreadcrumbs] = useState<{ id: string; name: string }[]>([]);
  const [drivePageToken, setDrivePageToken] = useState<string | null>(null);
  const [driveLoading, setDriveLoading] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());

  const [megaAccounts, setMegaAccounts] = useState<ConnectedAccount[]>([]);
  const [megaQuota, setMegaQuota] = useState<{ spaceUsed: number; spaceTotal: number } | null>(null);
  const [megaTargetPath, setMegaTargetPath] = useState("");
  const [megaBreadcrumbs, setMegaBreadcrumbs] = useState<string[]>([]);
  const [megaFolders, setMegaFolders] = useState<MegaItem[]>([]);
  const [megaFiles, setMegaFiles] = useState<MegaItem[]>([]);
  const [megaBrowsing, setMegaBrowsing] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [showDriveNewFolder, setShowDriveNewFolder] = useState(false);
  const [driveNewFolderName, setDriveNewFolderName] = useState("");

  const [driveUploading, setDriveUploading] = useState(false);
  const [driveUploadProgress, setDriveUploadProgress] = useState<{ fileName: string; percent: number; current: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadPercent, setUploadPercent] = useState(0);

  const [deletingSelected, setDeletingSelected] = useState(false);
  const [deletingProgress, setDeletingProgress] = useState("");

  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete>({ open: false, platform: "drive", nodeId: "", name: "", isFolder: false });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ data: da }, { data: ma }] = await Promise.all([
          supabase.from("connected_accounts").select("id, user_id, platform, account_name, account_id, display_name, is_connected, connected_at, token_expiry, metadata").eq("user_id", userId).eq("platform", "google_drive").eq("is_connected", true),
          supabase.from("connected_accounts").select("id, user_id, platform, account_name, account_id, display_name, is_connected, connected_at, token_expiry, metadata").eq("user_id", userId).eq("platform", "mega").eq("is_connected", true),
        ]);
        if (cancelled) return;
        const drives = (da ?? []) as ConnectedAccount[];
        const megas = (ma ?? []) as ConnectedAccount[];
        setDriveAccounts(drives);
        setMegaAccounts(megas);
        if (drives.length > 0 && !selectedDriveId) {
          setSelectedDriveId(drives[0].id!);
        }
      } finally {
        if (!cancelled) done();
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!selectedDriveId) return;
    fetchDriveQuota();
    fetchDriveFiles("root");
  }, [selectedDriveId]);

  useEffect(() => {
    if (megaAccounts.length > 0) {
      fetchMegaQuota();
      browseMegaFolder("");
    }
  }, [megaAccounts]);

  async function fetchDriveQuota() {
    if (!selectedDriveId) return;
    const { data, error } = await supabase.functions.invoke("google-drive-auth", {
      method: "POST",
      headers: CALL_HEADERS,
      body: JSON.stringify({ action: "quota", account_id: selectedDriveId }),
    });
    if (!error && data) setDriveQuota(data);
  }

  async function fetchDriveFiles(parentId: string, pageToken?: string) {
    if (!selectedDriveId) return;
    setDriveLoading(true);
    const { data, error } = await supabase.functions.invoke("google-drive-auth", {
      method: "POST",
      headers: CALL_HEADERS,
      body: JSON.stringify({
        action: "list-files",
        account_id: selectedDriveId,
        parent_id: parentId,
        page_token: pageToken,
      }),
    });
    if (!error && data) {
      if (pageToken) {
        setDriveFiles((prev) => [...prev, ...(data.files ?? [])]);
      } else {
        setDriveFiles(data.files ?? []);
      }
      setDrivePageToken(data.nextPageToken ?? null);
    } else if (error) {
      console.error("list-files error:", error);
      toast.error("Failed to list Drive files. Try reconnecting the account.");
    }
    setDriveLoading(false);
  }

  function navigateDriveFolder(folderId: string, folderName: string) {
    setDriveBreadcrumbs((prev) => [...prev, { id: folderId, name: folderName }]);
    setSelectedFileIds(new Set());
    fetchDriveFiles(folderId);
  }

  function navigateDriveUp() {
    if (driveBreadcrumbs.length <= 1) {
      setDriveBreadcrumbs([]);
      fetchDriveFiles("root");
      return;
    }
    const newBreadcrumbs = driveBreadcrumbs.slice(0, -1);
    const parent = newBreadcrumbs[newBreadcrumbs.length - 1];
    setDriveBreadcrumbs(newBreadcrumbs);
    fetchDriveFiles(parent.id);
  }

  function toggleFile(id: string) {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Mega folder picker
  async function fetchMegaQuota() {
    const targetId = megaAccounts[0]?.id;
    if (!targetId) return;
    const { data, error } = await supabase.functions.invoke("mega-auth", {
      method: "POST",
      headers: CALL_HEADERS,
      body: JSON.stringify({ action: "quota", account_id: targetId }),
    });
    if (!error && data) setMegaQuota(data);
  }

  async function browseMegaFolder(path: string) {
    const targetId = megaAccounts[0]?.id;
    if (!targetId) return;
    setMegaBrowsing(true);
    const { data, error } = await supabase.functions.invoke("mega-auth", {
      method: "POST",
      headers: CALL_HEADERS,
      body: JSON.stringify({ action: "list-items", account_id: targetId, path }),
    });
    if (!error && data) {
      setMegaFolders(data.folders ?? []);
      setMegaFiles(data.files ?? []);
    }
    setMegaBrowsing(false);
  }

  function navigateMegaFolder(name: string) {
    const newPath = megaBreadcrumbs.length === 0 ? name : [...megaBreadcrumbs, name].join("/");
    setMegaBreadcrumbs((prev) => [...prev, name]);
    browseMegaFolder(newPath);
  }

  function navigateMegaUp() {
    if (megaBreadcrumbs.length === 0) return;
    const newBreadcrumbs = megaBreadcrumbs.slice(0, -1);
    setMegaBreadcrumbs(newBreadcrumbs);
    browseMegaFolder(newBreadcrumbs.join("/"));
  }

  async function createMegaFolder() {
    if (!newFolderName.trim()) return;
    const targetId = megaAccounts[0]?.id;
    if (!targetId) return;
    const currentPath = megaBreadcrumbs.join("/");
    const { data, error } = await supabase.functions.invoke("mega-auth", {
      method: "POST",
      headers: CALL_HEADERS,
      body: JSON.stringify({ action: "create-folder", account_id: targetId, path: currentPath, folderName: newFolderName.trim() }),
    });
    if (!error && data?.success) {
      toast.success(`Folder "${newFolderName}" created`);
      setNewFolderName("");
      setShowNewFolder(false);
      browseMegaFolder(currentPath);
    } else {
      toast.error(data?.error || "Failed to create folder");
    }
  }

  async function createDriveFolder() {
    if (!driveNewFolderName.trim() || !selectedDriveId) return;
    const pid = driveBreadcrumbs.length > 0 ? driveBreadcrumbs[driveBreadcrumbs.length - 1].id : "root";
    const { data, error } = await supabase.functions.invoke("google-drive-auth", {
      method: "POST",
      headers: CALL_HEADERS,
      body: JSON.stringify({
        action: "create-folder",
        account_id: selectedDriveId,
        name: driveNewFolderName.trim(),
        parent_id: pid,
      }),
    });
    if (!error && data?.id) {
      toast.success(`Folder "${driveNewFolderName}" created`);
      setDriveNewFolderName("");
      setShowDriveNewFolder(false);
      fetchDriveFiles(pid);
    } else {
      toast.error(data?.error || error?.message || "Failed to create folder");
    }
  }

  async function getDriveAccessToken(): Promise<string> {
    if (!selectedDriveId || !userId) throw new Error("No Drive account selected");
    const { data, error } = await supabase.functions.invoke("google-drive-auth", {
      method: "POST",
      headers: CALL_HEADERS,
      body: JSON.stringify({
        action: "get-token",
        account_id: selectedDriveId,
        user_id: userId,
      }),
    });
    if (error || !data?.access_token) throw new Error(error?.message || "Failed to get Drive token");
    return data.access_token;
  }

  async function uploadFileToDrive(
    accessToken: string,
    file: File,
    parentId: string,
    onProgress: (percent: number) => void,
  ): Promise<{ id: string; name: string }> {
    const meta: Record<string, unknown> = { name: file.name };
    if (parentId !== "root") meta.parents = [parentId];

    const sessionRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": file.type || "application/octet-stream",
          "X-Upload-Content-Length": String(file.size),
        },
        body: JSON.stringify(meta),
      },
    );
    if (!sessionRes.ok) {
      const errBody = await sessionRes.json().catch(() => ({}));
      throw new Error((errBody as any)?.error?.message || `Failed to create upload session (${sessionRes.status})`);
    }
    const uploadUrl = sessionRes.headers.get("Location");
    if (!uploadUrl) throw new Error("No upload URL returned from Drive");

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { resolve({ id: "", name: file.name }); }
        } else {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(file);
    });
  }

  async function handleDriveUpload(files: FileList | null) {
    if (!files || files.length === 0 || !selectedDriveId) return;
    const pid = driveBreadcrumbs.length > 0 ? driveBreadcrumbs[driveBreadcrumbs.length - 1].id : "root";
    setDriveUploading(true);
    let token: string;
    try {
      token = await getDriveAccessToken();
    } catch (err: any) {
      toast.error(err.message || "Failed to authenticate");
      setDriveUploading(false);
      return;
    }
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setDriveUploadProgress({ fileName: f.name, percent: 0, current: i + 1, total: files.length });
      try {
        await uploadFileToDrive(token, f, pid, (pct) => {
          setDriveUploadProgress((prev) => prev ? { ...prev, percent: pct } : null);
        });
        toast.success(`${f.name} uploaded`);
      } catch (err: any) {
        toast.error(`${f.name}: ${err.message || "Upload failed"}`);
      }
    }
    setDriveUploadProgress(null);
    setDriveUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    fetchDriveFiles(pid);
    fetchDriveQuota();
  }

  function selectMegaTarget() {
    const path = megaBreadcrumbs.join("/");
    setMegaTargetPath(path);
    toast.success(`Target: ${path || "(root)"}`);
  }

  async function deleteSingleItem(platform: "drive" | "mega", nodeId: string, name: string, isFolder: boolean) {
    if (isFolder) {
      setConfirmDelete({ open: true, platform, nodeId, name, isFolder });
    } else {
      if (platform === "drive") {
        if (!selectedDriveId) return;
        const { error } = await supabase.functions.invoke("google-drive-auth", {
          method: "POST",
          headers: CALL_HEADERS,
          body: JSON.stringify({ action: "delete", account_id: selectedDriveId, file_id: nodeId }),
        });
        if (error) { toast.error(`Failed to delete ${name}`); return; }
      } else {
        const targetId = megaAccounts[0]?.id;
        if (!targetId) return;
        const { error } = await supabase.functions.invoke("mega-auth", {
          method: "POST",
          headers: CALL_HEADERS,
          body: JSON.stringify({ action: "delete", account_id: targetId, nodeId }),
        });
        if (error) { toast.error(`Failed to delete ${name}`); return; }
      }
      toast.success(`${name} deleted`);
      refreshCurrentFolder();
    }
  }

  async function executeDelete() {
    const { platform, nodeId, name } = confirmDelete;
    if (platform === "drive") {
      if (!selectedDriveId) return;
      const { error } = await supabase.functions.invoke("google-drive-auth", {
        method: "POST",
        headers: CALL_HEADERS,
        body: JSON.stringify({ action: "delete", account_id: selectedDriveId, file_id: nodeId }),
      });
      if (error) { toast.error(`Failed to delete ${name}`); setConfirmDelete({ open: false, platform: "drive", nodeId: "", name: "", isFolder: false }); return; }
    } else {
      const targetId = megaAccounts[0]?.id;
      if (!targetId) return;
      const { error } = await supabase.functions.invoke("mega-auth", {
        method: "POST",
        headers: CALL_HEADERS,
        body: JSON.stringify({ action: "delete", account_id: targetId, nodeId }),
      });
      if (error) { toast.error(`Failed to delete ${name}`); setConfirmDelete({ open: false, platform: "drive", nodeId: "", name: "", isFolder: false }); return; }
    }
    toast.success(`${name} deleted`);
    setConfirmDelete({ open: false, platform: "drive", nodeId: "", name: "", isFolder: false });
    refreshCurrentFolder();
  }

  async function deleteSelectedItems() {
    setDeletingSelected(true);
    const targetId = megaAccounts[0]?.id;
    if (!targetId) { setDeletingSelected(false); return; }
    const files = selectedFiles;
    try {
      for (let i = 0; i < files.length; i++) {
        setDeletingProgress(`Deleting (${i + 1}/${files.length}): ${files[i].name}`);
        const { error } = await supabase.functions.invoke("google-drive-auth", {
          method: "POST",
          headers: CALL_HEADERS,
          body: JSON.stringify({ action: "delete", account_id: selectedDriveId, file_id: files[i].id }),
        });
        if (error) { toast.error(`Failed to delete ${files[i].name}`); return; }
      }
      toast.success(`${files.length} file(s) deleted`);
      setSelectedFileIds(new Set());
      refreshCurrentFolder();
    } finally {
      setDeletingSelected(false);
      setDeletingProgress("");
    }
  }

  function refreshCurrentFolder() {
    const pid = driveBreadcrumbs.length > 0 ? driveBreadcrumbs[driveBreadcrumbs.length - 1].id : "root";
    fetchDriveFiles(pid);
    browseMegaFolder(megaBreadcrumbs.join("/"));
  }

  // Client-side upload via browser (avoids server CPU limits)
  async function startUpload() {
    const selectedFiles = driveFiles.filter((f) => selectedFileIds.has(f.id));
    if (selectedFiles.length === 0) return;
    if (!selectedDriveId) return;
    const megaAccountId = megaAccounts[0]?.id;
    if (!megaAccountId) {
      toast.error("No Mega account connected");
      return;
    }
    const sessionToken = localStorage.getItem("flowpost_token");
    if (!sessionToken) {
      toast.error("Not authenticated");
      return;
    }
    setUploading(true);
    setUploadPercent(0);
    for (let i = 0; i < selectedFiles.length; i++) {
      const f = selectedFiles[i];
      const label = `Uploading (${i + 1}/${selectedFiles.length}): ${f.name}`;
      setUploadProgress(label);
      setUploadPercent(0);
      try {
        await transferDriveToMega(
          sessionToken,
          selectedDriveId,
          megaAccountId,
          f as DriveFileInfo,
          megaTargetPath || undefined,
          (event) => {
            if (event.type === "progress") {
              setUploadPercent(event.progress.percent);
            } else if (event.type === "done") {
              toast.success(`${f.name} uploaded to Mega`);
            } else if (event.type === "error") {
              toast.error(`${f.name}: ${event.message}`);
            }
          },
        );
      } catch (err: any) {
        toast.error(`${f.name}: ${err.message || "Network error"}`);
      }
    }
    setUploadPercent(0);
    setUploadProgress("");
    setUploading(false);
    setSelectedFileIds(new Set());
    fetchMegaQuota();
    browseMegaFolder(megaBreadcrumbs.join("/"));
  }

  const parentId = driveBreadcrumbs.length > 0 ? driveBreadcrumbs[driveBreadcrumbs.length - 1].id : "root";
  const selectedFiles = driveFiles.filter((f) => selectedFileIds.has(f.id));

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="flex gap-4 mb-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-5" />
                  <Skeleton className="h-5 w-36" />
                </div>
                <Skeleton className="h-12 w-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Storage</h1>
        {uploading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {uploadProgress}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Google Drive section */}
        <Card className="bg-card border-border shadow-card">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-blue-500" />
                <h2 className="text-lg font-semibold text-foreground">Google Drive</h2>
              </div>
              {driveAccounts.length > 1 && (
                <select
                  className="bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground"
                  value={selectedDriveId ?? ""}
                  onChange={(e) => {
                    setSelectedDriveId(e.target.value || null);
                    setDriveBreadcrumbs([]);
                    setSelectedFileIds(new Set());
                  }}
                >
                  {driveAccounts.map((a) => (
                    <option key={a.id} value={a.id!}>{a.display_name ?? a.account_name}</option>
                  ))}
                </select>
              )}
            </div>
            {driveAccounts.length === 0 && (
              <p className="text-sm text-muted-foreground">No Drive accounts connected. Go to Accounts page to connect.</p>
            )}
            {selectedDriveId && driveQuota && (
              <QuotaBar used={driveQuota.usageInDrive} total={driveQuota.limit} />
            )}
            {selectedDriveId && (
              <>
                {/* Breadcrumbs + action buttons */}
                <div className="flex items-center justify-between gap-1 text-xs text-muted-foreground flex-wrap">
                  <div className="flex items-center gap-1">
                    <button className="hover:text-foreground" onClick={() => { setDriveBreadcrumbs([]); setSelectedFileIds(new Set()); fetchDriveFiles("root"); }}>My Drive</button>
                    {driveBreadcrumbs.map((b) => (
                      <span key={b.id} className="flex items-center gap-1">
                        <ChevronRight className="h-3 w-3" />
                        <span className="text-foreground">{b.name}</span>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => handleDriveUpload(e.target.files)}
                    />
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={driveUploading}>
                      {driveUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                      <span className="ml-1">Upload</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowDriveNewFolder(true)}>
                      <Plus className="h-3 w-3 mr-1" /> Folder
                    </Button>
                  </div>
                </div>
                {/* Inline new folder input */}
                {showDriveNewFolder && (
                  <div className="flex gap-2">
                    <Input className="h-8 text-xs" placeholder="Folder name" value={driveNewFolderName} onChange={(e) => setDriveNewFolderName(e.target.value)} />
                    <Button variant="default" size="sm" onClick={createDriveFolder}><Check className="h-3 w-3" /></Button>
                    <Button variant="outline" size="sm" onClick={() => { setShowDriveNewFolder(false); setDriveNewFolderName(""); }}>X</Button>
                  </div>
                )}
                {/* Upload progress */}
                {driveUploadProgress && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded px-2 py-1.5">
                    <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                    <span className="truncate flex-1">
                      Uploading ({driveUploadProgress.current}/{driveUploadProgress.total}): {driveUploadProgress.fileName}
                    </span>
                    <span className="shrink-0">{driveUploadProgress.percent}%</span>
                    <div className="h-1.5 w-16 rounded-full bg-secondary overflow-hidden shrink-0">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${driveUploadProgress.percent}%` }} />
                    </div>
                  </div>
                )}
                {/* File list */}
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {driveBreadcrumbs.length > 0 && (
                    <button className="flex items-center gap-2 w-full p-2 rounded hover:bg-secondary text-sm text-muted-foreground" onClick={navigateDriveUp}>
                      <ChevronRight className="h-4 w-4 rotate-180" /> Back
                    </button>
                  )}
                  {driveLoading && driveFiles.length === 0 ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : (
                    driveFiles.map((f) => (
                      <div key={f.id} className="flex items-center gap-2 p-2 rounded hover:bg-secondary cursor-pointer group" onClick={() => {
                        if (f.mimeType === "application/vnd.google-apps.folder") {
                          navigateDriveFolder(f.id, f.name);
                        } else {
                          toggleFile(f.id);
                        }
                      }}>
                        {f.mimeType === "application/vnd.google-apps.folder" ? (
                          <FolderOpen className="h-4 w-4 text-yellow-500 shrink-0" />
                        ) : (
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selectedFileIds.has(f.id) ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                            {selectedFileIds.has(f.id) && <Check className="h-3 w-3 text-white" />}
                          </div>
                        )}
                        <span className="text-sm truncate flex-1">{f.name}</span>
                        {f.mimeType !== "application/vnd.google-apps.folder" && <span className="text-xs text-muted-foreground shrink-0">{formatBytes(f.size)}</span>}
                        <button className="opacity-0 group-hover:opacity-100 hover:text-destructive shrink-0 p-0.5" onClick={(e) => { e.stopPropagation(); deleteSingleItem("drive", f.id, f.name, f.mimeType === "application/vnd.google-apps.folder"); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                {drivePageToken && (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => fetchDriveFiles(parentId, drivePageToken)} disabled={driveLoading}>
                    {driveLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Load more"}
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Mega section */}
        <Card className="bg-card border-border shadow-card">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-red-500" />
              <h2 className="text-lg font-semibold text-foreground">Mega</h2>
            </div>
            {megaAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Mega accounts connected. Go to Accounts page to connect.</p>
            ) : (
              <>
                {megaQuota && (
                  <QuotaBar used={megaQuota.spaceUsed} total={megaQuota.spaceTotal} />
                )}
                {/* Folder picker */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Target: {megaTargetPath || "(root)"}
                    </span>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={selectMegaTarget}>
                        <Target className="h-3 w-3 mr-1" /> Select
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setShowNewFolder(true)}>
                        <Plus className="h-3 w-3 mr-1" /> Folder
                      </Button>
                    </div>
                  </div>
                  {showNewFolder && (
                    <div className="flex gap-2 mb-2">
                      <Input className="h-8 text-xs" placeholder="Folder name" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
                      <Button variant="default" size="sm" onClick={createMegaFolder}><Check className="h-3 w-3" /></Button>
                      <Button variant="outline" size="sm" onClick={() => { setShowNewFolder(false); setNewFolderName(""); }}>X</Button>
                    </div>
                  )}
                  {/* Breadcrumbs */}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap mb-2">
                    <button className="hover:text-foreground" onClick={() => { setMegaBreadcrumbs([]); browseMegaFolder(""); }}>Root</button>
                    {megaBreadcrumbs.map((b) => (
                      <span key={b} className="flex items-center gap-1">
                        <ChevronRight className="h-3 w-3" />
                        <span className="text-foreground">{b}</span>
                      </span>
                    ))}
                  </div>
                  {/* Folder list */}
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {megaBreadcrumbs.length > 0 && (
                      <button className="flex items-center gap-2 w-full p-2 rounded hover:bg-secondary text-sm text-muted-foreground" onClick={navigateMegaUp}>
                        <ChevronRight className="h-4 w-4 rotate-180" /> Back
                      </button>
                    )}
                    {megaBrowsing ? (
                      <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                    ) : (
                      <>
                        {megaFolders.map((f) => (
                          <div key={f.name} className="flex items-center gap-2 p-2 rounded hover:bg-secondary cursor-pointer group" onClick={() => navigateMegaFolder(f.name)}>
                            <FolderOpen className="h-4 w-4 text-yellow-500 shrink-0" />
                            <span className="text-sm truncate flex-1">{f.name}</span>
                            <button className="opacity-0 group-hover:opacity-100 hover:text-destructive shrink-0 p-0.5" onClick={(e) => { e.stopPropagation(); deleteSingleItem("mega", f.nodeId!, f.name, true); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        {megaFiles.map((f) => (
                          <div key={f.name} className="flex items-center gap-2 p-2 rounded group">
                            <File className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm truncate flex-1">{f.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{formatBytes(f.size)}</span>
                            <button className="opacity-0 group-hover:opacity-100 hover:text-destructive shrink-0 p-0.5" onClick={() => deleteSingleItem("mega", f.nodeId!, f.name, false)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upload & Delete buttons */}
      {selectedFiles.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col sm:flex-row items-center gap-3 w-[90vw] sm:w-auto">
          {uploading && (
            <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-4 py-2 shadow-lg w-full sm:w-auto">
              <svg width="32" height="32" viewBox="0 0 32 32" className="shrink-0">
                <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted-foreground/30" />
                <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="3"
                  className="text-primary" strokeLinecap="round" transform="rotate(-90 16 16)"
                  strokeDasharray={`${2 * Math.PI * 13}`}
                  strokeDashoffset={`${2 * Math.PI * 13 * (1 - uploadPercent / 100)}`}
                />
              </svg>
              <div className="text-xs leading-tight">
                <div className="text-foreground font-medium">{uploadProgress}</div>
                <div className="text-muted-foreground">{uploadPercent}%</div>
              </div>
            </div>
          )}
          <Button
            className="shadow-lg w-full sm:w-auto"
            size="lg"
            onClick={startUpload}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Upload {selectedFiles.length} selected to Mega
            {megaTargetPath ? ` → ${megaTargetPath}` : " (root)"}
          </Button>
          <Button
            variant="destructive"
            size="lg"
            className="shadow-lg w-full sm:w-auto"
            onClick={deleteSelectedItems}
            disabled={uploading || deletingSelected}
          >
            {deletingSelected ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            {deletingSelected ? deletingProgress : `Delete ${selectedFiles.length} selected from Drive`}
          </Button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={confirmDelete.open} onOpenChange={(o) => setConfirmDelete({ ...confirmDelete, open: o })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete.isFolder ? "folder" : "file"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete.isFolder
                ? `Are you sure you want to delete the folder "${confirmDelete.name}"? All files inside will also be permanently deleted.`
                : `Are you sure you want to delete "${confirmDelete.name}"? This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}