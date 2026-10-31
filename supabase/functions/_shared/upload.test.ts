import { describe, it, expect } from "vitest";
import {
  checkUpload,
  isValidIdempotencyKey,
  uploadExtension,
  buildUploadObjectKey,
  MAX_UPLOAD_BYTES,
} from "./upload";

describe("isValidIdempotencyKey", () => {
  it("accepts a job id", () => {
    expect(isValidIdempotencyKey("20261029T084512-a9dd11")).toBe(true);
  });

  it("refuses a key that could change the object path", () => {
    expect(isValidIdempotencyKey("a/b")).toBe(false);
    expect(isValidIdempotencyKey("../other")).toBe(false);
    expect(isValidIdempotencyKey("..")).toBe(false);
    expect(isValidIdempotencyKey("a b")).toBe(false);
    expect(isValidIdempotencyKey("a.mp4")).toBe(false);
    expect(isValidIdempotencyKey("")).toBe(false);
  });

  it("refuses a key that is too long", () => {
    expect(isValidIdempotencyKey("a".repeat(129))).toBe(false);
    expect(isValidIdempotencyKey("a".repeat(128))).toBe(true);
  });
});

describe("uploadExtension", () => {
  it("keeps a plain extension", () => {
    expect(uploadExtension("clip.mp4")).toBe("mp4");
    expect(uploadExtension("PHOTO.JPG")).toBe("jpg");
  });

  it("falls back to bin when the name has no usable extension", () => {
    expect(uploadExtension("clip")).toBe("bin");
    expect(uploadExtension("clip.")).toBe("bin");
    expect(uploadExtension("")).toBe("bin");
  });

  it("refuses an extension that could change the object path", () => {
    expect(uploadExtension("a.mp4/../b")).toBe("bin");
    expect(uploadExtension("clip.mp4/../../other")).toBe("bin");
    expect(uploadExtension("clip.m p4")).toBe("bin");
  });
});

describe("buildUploadObjectKey", () => {
  it("puts the object under the user", () => {
    expect(buildUploadObjectKey("user-1", "abc123", "mp4")).toBe("user-1/abc123.mp4");
  });

  it("keeps the user folder clean", () => {
    expect(buildUploadObjectKey("user/../other", "abc123", "mp4")).toBe("userother/abc123.mp4");
  });
});

describe("checkUpload", () => {
  it("rejects a file over the cap", () => {
    expect(MAX_UPLOAD_BYTES).toBe(200 * 1024 * 1024);
    expect(checkUpload(MAX_UPLOAD_BYTES, "video/mp4")).toEqual({ ok: true });
    const result = checkUpload(MAX_UPLOAD_BYTES + 1, "video/mp4");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.status).toBe(413);
  });

  it("rejects a content type outside the allowlist", () => {
    expect(checkUpload(1024, "image/png")).toEqual({ ok: true });
    expect(checkUpload(1024, "image/webp")).toEqual({ ok: true });
    expect(checkUpload(1024, "video/quicktime")).toEqual({ ok: true });
    const result = checkUpload(1024, "text/html");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.status).toBe(415);
  });

  it("rejects an empty file", () => {
    const result = checkUpload(0, "image/png");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.status).toBe(400);
  });
});
