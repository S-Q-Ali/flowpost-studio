import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePageLoading } from "@/hooks/usePageLoading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, Youtube, Instagram, Facebook, Film, Folder, FileIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { invokeFunction } from "@/lib/invoke";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { Platform } from "@/lib/types";
import type { ConnectedAccount } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/PlatformIcon";
import { BetaBadge } from "@/components/BetaBadge";

const platforms: { id: Platform; label: string }[] = [
  { id: "facebook", label: "Facebook Page" },
  { id: "instagram", label: "Instagram Reels" },
  { id: "youtube", label: "YouTube Shorts" },
  { id: "tiktok", label: "TikTok" },
  { id: "linkedin", label: "LinkedIn" },
];

export default function UploadPage() {
  const { userId } = useAuth();
  const { loading, done } = usePageLoading();
  const navigate = useNavigate();
  const [videos, setVideos] = useState<{ id: string; title: string; file_url: string; uploaded_at: string }[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubeDescription, setYoutubeDescription] = useState("");
  const [instagramCaption, setInstagramCaption] = useState("");
  const [facebookCaption, setFacebookCaption] = useState("");
  const [tiktokCaption, setTiktokCaption] = useState("");
  const [linkedinCaption, setLinkedinCaption] = useState("");
  const [hashtags] = useState("");
  const [captionsEnabled] = useState(true);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [selectedYouTubeAccountIds, setSelectedYouTubeAccountIds] = useState<string[]>([]);
  const [selectedFacebookPageIds, setSelectedFacebookPageIds] = useState<string[]>([]);
  const [selectedInstagramAccountIds, setSelectedInstagramAccountIds] = useState<string[]>([]);
  const [selectedTikTokAccountIds, setSelectedTikTokAccountIds] = useState<string[]>([]);
  const [selectedLinkedInAccountIds, setSelectedLinkedInAccountIds] = useState<string[]>([]);
  const [youtubeAccounts, setYoutubeAccounts] = useState<ConnectedAccount[]>([]);
  const [youtubeQuota, setYoutubeQuota] = useState<{ used: number; percentage: number; uploadCount: number; estimatedUploadsRemaining: number } | null>(null);
  const [facebookAccounts, setFacebookAccounts] = useState<ConnectedAccount[]>([]);
  const [instagramAccounts, setInstagramAccounts] = useState<ConnectedAccount[]>([]);
  const [tiktokAccounts, setTiktokAccounts] = useState<ConnectedAccount[]>([]);
  const [linkedinAccounts, setLinkedinAccounts] = useState<ConnectedAccount[]>([]);
  const [publishMode, setPublishMode] = useState<"now" | "schedule">("now");
  const getDefaultScheduleDate = () => {
    const date = new Date();
    date.setHours(17, 0, 0, 0);
    return date;
  };
  const [scheduleDate, setScheduleDate] = useState<Date>(getDefaultScheduleDate());
  const [scheduleTime, setScheduleTime] = useState("17:00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [containsAlteredContent] = useState(true);
  const [driveTab, setDriveTab] = useState<"videos" | "drive" | "local">("videos");
  const [driveAccounts, setDriveAccounts] = useState<ConnectedAccount[]>([]);
  const [selectedDriveId, setSelectedDriveId] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [importingFile, setImportingFile] = useState<string | null>(null);
  const [driveParentId, setDriveParentId] = useState<string>("root");
  const [driveBreadcrumbs, setDriveBreadcrumbs] = useState<{ id: string; name: string }[]>([]);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localUploading, setLocalUploading] = useState(false);
  const [localUploadProgress, setLocalUploadProgress] = useState(0);
  const [storyPlatforms, setStoryPlatforms] = useState<Set<"facebook" | "instagram">>(new Set());
  const localFileInputRef = useRef<HTMLInputElement>(null);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: yt } = await supabase
      .from("connected_accounts")
      .select("id, user_id, platform, account_name, account_id, display_name, is_connected, connected_at, token_expiry, metadata")
      .eq("user_id", userId)
      .eq("platform", "youtube")
      .eq("is_connected", true);

        const { data: fb } = await supabase
          .from("connected_accounts")
          .select("id, user_id, platform, account_name, account_id, display_name, is_connected, connected_at, token_expiry, metadata")
          .eq("user_id", userId)
          .eq("platform", "facebook")
          .eq("is_connected", true);

        const { data: ig } = await supabase
          .from("connected_accounts")
          .select("id, user_id, platform, account_name, account_id, display_name, is_connected, connected_at, token_expiry, metadata")
          .eq("user_id", userId)
          .eq("platform", "instagram")
          .eq("is_connected", true);

        const { data: tt } = await supabase
          .from("connected_accounts")
          .select("id, user_id, platform, account_name, account_id, display_name, is_connected, connected_at, token_expiry, metadata")
          .eq("user_id", userId)
          .eq("platform", "tiktok")
          .eq("is_connected", true);

        const { data: li } = await supabase
          .from("connected_accounts")
          .select("id, user_id, platform, account_name, account_id, display_name, is_connected, connected_at, token_expiry, metadata")
          .eq("user_id", userId)
          .eq("platform", "linkedin")
          .eq("is_connected", true);

        if (!cancelled) {
          setYoutubeAccounts((yt as ConnectedAccount[]) ?? []);
          setFacebookAccounts((fb as ConnectedAccount[]) ?? []);
          setInstagramAccounts((ig as ConnectedAccount[]) ?? []);
          setTiktokAccounts((tt as ConnectedAccount[]) ?? []);
          setLinkedinAccounts((li as ConnectedAccount[]) ?? []);
        }

        if (!cancelled) {
          const { data: drives } = await supabase
            .from("connected_accounts")
            .select("*")
            .eq("user_id", userId)
            .eq("platform", "google_drive")
            .eq("is_connected", true);
          setDriveAccounts((drives as ConnectedAccount[]) ?? []);
          if (drives && drives.length > 0 && !selectedDriveId) {
            setSelectedDriveId(drives[0].id!);
          }
        }

        if (!cancelled) {
          const { data: vids } = await supabase
            .from("videos")
            .select("id, title, file_url, uploaded_at")
            .eq("user_id", userId)
            .order("uploaded_at", { ascending: false });
          setVideos((vids ?? []) as any[]);
        }
      } finally {
        if (!cancelled) done();
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (selectedPlatforms.includes("youtube")) {
      invokeFunction("get-quota-usage", {
        body: { platform: "youtube" },
      }).then(({ data }) => {
        if (data) setYoutubeQuota(data);
      });
    }
  }, [selectedPlatforms]);

  useEffect(() => {
    if (selectedDriveId) {
      setDriveParentId("root");
      setDriveBreadcrumbs([]);
    }
  }, [selectedDriveId]);

  useEffect(() => {
    if (!selectedDriveId || driveTab !== "drive") return;
    (async () => {
      setDriveLoading(true);
      let allFiles: any[] = [];
      let pageToken: string | null = null;
      let hasError = false;

      do {
        const { data, error } = await invokeFunction("google-drive-auth", {
          body: JSON.stringify({
            action: "list-files",
            account_id: selectedDriveId,
            parent_id: driveParentId,
            page_token: pageToken,
          }),
        });
        if (error || !data) {
          console.error("list-files error:", error);
          toast.error("Failed to list Drive files. Try reconnecting the account.");
          hasError = true;
          break;
        }
        if (data.files) allFiles = allFiles.concat(data.files);
        pageToken = data.nextPageToken ?? null;
      } while (pageToken);

      if (!hasError) setDriveFiles(allFiles);
      setDriveLoading(false);
    })();
  }, [selectedDriveId, driveTab, driveParentId]);

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms((prev) => {
      const next = prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p];
      if (p === "youtube" && !next.includes("youtube")) setSelectedYouTubeAccountIds([]);
      if (p === "facebook" && !next.includes("facebook")) setSelectedFacebookPageIds([]);
      if (p === "instagram" && !next.includes("instagram")) setSelectedInstagramAccountIds([]);
      if (p === "tiktok" && !next.includes("tiktok")) setSelectedTikTokAccountIds([]);
      if (p === "linkedin" && !next.includes("linkedin")) setSelectedLinkedInAccountIds([]);
      return next;
    });
  };

  const toggleYouTubeChannel = (accountId: string) => {
    setSelectedYouTubeAccountIds((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
    );
  };

  const toggleFacebookPage = (accountId: string) => {
    setSelectedFacebookPageIds((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
    );
  };

  const toggleInstagramAccount = (accountId: string) => {
    setSelectedInstagramAccountIds((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
    );
  };

  const toggleTikTokAccount = (accountId: string) => {
    setSelectedTikTokAccountIds((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
    );
  };

  const toggleLinkedInAccount = (accountId: string) => {
    setSelectedLinkedInAccountIds((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
    );
  };

  const toggleStoryPlatform = (p: "facebook" | "instagram") => {
    setStoryPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const navigateDriveFolder = (folderId: string, folderName: string) => {
    setDriveBreadcrumbs((prev) => [...prev, { id: driveParentId, name: folderName }]);
    setDriveParentId(folderId);
  };

  const importFileToR2 = async (file: { id: string; name: string; mimeType: string; size: number }) => {
    if (!selectedDriveId) return;
    setImportingFile(file.id);
    try {
      const { data, error } = await invokeFunction(
        "google-drive-auth?action=upload-video-to-r2",
        {
          body: JSON.stringify({
            account_id: selectedDriveId,
            file_id: file.id,
            file_name: file.name,
            user_id: userId,
            media_type: file.mimeType?.startsWith("image") ? "image" : "video",
          }),
        },
      );
      if (error || !data?.video_id) throw new Error(error?.message || "Import failed");
      const newVideo = { id: data.video_id, title: file.name, file_url: data.r2_url, uploaded_at: new Date().toISOString() };
      setVideos((prev) => [newVideo, ...prev]);
      setSelectedVideoId(data.video_id);
      setDriveTab("videos");
      toast.success(`Imported "${file.name}" from Drive`);
    } catch (e: any) {
      toast.error(e.message);
    }
    setImportingFile(null);
  };

  function formatBytes(b: number): string {
    if (!b) return "0 B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
  }

  const MAX_FILE_SIZE = 200 * 1024 * 1024;

  const handleLocalUpload = async () => {
    if (!localFile || localUploading) return;
    if (localFile.size > MAX_FILE_SIZE) {
      toast.error("File exceeds 200MB limit");
      return;
    }
    setLocalUploading(true);
    setLocalUploadProgress(0);
    try {
      const ext = localFile.name.split(".").pop()?.toLowerCase() || "mp4";
      const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
      const { data, error } = await invokeFunction(
        "google-drive-auth?action=get-r2-upload-url",
        {
          body: JSON.stringify({
            user_id: userId,
            file_name: localFile.name,
            file_size: localFile.size,
            media_type: isImage ? "image" : "video",
            content_type: localFile.type || undefined,
          }),
        },
      );
      if (error || !data?.upload_url) throw new Error(error?.message || "Failed to get upload URL");
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", data.upload_url);
        xhr.setRequestHeader("Content-Type", localFile.type || "application/octet-stream");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setLocalUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(localFile);
      });
      const { error: updateError } = await supabase
        .from("videos")
        .update({ file_url: data.r2_url })
        .eq("id", data.video_id);
      if (updateError) throw updateError;
      const newVideo = { id: data.video_id, title: localFile.name, file_url: data.r2_url, uploaded_at: new Date().toISOString() };
      setVideos((prev) => [newVideo, ...prev]);
      setSelectedVideoId(data.video_id);
      setLocalFile(null);
      setDriveTab("videos");
      if (localFileInputRef.current) localFileInputRef.current.value = "";
      toast.success(`Uploaded "${localFile.name}"`);
    } catch (e: any) {
      toast.error(e.message);
    }
    setLocalUploadProgress(0);
    setLocalUploading(false);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    try {
      if (!selectedVideoId) {
        toast.error("Please select a video");
        return;
      }
      if (selectedPlatforms.length === 0) {
        toast.error("Please select at least one platform");
        return;
      }
      const youtubeSelected = selectedPlatforms.includes("youtube");
      if (youtubeSelected) {
        if (!youtubeTitle.trim()) {
          toast.error("YouTube title is required");
          return;
        }
        if (selectedYouTubeAccountIds.length === 0) {
          toast.error("Select at least one YouTube channel");
          return;
        }
      }
      const facebookSelected = selectedPlatforms.includes("facebook");
      if (facebookSelected && selectedFacebookPageIds.length === 0) {
        toast.error("Select at least one Facebook Page");
        return;
      }
      const instagramSelected = selectedPlatforms.includes("instagram");
      if (instagramSelected && selectedInstagramAccountIds.length === 0) {
        toast.error("Select at least one Instagram account");
        return;
      }
      const tiktokSelected = selectedPlatforms.includes("tiktok");
      if (tiktokSelected && selectedTikTokAccountIds.length === 0) {
        toast.error("Select a TikTok account");
        return;
      }
      const linkedinSelected = selectedPlatforms.includes("linkedin");
      if (linkedinSelected && selectedLinkedInAccountIds.length === 0) {
        toast.error("Select a LinkedIn account");
        return;
      }
      const videoId = selectedVideoId;

      const isPublishNow = publishMode === "now";
      let scheduledAt: string;
      if (isPublishNow) {
        scheduledAt = new Date().toISOString();
      } else {
        const [h, m] = scheduleTime.split(":").map(Number);
        const d = scheduleDate ? new Date(scheduleDate) : new Date();
        d.setHours(h, m, 0, 0);
        scheduledAt = d.toISOString();
      }

      const posts: { user_id: string; video_id: string; platform: string; caption: string | null; hashtags: string | null; scheduled_at: string; status: "scheduled" | "processing"; captions_enabled: boolean; account_id?: string | null; contains_altered_content?: boolean }[] = [];
      for (const platform of selectedPlatforms) {
        if (platform === "youtube") {
          for (const accountId of selectedYouTubeAccountIds) {
            const { data: existing } = await supabase
              .from("posts")
              .select("id")
              .eq("video_id", videoId)
              .eq("platform", platform)
              .eq("account_id", accountId)
              .eq("status", "scheduled")
              .maybeSingle();
            if (existing) {
              console.log("Post already exists, skipping", { videoId, platform, accountId });
              continue;
            }
            const platformCaption = youtubeDescription.trim() || null;
            posts.push({
              user_id: userId,
              video_id: videoId,
              platform: "youtube",
              account_id: accountId,
              caption: platformCaption,
              hashtags,
              scheduled_at: scheduledAt,
              status: isPublishNow ? "processing" : "scheduled",
              captions_enabled: captionsEnabled,
              contains_altered_content: containsAlteredContent,
            });
          }
        } else if (platform === "instagram") {
          for (const accountId of selectedInstagramAccountIds) {
            const { data: existing } = await supabase
              .from("posts")
              .select("id")
              .eq("video_id", videoId)
              .eq("platform", platform)
              .eq("account_id", accountId)
              .eq("status", "scheduled")
              .maybeSingle();
            if (existing) {
              console.log("Post already exists, skipping", { videoId, platform, accountId });
              continue;
            }
            const platformCaption = instagramCaption.trim() || null;
            posts.push({
              user_id: userId,
              video_id: videoId,
              platform: "instagram",
              account_id: accountId,
              caption: platformCaption,
              hashtags,
              scheduled_at: scheduledAt,
              status: isPublishNow ? "processing" : "scheduled",
              captions_enabled: captionsEnabled,
              post_type: storyPlatforms.has("instagram") ? "story" : "feed",
            });
          }
        } else if (platform === "facebook") {
          // Facebook posts created only here (single place)
          console.log("Creating Facebook posts for pages:", selectedFacebookPageIds);
          for (const accountId of selectedFacebookPageIds) {
            const { data: existing } = await supabase
              .from("posts")
              .select("id")
              .eq("video_id", videoId)
              .eq("platform", platform)
              .eq("account_id", accountId)
              .eq("status", "scheduled")
              .maybeSingle();
            if (existing) {
              console.log("Post already exists, skipping", { videoId, platform, accountId });
              continue;
            }
            const platformCaption = facebookCaption.trim() || null;
            posts.push({
              user_id: userId,
              video_id: videoId,
              platform: "facebook",
              account_id: accountId,
              caption: platformCaption,
              hashtags,
              scheduled_at: scheduledAt,
              status: isPublishNow ? "processing" : "scheduled",
              captions_enabled: captionsEnabled,
              post_type: storyPlatforms.has("facebook") ? "story" : "feed",
            });
          }
        } else if (platform === "tiktok") {
          for (const accountId of selectedTikTokAccountIds) {
            const { data: existing } = await supabase
              .from("posts")
              .select("id")
              .eq("video_id", videoId)
              .eq("platform", platform)
              .eq("account_id", accountId)
              .eq("status", "scheduled")
              .maybeSingle();
            if (existing) {
              console.log("Post already exists, skipping", { videoId, platform, accountId });
              continue;
            }
            const platformCaption = tiktokCaption.trim() || null;
            posts.push({
              user_id: userId,
              video_id: videoId,
              platform: "tiktok",
              account_id: accountId,
              caption: platformCaption,
              hashtags,
              scheduled_at: scheduledAt,
              status: isPublishNow ? "processing" : "scheduled",
              captions_enabled: captionsEnabled,
            });
          }
        } else if (platform === "linkedin") {
          for (const accountId of selectedLinkedInAccountIds) {
            const { data: existing } = await supabase
              .from("posts")
              .select("id")
              .eq("video_id", videoId)
              .eq("platform", platform)
              .eq("account_id", accountId)
              .eq("status", "scheduled")
              .maybeSingle();
            if (existing) {
              console.log("Post already exists, skipping", { videoId, platform, accountId });
              continue;
            }
            const platformCaption = linkedinCaption.trim() || null;
            posts.push({
              user_id: userId,
              video_id: videoId,
              platform: "linkedin",
              account_id: accountId,
              caption: platformCaption,
              hashtags,
              scheduled_at: scheduledAt,
              status: isPublishNow ? "processing" : "scheduled",
              captions_enabled: captionsEnabled,
            });
          }
        }
      }

      if (posts.length === 0) {
        toast.info("All selected posts already exist in queue.");
        if (isPublishNow) navigate("/queue");
        return;
      }

      const { data: insertedPosts, error: postsError } = await supabase.from("posts").insert(posts).select("id, platform, account_id, status");
      if (postsError) throw postsError;

      const { data: workflows } = await supabase
        .from("workflows")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true);

      if (workflows && workflows.length > 0) {
        const workflowPosts: any[] = [];
        const baseCaption = youtubeDescription || instagramCaption || facebookCaption || tiktokCaption || "";
        for (const wf of workflows) {
          const wfPlatforms = ((wf.destination_platforms as string[]) ?? []).filter(
            (p) => !selectedPlatforms.includes(p as Platform)
          );
          for (const p of wfPlatforms) {
            const delayMs = (wf.delay_hours || 0) * 3600000;
            const wfCaption = wf.caption_template
              ? wf.caption_template.replace("{{title}}", youtubeTitle || "").replace("{{hashtags}}", hashtags)
              : baseCaption;
            workflowPosts.push({
              user_id: userId,
              video_id: videoId,
              platform: p,
              caption: wfCaption,
              hashtags,
              scheduled_at: new Date(new Date(scheduledAt).getTime() + delayMs).toISOString(),
              status: "scheduled",
              captions_enabled: captionsEnabled,
            });
          }
        }
        if (workflowPosts.length > 0) {
          await supabase.from("posts").insert(workflowPosts);
        }
      }

        if (isPublishNow && insertedPosts && insertedPosts.length > 0) {
        const createdPostIds = insertedPosts.map((p: any) => p.id);

        await supabase
          .from("posts")
          .update({ status: "processing" })
          .in("id", createdPostIds);

        const youtubePosts =
          insertedPosts.filter((p: any) => p.platform === "youtube") ?? [];
        const facebookFeedPosts =
          insertedPosts.filter((p: any) => p.platform === "facebook" && p.post_type !== "story") ?? [];
        const facebookStoryPosts =
          insertedPosts.filter((p: any) => p.platform === "facebook" && p.post_type === "story") ?? [];
        const instagramFeedPosts =
          insertedPosts.filter((p: any) => p.platform === "instagram" && p.post_type !== "story") ?? [];
        const instagramStoryPosts =
          insertedPosts.filter((p: any) => p.platform === "instagram" && p.post_type === "story") ?? [];
        const tiktokPosts =
          insertedPosts.filter((p: any) => p.platform === "tiktok") ?? [];
        const linkedinPosts =
          insertedPosts.filter((p: any) => p.platform === "linkedin") ?? [];

        if (youtubePosts.length > 0) {
          toast.info("Uploading to YouTube...");
          let allOk = true;
          for (const post of youtubePosts) {
            const { error } = await invokeFunction("youtube-upload", {
              body: { postId: post.id },
            });
            if (error) {
              allOk = false;
            }
          }
          if (!allOk) {
            toast.error("Some YouTube uploads failed, check Queue");
          }
        }

        const firePost = async (post: any, fn: string) => {
          const { error } = await invokeFunction(fn, {
            body: { postId: post.id },
          });
          return !error;
        };

        if (facebookFeedPosts.length > 0) {
          toast.info("Uploading to Facebook...");
          const results = await Promise.all(facebookFeedPosts.map((p: any) => firePost(p, "facebook-upload")));
          if (results.some((r) => !r)) toast.error("Some Facebook uploads failed, check Queue");
        }
        if (facebookStoryPosts.length > 0) {
          toast.info("Posting to Facebook Story...");
          const results = await Promise.all(facebookStoryPosts.map((p: any) => firePost(p, "post-story")));
          if (results.some((r) => !r)) toast.error("Some Facebook Story posts failed, check Queue");
        }
        if (instagramFeedPosts.length > 0) {
          toast.info("Uploading to Instagram...");
          const results = await Promise.all(instagramFeedPosts.map((p: any) => firePost(p, "instagram-upload")));
          if (results.some((r) => !r)) toast.error("Some Instagram uploads failed, check Queue");
        }
        if (instagramStoryPosts.length > 0) {
          toast.info("Posting to Instagram Story...");
          const results = await Promise.all(instagramStoryPosts.map((p: any) => firePost(p, "post-story")));
          if (results.some((r) => !r)) toast.error("Some Instagram Story posts failed, check Queue");
        }

        if (tiktokPosts.length > 0) {
          toast.info("Uploading to TikTok...");
          let allOk = true;
          for (const post of tiktokPosts) {
            const { error } = await invokeFunction("tiktok-upload", {
              body: { postId: post.id },
            });
            if (error) {
              allOk = false;
            }
          }
          if (!allOk) {
            toast.error("Some TikTok uploads failed, check Queue");
          }
        }

        if (linkedinPosts.length > 0) {
          toast.info("Posting to LinkedIn...");
          let allOk = true;
          for (const post of linkedinPosts) {
            const { error } = await invokeFunction("linkedin-upload", {
              body: { postId: post.id },
            });
            if (error) {
              allOk = false;
            }
          }
          if (!allOk) {
            toast.error("Some LinkedIn uploads failed, check Queue");
          }
        }

        if (
          youtubePosts.length > 0 ||
          facebookFeedPosts.length > 0 ||
          facebookStoryPosts.length > 0 ||
          instagramFeedPosts.length > 0 ||
          instagramStoryPosts.length > 0 ||
          tiktokPosts.length > 0 ||
          linkedinPosts.length > 0
        ) {
          toast.success("Video publishing triggered!");
        }
      }

      toast.success("Added to queue!");

      if (isPublishNow) {
        navigate("/queue");
      } else {
        navigate("/queue");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="space-y-1">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Card className="bg-card border-border shadow-card">
          <CardContent className="p-4 space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-10 w-24" />
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
            <div className="flex gap-4 flex-wrap">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Upload & Distribute</h1>
        <p className="text-sm text-muted-foreground">Upload a video and schedule it across platforms</p>
      </div>

      <Card className="bg-card border-border shadow-card">
        <CardContent className="py-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary shrink-0">
              <Film size={20} className="text-muted-foreground" />
            </div>
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5 flex-wrap">
              <button
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${driveTab === "videos" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setDriveTab("videos")}
              >
                My Videos
              </button>
              <button
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${driveTab === "drive" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setDriveTab("drive")}
              >
                Google Drive
              </button>
              <button
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${driveTab === "local" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setDriveTab("local")}
              >
                Upload from Computer
              </button>
            </div>
          </div>

          {driveTab === "videos" && (
            <div className="flex-1">
              {videos.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No media found. Switch to Google Drive to import a file.
                </p>
              ) : (
                <select
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  value={selectedVideoId}
                  onChange={(e) => setSelectedVideoId(e.target.value)}
                >
                  <option value="">-- Select a video --</option>
                  {videos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.title || v.file_url} — {format(new Date(v.uploaded_at), "PP")}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {driveTab === "drive" && (
            <div className="space-y-3">
              {driveAccounts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No Google Drive accounts connected.{" "}
                  <a href="/accounts" className="text-primary underline">Connect one</a>.
                </p>
              ) : (
                <>
                  {driveAccounts.length > 1 && (
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground"
                      value={selectedDriveId ?? ""}
                      onChange={(e) => setSelectedDriveId(e.target.value || null)}
                    >
                      {driveAccounts.map((a) => (
                        <option key={a.id} value={a.id!}>{(a as any).display_name ?? a.account_name}</option>
                      ))}
                    </select>
                  )}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
                    <button className="hover:text-foreground transition-colors" onClick={() => { setDriveParentId("root"); setDriveBreadcrumbs([]); }}>Root</button>
                    {driveBreadcrumbs.map((cr, i) => (
                      <span key={cr.id} className="flex items-center gap-1">
                        <span>/</span>
                        <button className="hover:text-foreground transition-colors" onClick={() => { setDriveParentId(cr.id); setDriveBreadcrumbs((crumbs) => crumbs.slice(0, i)); }}>
                          {cr.name}
                        </button>
                      </span>
                    ))}
                  </div>
                  {driveLoading ? (
                    <div className="flex items-center gap-2 py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-xs text-muted-foreground">Loading files...</span>
                    </div>
                  ) : driveFiles.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                      {driveParentId === "root" ? "No files found in Drive root." : "This folder is empty."}
                    </p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {driveFiles.map((f: any) => {
                        const isFolder = f.mimeType === "application/vnd.google-apps.folder";
                        const isImporting = importingFile === f.id;
                        return (
                          <div key={f.id} className="flex items-center gap-2 p-2 rounded-md bg-secondary/40 border border-border/40">
                            <div className="shrink-0">
                              {isFolder ? <Folder size={16} className="text-blue-400" /> : <FileIcon size={16} className="text-muted-foreground" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">{f.name}</p>
                              {!isFolder && (
                                <p className="text-[10px] text-muted-foreground">
                                  {formatBytes(f.size)} — {f.modifiedTime ? format(new Date(f.modifiedTime), "PP") : ""}
                                </p>
                              )}
                            </div>
                            {isFolder ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs shrink-0"
                                onClick={() => navigateDriveFolder(f.id, f.name)}
                              >
                                Open
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs shrink-0"
                                disabled={isImporting}
                                onClick={() => importFileToR2(f)}
                              >
                                {isImporting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Import"}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {driveTab === "local" && (
            <div className="space-y-3">
              <input
                ref={localFileInputRef}
                type="file"
                accept="video/*,image/*"
                className="hidden"
                onChange={(e) => setLocalFile(e.target.files?.[0] ?? null)}
              />
              {!localFile ? (
                <div
                  className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => localFileInputRef.current?.click()}
                >
                  <Film size={32} className="mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Click to select a video or image</p>
                  <p className="text-xs text-muted-foreground mt-1">Max 200MB</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 rounded-md bg-secondary/40 border border-border/40">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{localFile.name}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(localFile.size)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs shrink-0"
                      onClick={() => { setLocalFile(null); if (localFileInputRef.current) localFileInputRef.current.value = ""; }}
                    >
                      Remove
                    </Button>
                  </div>
                  {localUploading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded px-2 py-1.5">
                      <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                      <span className="flex-1">Uploading to storage...</span>
                      <span className="shrink-0">{localUploadProgress}%</span>
                      <div className="h-1.5 w-16 rounded-full bg-secondary overflow-hidden shrink-0">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${localUploadProgress}%` }} />
                      </div>
                    </div>
                  )}
                  <Button
                    className="w-full"
                    onClick={handleLocalUpload}
                    disabled={localUploading}
                  >
                    {localUploading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading…</>
                    ) : (
                      "Upload to FlowPost"
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border shadow-card">
        <CardHeader><CardTitle className="text-foreground">Platforms</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {platforms.map((p) => (
            <div key={p.id}>
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox checked={selectedPlatforms.includes(p.id)} onCheckedChange={() => togglePlatform(p.id)} />
                <span className="text-sm text-foreground">{p.label}</span>
                {p.id === "tiktok" && <BetaBadge />}
                {p.id === "linkedin" && <BetaBadge />}
              </label>
              {p.id === "youtube" && selectedPlatforms.includes("youtube") && (
                <div className="ml-6 mt-2 space-y-2">
                  {youtubeAccounts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No YouTube channels connected. Connect one in Accounts.</p>
                  ) : (
                    youtubeAccounts.map((acc) => (
                      <label key={acc.id} className="flex items-center gap-3 cursor-pointer">
                        <Checkbox
                          checked={selectedYouTubeAccountIds.includes(acc.account_id ?? "")}
                          onCheckedChange={() => toggleYouTubeChannel(acc.account_id ?? "")}
                        />
                        <span className="text-sm text-foreground">
                          {acc.account_name ?? "YouTube"} ({acc.account_id})
                        </span>
                      </label>
                    ))
                  )}
                </div>
              )}
              {p.id === "facebook" && selectedPlatforms.includes("facebook") && (
                <div className="ml-6 mt-2 space-y-2">
                  {facebookAccounts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No Facebook Pages connected. Connect in Accounts.</p>
                  ) : (
                    facebookAccounts.map((acc) => (
                      <label key={acc.id} className="flex items-center gap-3 cursor-pointer">
                        <Checkbox
                          checked={selectedFacebookPageIds.includes(acc.account_id ?? "")}
                          onCheckedChange={() => toggleFacebookPage(acc.account_id ?? "")}
                        />
                        <span className="text-sm text-foreground">
                          {acc.account_name ?? "Facebook Page"} ({acc.account_id})
                        </span>
                      </label>
                    ))
                  )}
                  {selectedFacebookPageIds.length > 0 && (
                    <label className="flex items-center gap-3 pt-1 border-t border-border/40">
                      <Switch
                        checked={storyPlatforms.has("facebook")}
                        onCheckedChange={() => toggleStoryPlatform("facebook")}
                      />
                      <span className="text-xs text-muted-foreground">Post as Story</span>
                    </label>
                  )}
                </div>
              )}
              {p.id === "instagram" && selectedPlatforms.includes("instagram") && (
                <div className="ml-6 mt-2 space-y-2">
                  {instagramAccounts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No Instagram Business accounts found. Connect via Facebook in Accounts.
                    </p>
                  ) : (
                    instagramAccounts.map((acc) => (
                      <label key={acc.id} className="flex items-center gap-3 cursor-pointer">
                        <Checkbox
                          checked={selectedInstagramAccountIds.includes(acc.account_id ?? "")}
                          onCheckedChange={() => toggleInstagramAccount(acc.account_id ?? "")}
                        />
                        <span className="text-sm text-foreground">
                          {acc.account_name ?? "Instagram"} ({acc.account_id})
                        </span>
                      </label>
                    ))
                  )}
                  {selectedInstagramAccountIds.length > 0 && (
                    <label className="flex items-center gap-3 pt-1 border-t border-border/40">
                      <Switch
                        checked={storyPlatforms.has("instagram")}
                        onCheckedChange={() => toggleStoryPlatform("instagram")}
                      />
                      <span className="text-xs text-muted-foreground">Post as Story</span>
                    </label>
                  )}
                </div>
              )}
              {p.id === "tiktok" && selectedPlatforms.includes("tiktok") && (
                <div className="ml-6 mt-2 space-y-2">
                  {tiktokAccounts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No TikTok account connected. Connect in Accounts.
                    </p>
                  ) : (
                    tiktokAccounts.map((acc) => (
                      <label key={acc.id} className="flex items-center gap-3 cursor-pointer">
                        <Checkbox
                          checked={selectedTikTokAccountIds.includes(acc.account_id ?? "")}
                          onCheckedChange={() => toggleTikTokAccount(acc.account_id ?? "")}
                        />
                        <span className="text-sm text-foreground">
                          {acc.account_name ?? "TikTok"} ({acc.account_id})
                        </span>
                      </label>
                    ))
                  )}
                </div>
              )}
              {p.id === "linkedin" && selectedPlatforms.includes("linkedin") && (
                <div className="ml-6 mt-2 space-y-2">
                  {linkedinAccounts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No LinkedIn account connected. Connect in Accounts.
                    </p>
                  ) : (
                    linkedinAccounts.map((acc) => (
                      <label key={acc.id} className="flex items-center gap-3 cursor-pointer">
                        <Checkbox
                          checked={selectedLinkedInAccountIds.includes(acc.account_id ?? "")}
                          onCheckedChange={() => toggleLinkedInAccount(acc.account_id ?? "")}
                        />
                        <span className="text-sm text-foreground">
                          {acc.account_name ?? "LinkedIn"} ({acc.account_id})
                        </span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {selectedPlatforms.length > 0 && (
        <Card className="bg-card border-border shadow-card">
          <CardHeader><CardTitle className="text-foreground">Per-platform content</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            {selectedPlatforms.includes("youtube") && (
              <div className="space-y-3 border border-border/60 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <Youtube className="h-4 w-4 text-red-500" />
                  <span className="text-sm font-medium text-foreground">YouTube</span>
                  {youtubeQuota && youtubeQuota.percentage >= 50 && (
                    <Badge
                      variant="outline"
                      className={
                        youtubeQuota.percentage >= 80
                          ? "bg-red-500/20 text-destructive border-red-500/30 text-[10px]"
                          : "bg-yellow-500/20 text-yellow-600 border-yellow-500/30 text-[10px]"
                      }
                    >
                      {youtubeQuota.percentage >= 80
                        ? `${youtubeQuota.estimatedUploadsRemaining} uploads left today`
                        : `${youtubeQuota.percentage}% quota used`}
                    </Badge>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Video Title</Label>
                  <Input
                    placeholder="Required for YouTube posts"
                    value={youtubeTitle}
                    onChange={(e) => setYoutubeTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>YouTube Description (optional)</Label>
                  <Textarea
                    placeholder="Description for YouTube Shorts"
                    value={youtubeDescription}
                    onChange={(e) => setYoutubeDescription(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                </div>
              </div>
            )}

            {selectedPlatforms.includes("instagram") && (
              <div className="space-y-3 border border-border/60 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <Instagram className="h-4 w-4 text-pink-500" />
                  <span className="text-sm font-medium text-foreground">Instagram</span>
                </div>
                <div className="space-y-2">
                  <Label>Instagram Caption (optional)</Label>
                  <Textarea
                    placeholder="Caption for Instagram Reels"
                    value={instagramCaption}
                    onChange={(e) => setInstagramCaption(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                </div>
              </div>
            )}

            {selectedPlatforms.includes("facebook") && (
              <div className="space-y-3 border border-border/60 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <Facebook className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium text-foreground">Facebook</span>
                </div>
                <div className="space-y-2">
                  <Label>Facebook Caption (optional)</Label>
                  <Textarea
                    placeholder="Caption for Facebook Page"
                    value={facebookCaption}
                    onChange={(e) => setFacebookCaption(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                </div>
              </div>
            )}

            {selectedPlatforms.includes("tiktok") && (
              <div className="space-y-3 border border-border/60 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <PlatformIcon platform="tiktok" size={16} />
                  <span className="text-sm font-medium text-foreground">TikTok</span>
                  <BetaBadge />
                </div>
                <div className="space-y-2">
                  <Label>TikTok Caption (optional)</Label>
                  <Textarea
                    placeholder="Caption for TikTok"
                    value={tiktokCaption}
                    onChange={(e) => setTiktokCaption(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                </div>
              </div>
            )}

            {selectedPlatforms.includes("linkedin") && (
              <div className="space-y-3 border border-border/60 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <PlatformIcon platform="linkedin" size={16} />
                  <span className="text-sm font-medium text-foreground">LinkedIn</span>
                </div>
                <div className="space-y-2">
                  <Label>LinkedIn Caption (optional)</Label>
                  <Textarea
                    placeholder="Caption for LinkedIn post"
                    value={linkedinCaption}
                    onChange={(e) => setLinkedinCaption(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                </div>
              </div>
            )}

            {/* <div className="space-y-2">
              <Label>Hashtags (optional, shared)</Label>
              <Input
                placeholder="#viral #shorts #reels"
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
              />
            </div> */}
          </CardContent>
        </Card>
      )}

      {/* <Card className="bg-card border-border shadow-card">
        <CardHeader><CardTitle className="text-foreground">Content settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className={cn("rounded-lg border p-4", containsAlteredContent ? "border-amber-500/50 bg-amber-500/10" : "border-border")}>
            <Label className="text-sm font-medium">Does this video contain altered or synthetic content?</Label>
            <p className="text-xs text-muted-foreground mt-0.5">(AI-generated faces, voices, or realistic scenes)</p>
            <RadioGroup
              value={containsAlteredContent ? "yes" : "no"}
              onValueChange={(v) => setContainsAlteredContent(v === "yes")}
              className="mt-3 space-y-2"
            >
              <label className="flex items-center gap-3 cursor-pointer">
                <RadioGroupItem value="no" />
                <span className="text-sm text-foreground">No — This is original content</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <RadioGroupItem value="yes" />
                <span className={cn("text-sm", containsAlteredContent ? "text-amber-600 font-medium" : "text-foreground")}>
                  Yes — This contains AI-generated/altered content
                </span>
              </label>
            </RadioGroup>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Burn subtitles into video</Label>
              <p className="text-xs text-muted-foreground">Auto-captions will be added</p>
            </div>
            <Switch checked={captionsEnabled} onCheckedChange={setCaptionsEnabled} />
          </div>
        </CardContent>
      </Card> */}

      <Card className="bg-card border-border shadow-card">
        <CardHeader><CardTitle className="text-foreground">Publish Options</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <Button
              variant={publishMode === "now" ? "default" : "outline"}
              className={publishMode === "now" ? "gradient-primary text-primary-foreground" : ""}
              onClick={() => setPublishMode("now")}
            >
              Publish Now
            </Button>
            <Button
              variant={publishMode === "schedule" ? "default" : "outline"}
              className={publishMode === "schedule" ? "gradient-primary text-primary-foreground" : ""}
              onClick={() => setPublishMode("schedule")}
            >
              Schedule
            </Button>
          </div>
          {publishMode === "schedule" && (
            <div className="flex gap-3 flex-wrap">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("justify-start text-left font-normal", !scheduleDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduleDate ? format(scheduleDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={scheduleDate} onSelect={setScheduleDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="w-32" />
            </div>
          )}
        </CardContent>
      </Card>

      {isSubmitting && (
        <Card className="bg-card border-border shadow-card overflow-hidden">
          <CardContent className="pt-5 pb-5 space-y-3">
            <div className="flex items-center gap-2">
               <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Posting...</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Button
        className="w-full gradient-primary text-primary-foreground h-12 text-base font-semibold"
        onClick={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</>
        ) : (
          "Add to Queue"
        )}
      </Button>
    </div>
  );
}
