/**
 * The rules an idempotency key has to follow.
 *
 * The key becomes part of the R2 object key, so anything that could change
 * the path is refused.
 */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** True when the key can be used as an object name. */
export function isValidIdempotencyKey(value: string): boolean {
  return IDEMPOTENCY_KEY_PATTERN.test(value);
}

/**
 * The extension of the uploaded file, taken from its name.
 *
 * The name comes from the request, so only a plain extension is kept: a
 * name like `a.mp4/../b` must not change the object key.
 */
export function uploadExtension(fileName: string): string {
  const parts = fileName.split(".");
  const extension = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
  return /^[a-z0-9]{1,10}$/.test(extension) ? extension : "bin";
}

/** The R2 object key of an upload: the user's folder, then the object. */
export function buildUploadObjectKey(
  userId: string,
  objectName: string,
  extension: string,
): string {
  return `${userId.replace(/[^A-Za-z0-9_-]/g, "")}/${objectName}.${extension}`;
}

/**
 * What the client may send to `upload-local-file`: the same kinds the desktop
 * accepts, and nothing the publisher cannot handle.
 */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

const ALLOWED_UPLOAD_TYPES = new Set([
  "video/mp4",
  "video/x-m4v",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type UploadCheck =
  | { ok: true }
  | { ok: false; status: 400 | 413 | 415; error: string };

/** Refuses an upload before R2 sees it: empty, too big, or the wrong kind. */
export function checkUpload(size: number, contentType: string | null): UploadCheck {
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, status: 400, error: "The file is empty" };
  }
  if (size > MAX_UPLOAD_BYTES) {
    const megabytes = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
    return { ok: false, status: 413, error: `File is too large (max ${megabytes} MB)` };
  }
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_UPLOAD_TYPES.has(type)) {
    return { ok: false, status: 415, error: "Unsupported file type" };
  }
  return { ok: true };
}
