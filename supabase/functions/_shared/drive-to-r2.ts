export type GetUploadUrlResponse = {
  uploadUrl: string;
  publicUrl: string;
};

function validateUrl(url: string, allowedDomains: string[]): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return allowedDomains.some(
      (domain) => parsed.hostname === domain || parsed.hostname.endsWith("." + domain),
    );
  } catch {
    return false;
  }
}

export async function uploadDriveMediaToR2(
  driveUrl: string,
  googleToken: string,
  mediaId: string,
  title: string,
  isImage: boolean,
  userId: string,
  supabase: any,
  allowedDomains: string[],
): Promise<string> {
  const ext = isImage ? ".jpg" : ".mp4";
  const contentType = isImage ? "image/jpeg" : "video/mp4";
  const baseName = (title || mediaId).replace(/\.(mp4|mov|jpg|jpeg|png)$/i, "");
  const { data: uploadData, error } = await supabase.functions.invoke<
    GetUploadUrlResponse
  >(
    "get-upload-url",
    {
      body: {
        fileName: `${baseName}${ext}`,
        fileType: contentType,
        userId,
      },
    },
  );

  if (error || !uploadData?.uploadUrl || !uploadData?.publicUrl) {
    throw new Error(error?.message || "Failed to get R2 upload URL");
  }

  if (!validateUrl(driveUrl, allowedDomains)) {
    throw new Error(`Blocked fetch to disallowed URL: ${driveUrl}`);
  }

  const driveRes = await fetch(driveUrl, {
    headers: { Authorization: `Bearer ${googleToken}` },
  });
  if (!driveRes.ok || !driveRes.body) {
    throw new Error(`Drive fetch failed: ${driveRes.status}`);
  }

  const putRes = await fetch(uploadData.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: driveRes.body,
    // @ts-ignore - duplex needed for streaming
    duplex: "half",
  });

  if (!putRes.ok) {
    throw new Error(`R2 upload failed: ${putRes.status}`);
  }

  return uploadData.publicUrl;
}
