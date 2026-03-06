import { supabase } from "@/integrations/supabase/client";

interface GetUploadUrlResponse {
  uploadUrl: string;
  publicUrl: string;
}

export async function uploadToR2(file: File, userId: string): Promise<string> {
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

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload file to storage");
  }

  return publicUrl;
}

