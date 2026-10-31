import { describe, expect, it } from "vitest";

import { desktopDownloadUrl } from "./desktop-download";

describe("desktopDownloadUrl", () => {
  it("points at the releases page while no release is published", () => {
    expect(desktopDownloadUrl(null)).toBe(
      "https://github.com/S-Q-Ali/flowpost-studio/releases",
    );
  });

  it("points straight at the installer of the newest release", () => {
    expect(desktopDownloadUrl("FlowPostNativeSetup.exe")).toBe(
      "https://github.com/S-Q-Ali/flowpost-studio/releases/latest/download/FlowPostNativeSetup.exe",
    );
  });

  it("asks for an installer until the first release ships", () => {
    expect(desktopDownloadUrl()).toBe(desktopDownloadUrl(null));
  });
});
