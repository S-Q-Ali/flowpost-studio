import { describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";
import {
  normalizeLicenseKey,
  hashLicenseKey,
  isLicenseUsable,
  MIN_LICENSE_KEY_LENGTH,
  MIN_LICENSE_PEPPER_LENGTH,
  MAX_LICENSE_KEY_LENGTH,
} from "./license.ts";

const subtle = webcrypto.subtle;
const now = new Date("2026-10-31T12:00:00.000Z");
const pepper = "test-pepper-0123456789abcdef";
const otherPepper = "second-pepper-0123456789abcdef";

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
  it("returns the pinned lowercase HMAC-SHA-256 hex of the key under the pepper", async () => {
    await expect(
      hashLicenseKey("flowpost-license-key-0001", pepper, subtle),
    ).resolves.toBe("78a95184e4a96481cae7ff5149a80d4aaf38c2b0e14a1e85a8cae342981c2dbb");
  });

  it("is deterministic, so one key still finds exactly one row", async () => {
    const first = await hashLicenseKey("flowpost-license-key-0001", pepper, subtle);
    const again = await hashLicenseKey("flowpost-license-key-0001", pepper, subtle);
    expect(again).toBe(first);
  });

  it("changes the value when the pepper changes", async () => {
    const one = await hashLicenseKey("flowpost-license-key-0001", pepper, subtle);
    const two = await hashLicenseKey("flowpost-license-key-0001", otherPepper, subtle);
    expect(one).toBe("78a95184e4a96481cae7ff5149a80d4aaf38c2b0e14a1e85a8cae342981c2dbb");
    expect(two).toBe("9816eb709118cc81a0383f3e13b8d38a64e3b9d4bee2bf3c78a75bdd2cba1824");
  });

  it("hashes different keys to different values", async () => {
    const first = await hashLicenseKey("flowpost-license-key-0001", pepper, subtle);
    const second = await hashLicenseKey("another-valid-license-key", pepper, subtle);
    expect(first).not.toBe(second);
    expect(second).toBe("c5f5ea31639441749982edfc50d8b8c67d269fd882e418245d0ce4493d2a226e");
  });

  it("is case-sensitive on the key", async () => {
    const upper = await hashLicenseKey("FLOWPOST-LICENSE-KEY-0001", pepper, subtle);
    const lower = await hashLicenseKey("flowpost-license-key-0001", pepper, subtle);
    expect(upper).not.toBe(lower);
  });

  it("refuses a blank pepper rather than hashing an unsalted key", async () => {
    await expect(hashLicenseKey("flowpost-license-key-0001", "", subtle)).rejects.toThrow(
      /pepper/,
    );
  });

  it("refuses a pepper shorter than the minimum", async () => {
    const short = "a".repeat(MIN_LICENSE_PEPPER_LENGTH - 1);
    await expect(hashLicenseKey("flowpost-license-key-0001", short, subtle)).rejects.toThrow(
      /pepper/,
    );
  });

  it("uses the platform WebCrypto by default", async () => {
    await expect(hashLicenseKey("flowpost-license-key-0001", pepper)).resolves.toBe(
      "78a95184e4a96481cae7ff5149a80d4aaf38c2b0e14a1e85a8cae342981c2dbb",
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
