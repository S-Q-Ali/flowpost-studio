import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("resolves Tailwind conflicts (last wins)", () => {
    expect(cn("px-4", "px-2")).toBe("px-2");
  });

  it("accepts array inputs", () => {
    expect(cn(["a", "b"], "c")).toBe("a b c");
  });

  it("accepts object inputs", () => {
    expect(cn({ foo: true, bar: false })).toBe("foo");
  });

  it("handles empty inputs", () => {
    expect(cn()).toBe("");
  });
});
