import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Sparkles } from "lucide-react";

interface CaptionData {
  yt_video_title: string;
  yt_video_description: string;
  fb_ig_caption: string;
  tiktok_caption: string;
  linkedin_caption: string;
}

interface CaptionPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  captions: CaptionData | null;
  loading: boolean;
  fileName: string;
  onSave: (captions: CaptionData) => void;
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
            Preview and edit captions for "{fileName}" before saving.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Generating captions with AI...</p>
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

            <div className="flex justify-end gap-2 pt-4 border-t border-border mt-4 shrink-0">
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
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
