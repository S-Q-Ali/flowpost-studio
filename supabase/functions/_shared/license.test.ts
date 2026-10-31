import { describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";
import {
  normalizeLicenseKey,
  hashLicenseKey,
  isLicenseUsable,
  MIN_LICENSE_KEY_LENGTH,
  MAX_LICENSE_KEY_LENGTH,
} from "./license.ts";

const subtle = (algorithm: string, data: BufferSource) =>
  webcrypto.subtle.digest(algorithm, data);
const now = new Date("2026-10-31T12:00:00.000Z");

describe("normalizeLicenseKey", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeLicenseKey("  flowpost-license-key-0001 \n")).toBe(
      "flowpost-license-key-0001",
    );
  });

  it("keeps inner characters exactly as typed", () => {
    expect(normalizeLicenseKey("FLOW-post-1234-5678")).toBe("FLOW-post-1234-5678");
  });

  it("rejects a key shorter than the minimum", () => {
    expect(normalizeLicenseKey("a".repeat(MIN_LICENSE_KEY_LENGTH - 1))).toBeNull();
  });

  it("accepts a key exactly at the minimum length", () => {
    const key = "a".repeat(MIN_LICENSE_KEY_LENGTH);
    expect(normalizeLicenseKey(key)).toBe(key);
  });

  it("accepts a key exactly at the maximum length", () => {
    const key = "a".repeat(MAX_LICENSE_KEY_LENGTH);
    expect(normalizeLicenseKey(key)).toBe(key);
  });

  it("rejects a key longer than the maximum", () => {
    expect(normalizeLicenseKey("a".repeat(MAX_LICENSE_KEY_LENGTH + 1))).toBeNull();
  });

  it("rejects blanks and non-strings", () => {
    expect(normalizeLicenseKey("   ")).toBeNull();
    expect(normalizeLicenseKey(null)).toBeNull();
    expect(normalizeLicenseKey(undefined)).toBeNull();
    expect(normalizeLicenseKey(42)).toBeNull();
  });
});

describe("hashLicenseKey", () => {
  it("returns the pinned lowercase SHA-256 hex of the key", async () => {
    await expect(hashLicenseKey("flowpost-license-key-0001", subtle)).resolves.toBe(
      "c41e0e8ec48ad6c8a3f0aa70fd35273b269f0947d81d22181a2a84516fcf774f",
    );
  });

  it("hashes different keys to different values", async () => {
    const first = await hashLicenseKey("flowpost-license-key-0001", subtle);
    const second = await hashLicenseKey("another-valid-license-key", subtle);
    expect(first).not.toBe(second);
    expect(second).toBe(
      "31089ff841b8902891b18c264c6235e407f8e0ef7ba5cff0e37760ee5a5cc295",
    );
  });

  it("is case-sensitive on the input", async () => {
    const upper = await hashLicenseKey("FLOWPOST-LICENSE-KEY-0001", subtle);
    const lower = await hashLicenseKey("flowpost-license-key-0001", subtle);
    expect(upper).not.toBe(lower);
  });

  it("uses the platform WebCrypto by default", async () => {
    await expect(hashLicenseKey("flowpost-license-key-0001")).resolves.toBe(
      "c41e0e8ec48ad6c8a3f0aa70fd35273b269f0947d81d22181a2a84516fcf774f",
    );
  });
});

describe("isLicenseUsable", () => {
  it("accepts an active license without an expiry", () => {
    expect(isLicenseUsable({ active: true, expires_at: null }, now)).toBe(true);
  });

  it("accepts an active license whose expiry is in the future", () => {
    expect(
      isLicenseUsable({ active: true, expires_at: "2026-11-30T00:00:00.000Z" }, now),
    ).toBe(true);
  });

  it("rejects an inactive license even when it has not expired", () => {
    expect(
      isLicenseUsable({ active: false, expires_at: "2099-01-01T00:00:00.000Z" }, now),
    ).toBe(false);
  });

  it("rejects a license whose expiry has passed", () => {
    expect(
      isLicenseUsable({ active: true, expires_at: "2026-10-30T00:00:00.000Z" }, now),
    ).toBe(false);
  });

  it("rejects a license expiring at exactly the current instant", () => {
    expect(isLicenseUsable({ active: true, expires_at: now.toISOString() }, now)).toBe(
      false,
    );
  });

  it("fails closed on an unparsable expiry", () => {
    expect(isLicenseUsable({ active: true, expires_at: "not-a-date" }, now)).toBe(false);
  });

  it("rejects a missing row or a row with no active flag", () => {
    expect(isLicenseUsable(null, now)).toBe(false);
    expect(isLicenseUsable({}, now)).toBe(false);
  });
});
