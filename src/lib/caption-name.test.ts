import { describe, expect, it } from "vitest";

import { filenameToCaption } from "./caption-name";

describe("filenameToCaption", () => {
  it("drops the extension and turns separators into spaces", () => {
    expect(filenameToCaption("my_video-2024.mp4")).toBe("my video 2024");
  });

  it("keeps a hashtag whole, separators inside it included", () => {
    expect(filenameToCaption("sunset #GoldenHour_edit.mp4")).toBe("sunset #GoldenHour_edit");
  });

  it("keeps more than one hashtag", () => {
    expect(filenameToCaption("#Travel_vlog with #Sunset.mp4")).toBe("#Travel_vlog with #Sunset");
  });

  it("collapses runs of spaces and trims the ends", () => {
    expect(filenameToCaption("  a___b   c  ")).toBe("a b c");
  });

  it("leaves a leading dot alone, because that name has no extension", () => {
    expect(filenameToCaption(".gitignore")).toBe(".gitignore");
  });

  it("returns null for a name that leaves nothing behind", () => {
    expect(filenameToCaption("")).toBeNull();
    expect(filenameToCaption("   ")).toBeNull();
    expect(filenameToCaption("___")).toBeNull();
  });
});
