import { useState, useCallback } from "react";
import { Upload, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface LocalFileUploaderProps {
  onFileSelected: (file: File) => void;
  mediaType: "video" | "image";
  disabled?: boolean;
}

export function LocalFileUploader({ onFileSelected, mediaType, disabled }: LocalFileUploaderProps) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const isValidType = mediaType === "video"
      ? file.type.startsWith("video/")
      : file.type.startsWith("image/");
    
    if (!isValidType) {
      toast.error(`Please select a ${mediaType} file`);
      return;
    }

    // Validate file size (5GB max)
    const maxSize = 5 * 1024 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("File too large. Maximum size is 5GB");
      return;
    }

    setUploading(true);
    try {
      onFileSelected(file);
      toast.success("File selected - ready to upload");
    } catch (error) {
      toast.error("Failed to process file");
    } finally {
      setUploading(false);
      // Reset input
      e.target.value = "";
    }
  }, [onFileSelected, mediaType]);

  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
        <input
          type="file"
          accept={mediaType === "video" ? "video/*" : "image/*"}
          onChange={handleFileChange}
          disabled={disabled || uploading}
          className="hidden"
          id="local-file-upload"
        />
        
        <label
          htmlFor="local-file-upload"
          className="cursor-pointer flex flex-col items-center gap-4"
        >
          {uploading ? (
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          ) : (
            <Upload className="h-12 w-12 text-muted-foreground" />
          )}
          
          <div className="space-y-1">
            <p className="text-lg font-medium">
              {uploading ? "Processing..." : "Select file from your computer"}
            </p>
            <p className="text-sm text-muted-foreground">
              Supports {mediaType === "video" ? "MP4, MOV, AVI" : "JPG, PNG, WEBP"}
            </p>
            <p className="text-xs text-muted-foreground">
              Max 5GB
            </p>
          </div>
        </label>
      </div>
      
      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 mt-0.5" />
        <p>
          Files uploaded from local drive will be cached to Cloudflare R2 for zero-egress delivery
        </p>
      </div>
    </div>
  );
}
