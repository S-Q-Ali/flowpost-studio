import { describe, expect, it } from "vitest";
import { resolveSupabaseConfig } from "./config";

describe("resolveSupabaseConfig", () => {
  it("uses the values when both are present", () => {
    const config = resolveSupabaseConfig("https://demo.supabase.co", "anon-key");

    expect(config).toEqual({
      url: "https://demo.supabase.co",
      key: "anon-key",
      configured: true,
    });
  });

  it("stays unconfigured when a value is missing or blank", () => {
    for (const [url, key] of [
      [undefined, "anon-key"],
      ["https://demo.supabase.co", undefined],
      ["", ""],
      ["  ", "  "],
    ] as const) {
      const config = resolveSupabaseConfig(url, key);

      expect(config.configured).toBe(false);
      // The client must still construct, so the public pages render.
      expect(() => new URL(config.url)).not.toThrow();
      expect(config.key).not.toBe("");
    }
  });
});
