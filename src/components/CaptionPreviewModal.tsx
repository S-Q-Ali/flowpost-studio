import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Sparkles, Check, CircleDot } from "lucide-react";

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

const STEP_ORDER: StepId[] = [
  "fetching-key",
  "downloading",
  "transcribing",
  "analyzing-visuals",
  "generating-captions",
  "done",
];

const STEP_LABELS: Record<StepId, string> = {
  "fetching-key": "Authenticating",
  downloading: "Downloading video",
  transcribing: "Transcribing audio",
  "analyzing-visuals": "Analyzing video frames",
  "generating-captions": "Generating captions",
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
