import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, Youtube, Instagram, Facebook, Film } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { Platform } from "@/lib/types";
import type { ConnectedAccount } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/PlatformIcon";
import { BetaBadge } from "@/components/BetaBadge";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const platforms: { id: Platform; label: string }[] = [
  { id: "facebook", label: "Facebook Page" },
  { id: "instagram", label: "Instagram Reels" },
  { id: "youtube", label: "YouTube Shorts" },
  { id: "tiktok", label: "TikTok" },
];

export default function UploadPage() {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [videos, setVideos] = useState<{ id: string; title: string; file_url: string; created_at: string }[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubeDescription, setYoutubeDescription] = useState("");
  const [instagramCaption, setInstagramCaption] = useState("");
  const [facebookCaption, setFacebookCaption] = useState("");
  const [tiktokCaption, setTiktokCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [selectedYouTubeAccountIds, setSelectedYouTubeAccountIds] = useState<string[]>([]);
  const [selectedFacebookPageIds, setSelectedFacebookPageIds] = useState<string[]>([]);
  const [selectedInstagramAccountIds, setSelectedInstagramAccountIds] = useState<string[]>([]);
  const [selectedTikTokAccountIds, setSelectedTikTokAccountIds] = useState<string[]>([]);
  const [youtubeAccounts, setYoutubeAccounts] = useState<ConnectedAccount[]>([]);
  const [youtubeQuota, setYoutubeQuota] = useState<{ used: number; percentage: number; uploadCount: number; estimatedUploadsRemaining: number } | null>(null);
  const [facebookAccounts, setFacebookAccounts] = useState<ConnectedAccount[]>([]);
  const [instagramAccounts, setInstagramAccounts] = useState<ConnectedAccount[]>([]);
  const [tiktokAccounts, setTiktokAccounts] = useState<ConnectedAccount[]>([]);
  const [publishMode, setPublishMode] = useState<"now" | "schedule">("now");
  const getDefaultScheduleDate = () => {
    const date = new Date();
    date.setHours(17, 0, 0, 0);
    return date;
  };
  const [scheduleDate, setScheduleDate] = useState<Date>(getDefaultScheduleDate());
  const [scheduleTime, setScheduleTime] = useState("17:00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [containsAlteredContent, setContainsAlteredContent] = useState(true);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    const load = async () => {
      const { data: yt } = await supabase
        .from("connected_accounts")
        .select("*")
        .eq("user_id", userId)
        .eq("platform", "youtube")
        .eq("is_connected", true);

      const { data: fb } = await supabase
        .from("connected_accounts")
        .select("*")
        .eq("user_id", userId)
        .eq("platform", "facebook")
        .eq("is_connected", true);

      const { data: ig } = await supabase
        .from("connected_accounts")
        .select("*")
        .eq("user_id", userId)
        .eq("platform", "instagram")
        .eq("is_connected", true);

      const { data: tt } = await supabase
        .from("connected_accounts")
        .select("*")
        .eq("user_id", userId)
        .eq("platform", "tiktok")
        .eq("is_connected", true);

      setYoutubeAccounts((yt as ConnectedAccount[]) ?? []);
      setFacebookAccounts((fb as ConnectedAccount[]) ?? []);
      setInstagramAccounts((ig as ConnectedAccount[]) ?? []);
      setTiktokAccounts((tt as ConnectedAccount[]) ?? []);

      const { data: vids } = await supabase
        .from("videos")
        .select("id, title, file_url, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      setVideos((vids ?? []) as any[]);
    };
    load();
  }, []);

  useEffect(() => {
    if (selectedPlatforms.includes("youtube")) {
      (async () => {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/get-quota-usage?platform=youtube`, {
            headers: { Authorization: `Bearer ${anonKey}` },
          });
          if (res.ok) setYoutubeQuota(await res.json());
        } catch { /* ignore */ }
      })();
    }
  }, [selectedPlatforms]);

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms((prev) => {
      const next = prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p];
      if (p === "youtube" && !next.includes("youtube")) setSelectedYouTubeAccountIds([]);
      if (p === "facebook" && !next.includes("facebook")) setSelectedFacebookPageIds([]);
      if (p === "instagram" && !next.includes("instagram")) setSelectedInstagramAccountIds([]);
      if (p === "tiktok" && !next.includes("tiktok")) setSelectedTikTokAccountIds([]);
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
        const facebookPosts =
          insertedPosts.filter((p: any) => p.platform === "facebook") ?? [];
        const instagramPosts =
          insertedPosts.filter((p: any) => p.platform === "instagram") ?? [];
        const tiktokPosts =
          insertedPosts.filter((p: any) => p.platform === "tiktok") ?? [];

        if (youtubePosts.length > 0) {
          toast.info("Uploading to YouTube...");
          let allOk = true;
          for (const post of youtubePosts) {
            const res = await fetch(
              `${supabaseUrl}/functions/v1/youtube-upload`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${anonKey}`,
                  apikey: anonKey,
                },
                body: JSON.stringify({ postId: post.id }),
              },
            );
            if (!res.ok) {
              allOk = false;
            }
          }
          if (!allOk) {
            toast.error("Some YouTube uploads failed, check Queue");
          }
        }

        if (facebookPosts.length > 0) {
          toast.info("Uploading to Facebook...");
          let allOk = true;
          for (const post of facebookPosts) {
            const res = await fetch(
              `${supabaseUrl}/functions/v1/facebook-upload`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${anonKey}`,
                  apikey: anonKey,
                },
                body: JSON.stringify({ postId: post.id }),
              },
            );
            if (!res.ok) {
              allOk = false;
            }
          }
          if (!allOk) {
            toast.error("Some Facebook uploads failed, check Queue");
          }
        }

        if (instagramPosts.length > 0) {
          toast.info("Uploading to Instagram...");
          let allOk = true;
          for (const post of instagramPosts) {
            const res = await fetch(
              `${supabaseUrl}/functions/v1/instagram-upload`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${anonKey}`,
                  apikey: anonKey,
                },
                body: JSON.stringify({ postId: post.id }),
              },
            );
            if (!res.ok) {
              allOk = false;
            }
          }
          if (!allOk) {
            toast.error("Some Instagram uploads failed, check Queue");
          }
        }

        if (tiktokPosts.length > 0) {
          toast.info("Uploading to TikTok...");
          let allOk = true;
          for (const post of tiktokPosts) {
            const res = await fetch(
              `${supabaseUrl}/functions/v1/tiktok-upload`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${anonKey}`,
                  apikey: anonKey,
                },
                body: JSON.stringify({ postId: post.id }),
              },
            );
            if (!res.ok) {
              allOk = false;
            }
          }
          if (!allOk) {
            toast.error("Some TikTok uploads failed, check Queue");
          }
        }

        if (
          youtubePosts.length > 0 ||
          facebookPosts.length > 0 ||
          instagramPosts.length > 0 ||
          tiktokPosts.length > 0
        ) {
          toast.success("Video publishing triggered!");
        }
      }

      toast.success("Added to queue!");

      if (isPublishNow) {
        navigate("/queue");
      } else {
        const scheduledLabel = scheduleDate
          ? format(new Date(scheduledAt), "PPp")
          : format(new Date(scheduledAt), "PPp");
        navigate("/queue");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Upload & Distribute</h1>
        <p className="text-sm text-muted-foreground">Upload a video and schedule it across platforms</p>
      </div>

      <Card className="bg-card border-border shadow-card">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
              <Film size={20} className="text-muted-foreground" />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium text-foreground">Select Media</label>
              {videos.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No media found. Use a Google Drive workflow to upload media.
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
                      {v.title || v.file_url} — {format(new Date(v.created_at), "PP")}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
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
                          ? "bg-red-500/20 text-red-400 border-red-500/30 text-[10px]"
                          : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]"
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
                <span className={cn("text-sm", containsAlteredContent ? "text-amber-600 dark:text-amber-400 font-medium" : "text-foreground")}>
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
          <div className="flex gap-3">
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
            <div className="flex gap-3">
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
              <Loader2 className="h-4 w-4 animate-spin text-[#7C3AED]" />
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
