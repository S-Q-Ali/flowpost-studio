import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Upload, CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Platform } from "@/lib/types";

const PERSONAL_USER_ID = "00000000-0000-0000-0000-000000000000";

const platforms: { id: Platform; label: string }[] = [
  { id: "facebook", label: "Facebook Page" },
  { id: "instagram", label: "Instagram Reels" },
  { id: "youtube", label: "YouTube Shorts" },
];

export default function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [publishMode, setPublishMode] = useState<"now" | "schedule">("now");
  const [scheduleDate, setScheduleDate] = useState<Date>();
  const [scheduleTime, setScheduleTime] = useState("12:00");
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.type === "video/mp4" || f.type === "video/quicktime")) setFile(f);
    else toast.error("Please upload an .mp4 or .mov file");
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  };

  const handleSubmit = async () => {
    if (!file || !title || selectedPlatforms.length === 0) {
      toast.error("Please fill in all required fields");
      return;
    }
    setIsSubmitting(true);
    try {
      const filePath = `${PERSONAL_USER_ID}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("videos").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("videos").getPublicUrl(filePath);

      const { data: video, error: videoError } = await supabase
        .from("videos")
        .insert({ user_id: PERSONAL_USER_ID, title, file_url: publicUrl })
        .select()
        .single();
      if (videoError) throw videoError;

      let scheduledAt = new Date().toISOString();
      if (publishMode === "schedule" && scheduleDate) {
        const [h, m] = scheduleTime.split(":").map(Number);
        const d = new Date(scheduleDate);
        d.setHours(h, m, 0, 0);
        scheduledAt = d.toISOString();
      }

      const posts = selectedPlatforms.map((platform) => ({
        user_id: PERSONAL_USER_ID,
        video_id: video.id,
        platform,
        caption,
        hashtags,
        scheduled_at: scheduledAt,
        status: "scheduled" as const,
        captions_enabled: captionsEnabled,
      }));

      const { error: postsError } = await supabase.from("posts").insert(posts);
      if (postsError) throw postsError;

      const { data: workflows } = await supabase
        .from("workflows")
        .select("*")
        .eq("user_id", PERSONAL_USER_ID)
        .eq("is_active", true);

      if (workflows && workflows.length > 0) {
        const workflowPosts: any[] = [];
        for (const wf of workflows) {
          const wfPlatforms = (wf.destination_platforms as string[]).filter(
            (p) => !selectedPlatforms.includes(p as Platform)
          );
          for (const p of wfPlatforms) {
            const delayMs = (wf.delay_hours || 0) * 3600000;
            const wfCaption = wf.caption_template
              ? wf.caption_template.replace("{{title}}", title).replace("{{hashtags}}", hashtags)
              : caption;
            workflowPosts.push({
              user_id: PERSONAL_USER_ID,
              video_id: video.id,
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

      toast.success("Video added to queue!");
      navigate("/queue");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Upload & Distribute</h1>
        <p className="text-sm text-muted-foreground">Upload a video and schedule it across platforms</p>
      </div>

      <Card
        className={cn(
          "border-2 border-dashed transition-colors cursor-pointer bg-card",
          isDragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Upload size={40} className="text-muted-foreground mb-3" />
          {file ? (
            <p className="text-sm text-foreground font-medium">{file.name}</p>
          ) : (
            <>
              <p className="text-sm text-foreground font-medium">Drop your video here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">Accepts .mp4, .mov — 9:16 vertical format</p>
            </>
          )}
          <input id="file-input" type="file" accept=".mp4,.mov" className="hidden" onChange={handleFileSelect} />
        </CardContent>
      </Card>

      <Card className="bg-card border-border shadow-card">
        <CardHeader><CardTitle className="text-foreground">Post Details</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Video Title</Label>
            <Input placeholder="Internal label for this video" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Caption / Description</Label>
            <Textarea placeholder="Write your caption…" value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Hashtags</Label>
            <Input placeholder="#viral #shorts #reels" value={hashtags} onChange={(e) => setHashtags(e.target.value)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Burn subtitles into video</Label>
              <p className="text-xs text-muted-foreground">Auto-captions will be added</p>
            </div>
            <Switch checked={captionsEnabled} onCheckedChange={setCaptionsEnabled} />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border shadow-card">
        <CardHeader><CardTitle className="text-foreground">Platforms</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {platforms.map((p) => (
            <label key={p.id} className="flex items-center gap-3 cursor-pointer">
              <Checkbox checked={selectedPlatforms.includes(p.id)} onCheckedChange={() => togglePlatform(p.id)} />
              <span className="text-sm text-foreground">{p.label}</span>
            </label>
          ))}
        </CardContent>
      </Card>

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

      <Button
        className="w-full gradient-primary text-primary-foreground h-12 text-base font-semibold"
        onClick={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</> : "Add to Queue"}
      </Button>
    </div>
  );
}
