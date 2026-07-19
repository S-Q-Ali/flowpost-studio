import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Sparkles, Check, CircleDot } from "lucide-react";

interface CaptionData {
  yt_video_title: string;
  yt_video_description: string;
  fb_ig_caption: string;
  tiktok_caption: string;
  linkedin_caption: string;
}

type StepId =
  | "fetching-key"
  | "downloading"
  | "loading-ffmpeg"
  | "extracting"
  | "transcribing"
  | "analyzing-visuals"
  | "generating-captions"
  | "saving"
  | "done"
  | "error";

const STEP_ORDER: StepId[] = [
  "fetching-key",
  "downloading",
  "loading-ffmpeg",
  "extracting",
  "transcribing",
  "analyzing-visuals",
  "generating-captions",
  "saving",
  "done",
];

const STEP_LABELS: Record<StepId, string> = {
  "fetching-key": "Authenticating",
  downloading: "Downloading video",
  "loading-ffmpeg": "Loading FFmpeg engine",
  extracting: "Extracting audio & frames",
  transcribing: "Transcribing audio",
  "analyzing-visuals": "Analyzing video frames",
  "generating-captions": "Generating captions",
  saving: "Saving captions",
  done: "Completed",
  error: "Error",
};

interface CaptionPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  captions: CaptionData | null;
  loading: boolean;
  fileName: string;
  onSave: (captions: CaptionData) => void;
  progressStep: StepId | null;
  progressPercent: number;
  progressLabel: string | null;
}

const platformSections: { key: keyof CaptionData; label: string; note: string }[] = [
  { key: "yt_video_title", label: "YouTube Title", note: "Max 100 chars" },
  { key: "yt_video_description", label: "YouTube Description", note: "Max 1000 chars" },
  { key: "fb_ig_caption", label: "Facebook / Instagram Caption", note: "Max 500 chars" },
  { key: "tiktok_caption", label: "TikTok Caption", note: "Max 500 chars" },
  { key: "linkedin_caption", label: "LinkedIn Caption", note: "Max 1000 chars" },
];

export function CaptionPreviewModal({
  open,
  onOpenChange,
  captions,
  loading,
  fileName,
  onSave,
  progressStep,
  progressPercent,
  progressLabel,
}: CaptionPreviewModalProps) {
  const activeIdx = progressStep ? STEP_ORDER.indexOf(progressStep) : -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI-Generated Captions
          </DialogTitle>
          <DialogDescription>
            {loading
              ? `Generating captions for "${fileName}"...`
              : `Preview and edit captions for "${fileName}" before saving.`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-4 space-y-3">
            {STEP_ORDER.map((step, idx) => {
              const isDone = idx < activeIdx;
              const isActive = idx === activeIdx;
              return (
                <div
                  key={step}
                  className={`flex items-center gap-3 text-sm ${
                    isActive ? "text-foreground" : isDone ? "text-primary" : "text-muted-foreground/40"
                  }`}
                >
                  <div className="flex items-center justify-center w-5 h-5 shrink-0">
                    {isDone ? (
                      <Check className="h-4 w-4" />
                    ) : isActive ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CircleDot className="h-4 w-4" />
                    )}
                  </div>
                  <span className={isActive ? "font-medium" : ""}>{STEP_LABELS[step]}</span>
                  {isActive && progressLabel && (
                    <span className="text-xs text-muted-foreground ml-auto">{progressLabel}</span>
                  )}
                  {isActive && (
                    <div className="flex-1 max-w-[100px] ml-auto">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-300"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : captions ? (
          <>
            <div className="flex-1 overflow-y-auto max-h-[55vh] space-y-4 pr-1">
              {platformSections.map(({ key, label, note }) => (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground">{label}</label>
                    <span className="text-[10px] text-muted-foreground">{note}</span>
                  </div>
                  <Textarea
                    className="text-xs min-h-[60px] resize-y"
                    value={captions[key] ?? ""}
                    readOnly
                  />
                </div>
              ))}
            </div>

            <DialogFooter className="flex justify-end gap-2 pt-4 border-t border-border mt-4">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="gradient-primary text-primary-foreground gap-2"
                onClick={() => onSave(captions)}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Apply to Item
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
