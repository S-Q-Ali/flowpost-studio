import { describe, it, expect } from "vitest";
import { isAllowedDriveUrl, resolveAllowedRedirect } from "./url-guard";

const APP = "https://flowpost-studio.vercel.app";
const ORIGINS = [APP, "http://localhost:5173"];

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
