import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sparkles, RefreshCw } from "lucide-react";

const CAPTION_LABELS: Record<string, string> = {
  yt_video_title: "YouTube Title",
  yt_video_description: "YouTube Description",
  fb_ig_caption: "Facebook / Instagram Caption",
  tiktok_caption: "TikTok Caption",
  linkedin_caption: "LinkedIn Caption",
  caption: "Caption",
};

type StepId =
  | "fetching-key"
  | "downloading"
  | "transcribing"
  | "analyzing-visuals"
  | "generating-captions"
  | "done"
  | "error";

const STEP_LABELS: Record<StepId, string> = {
  "fetching-key": "Preparing",
  downloading: "Downloading file",
  transcribing: "Transcribing audio",
  "analyzing-visuals": "Analyzing content",
  "generating-captions": "Creating captions",
  done: "Completed",
  error: "Error",
};

interface CaptionPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  captions: Record<string, string> | null;
  loading: boolean;
  fileName: string;
  onSave: (captions: Record<string, string>) => void;
  onRegenerate: () => void;
  progressStep: StepId | null;
  progressPercent: number;
  progressLabel: string | null;
}

export function CaptionPreviewModal({
  open,
  onOpenChange,
  captions,
  loading,
  fileName,
  onSave,
  onRegenerate,
  progressStep,
  progressPercent,
  progressLabel,
}: CaptionPreviewModalProps) {
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
              : `Generated captions for "${fileName}". Tap Regenerate to get a new version.`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="relative w-28 h-28">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 120 120">
                <circle
                  cx="60" cy="60" r="48"
                  fill="none"
                  stroke="hsl(var(--muted))"
                  strokeWidth="8"
                />
                <circle
                  cx="60" cy="60" r="48"
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 48}
                  strokeDashoffset={2 * Math.PI * 48 * (1 - progressPercent / 100)}
                  className="transition-all duration-500 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-foreground">{progressPercent}%</span>
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">
                {progressStep ? STEP_LABELS[progressStep] : "Starting..."}
              </p>
              {progressLabel && (
                <p className="text-xs text-muted-foreground">{progressLabel}</p>
              )}
            </div>
          </div>
        ) : captions ? (
          <>
            <div className="flex-1 overflow-y-auto max-h-[55vh] space-y-4 pr-1">
              {Object.keys(captions).filter((k) => captions[k]).map((key) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">{CAPTION_LABELS[key] || key}</label>
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
                variant="outline"
                className="gap-2"
                onClick={onRegenerate}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
