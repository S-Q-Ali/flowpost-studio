import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FACEBOOK_GRAPH_BASE,
  INSTAGRAM_LOGIN_GRAPH_BASE,
  metaGraphBase,
} from "./meta-graph";

describe("metaGraphBase", () => {
  it("serves an Instagram Login token on Instagram's own host", () => {
    expect(metaGraphBase({ graph_host: "instagram" })).toBe(INSTAGRAM_LOGIN_GRAPH_BASE);
  });

  it("serves a page-linked account through the Facebook app", () => {
    expect(metaGraphBase({ graph_host: "facebook" })).toBe(FACEBOOK_GRAPH_BASE);
  });

  it("falls back to the Facebook app for a row saved before the host was written", () => {
    // facebook-auth wrote metadata without graph_host, and those accounts
    // publish today, so an absent host must not become an error.
    expect(metaGraphBase(null)).toBe(FACEBOOK_GRAPH_BASE);
    expect(metaGraphBase({ standalone: true })).toBe(FACEBOOK_GRAPH_BASE);
  });
});

describe("the Meta publishers", () => {
  it("ask this module for the host instead of naming a Graph version", () => {
    for (const functionName of ["instagram-upload", "facebook-upload", "post-story"]) {
      const source = readFileSync(
        join(import.meta.dirname, "..", functionName, "index.ts"),
        "utf8",
      );
      expect(source, `${functionName} names a Graph host`).not.toMatch(/graph(-video)?\.facebook\.com\/v/);
      expect(source, `${functionName} names a Graph host`).not.toContain("graph.instagram.com/v");
    }
  });
});
