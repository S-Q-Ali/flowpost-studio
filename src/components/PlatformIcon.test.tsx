import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PlatformBadge, PlatformIcon } from "./PlatformIcon";
import type { Platform } from "@/lib/types";

const platforms: Platform[] = ["facebook", "instagram", "youtube", "tiktok", "linkedin"];

describe("PlatformIcon", () => {
  it.each(platforms)("renders a labelled mark for %s", (platform) => {
    const { getByRole, unmount } = render(<PlatformIcon platform={platform} size={16} />);
    const mark = getByRole("img");
    expect(mark.tagName.toLowerCase()).toBe("svg");
    expect(mark.getAttribute("width")).toBe("16");
    unmount();
  });

  it("keeps the platform name next to the badge mark", () => {
    const { getByText } = render(<PlatformBadge platform="youtube" />);
    expect(getByText("YouTube")).toBeTruthy();
    cleanup();
  });
});
