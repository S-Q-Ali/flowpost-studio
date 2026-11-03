import { describe, it, expect, afterEach } from "vitest";
import {
  isAllowedDriveUrl,
  isAllowedMediaUrl,
  isGoogleApiUrl,
  resolveAllowedRedirect,
} from "./url-guard";

const APP = "https://flowpost-studio.vercel.app";
const ORIGINS = [APP, "http://localhost:5173"];

/** The edge runtime's environment, supplied the way the functions read it. */
function useRuntimeEnv(values: Record<string, string>): void {
  (globalThis as Record<string, unknown>).Deno = { env: { get: (name: string) => values[name] } };
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).Deno;
});

describe("resolveAllowedRedirect", () => {
  it("accepts a path under the app origin", () => {
    expect(resolveAllowedRedirect("/dashboard?x=1", APP, ORIGINS)?.toString()).toBe(
      `${APP}/dashboard?x=1`,
    );
  });

  it("accepts an absolute URL on an allowed origin", () => {
    expect(resolveAllowedRedirect(`${APP}/dashboard`, APP, ORIGINS)?.toString()).toBe(
      `${APP}/dashboard`,
    );
  });

  it("refuses a protocol-relative host", () => {
    expect(resolveAllowedRedirect("//evil.com", APP, ORIGINS)).toBeNull();
    expect(resolveAllowedRedirect("/\\evil.com", APP, ORIGINS)).toBeNull();
  });

  it("refuses another origin or scheme", () => {
    expect(resolveAllowedRedirect("https://evil.com/x", APP, ORIGINS)).toBeNull();
    expect(resolveAllowedRedirect("javascript:alert(1)", APP, ORIGINS)).toBeNull();
  });
});

describe("isGoogleApiUrl", () => {
  it("accepts the API host and its subdomains", () => {
    expect(isGoogleApiUrl("https://www.googleapis.com/drive/v3/files/abc?alt=media")).toBe(true);
    expect(isGoogleApiUrl("https://googleapis.com/")).toBe(true);
  });

  it("refuses another host that merely contains the name", () => {
    expect(isGoogleApiUrl("https://evil.com/?next=googleapis.com")).toBe(false);
    expect(isGoogleApiUrl("https://googleapis.com.evil.com/x")).toBe(false);
    expect(isGoogleApiUrl("https://evilgoogleapis.com/x")).toBe(false);
  });
});

describe("isAllowedDriveUrl", () => {
  it("accepts Google's file hosts", () => {
    expect(
      isAllowedDriveUrl("https://www.googleapis.com/drive/v3/files/abc?alt=media"),
    ).toBe(true);
  });

  it("refuses the cloud metadata address and other hosts", () => {
    expect(isAllowedDriveUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isAllowedDriveUrl("https://www.googleapis.com.evil.com/x")).toBe(false);
    expect(isAllowedDriveUrl("http://www.googleapis.com/drive/v3/files/abc")).toBe(false);
  });
});

describe("isAllowedMediaUrl", () => {
  const ENV = {
    SUPABASE_URL: "https://ximorwzknbizpceaoflw.supabase.co",
    R2_PUBLIC_URL: "pub-abc123.r2.dev",
  };

  it("accepts the hosts a publisher streams media from", () => {
    useRuntimeEnv(ENV);
    for (const url of [
      "https://www.googleapis.com/drive/v3/files/abc?alt=media",
      "https://drive.google.com/uc?id=abc",
      "https://storage.googleapis.com/bucket/clip.mp4",
      "https://mega.nz/file/abc",
      "https://pub-abc123.r2.dev/user/clip.mp4",
      "https://ximorwzknbizpceaoflw.supabase.co/functions/v1/get-file?token=sealed",
    ]) {
      expect(isAllowedMediaUrl(url), url).toBe(true);
    }
  });

  it("accepts an R2 host configured with its scheme", () => {
    useRuntimeEnv({ ...ENV, R2_PUBLIC_URL: "https://pub-abc123.r2.dev" });
    expect(isAllowedMediaUrl("https://pub-abc123.r2.dev/user/clip.mp4")).toBe(true);
  });

  it("refuses a host that merely ends with an allowed name", () => {
    useRuntimeEnv(ENV);
    expect(isAllowedMediaUrl("https://www.googleapis.com.evil.com/clip.mp4")).toBe(false);
    expect(isAllowedMediaUrl("https://r2.dev/clip.mp4")).toBe(false);
    expect(isAllowedMediaUrl("https://supabase.co.evil.com/clip.mp4")).toBe(false);
  });

  it("refuses plain HTTP, the metadata address, and a host with no configured media", () => {
    useRuntimeEnv(ENV);
    expect(isAllowedMediaUrl("http://pub-abc123.r2.dev/clip.mp4")).toBe(false);
    expect(isAllowedMediaUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isAllowedMediaUrl("https://evil.com/clip.mp4")).toBe(false);
    expect(isAllowedMediaUrl("not a url")).toBe(false);
    useRuntimeEnv({ SUPABASE_URL: "", R2_PUBLIC_URL: "" });
    expect(isAllowedMediaUrl("https://pub-abc123.r2.dev/user/clip.mp4")).toBe(false);
  });
});
