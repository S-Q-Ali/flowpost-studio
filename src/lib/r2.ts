import { supabase } from "@/integrations/supabase/client";

interface GetUploadUrlResponse {
  uploadUrl: string;
  publicUrl: string;
}

export async function uploadToR2(
  file: File,
  userId: string,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke<GetUploadUrlResponse>(
    "get-upload-url",
    {
      body: {
        fileName: file.name,
        fileType: file.type,
        userId,
      },
    },
  );

  if (error || !data) {
    throw new Error(error?.message || "Failed to obtain upload URL");
  }

  const { uploadUrl, publicUrl } = data;

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress?.(percent);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(publicUrl);
      } else {
        reject(new Error("Failed to upload file to storage"));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Failed to upload file to storage"));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload aborted"));
    });

    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });
}
