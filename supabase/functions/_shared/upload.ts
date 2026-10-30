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
