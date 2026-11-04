import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ReleaseDownloads } from "./ReleaseDownloads";
import type { ReleaseStatus } from "../lib/desktop-download";

afterEach(cleanup);

const ready: ReleaseStatus = {
  state: "ready",
  version: "1.2.0",
  publishedAt: "2026-11-05T10:00:00Z",
  files: {
    installer: {
      name: "FlowPostNativeSetup.exe",
      url: "https://github.com/S-Q-Ali/flowpost-studio/releases/download/desktop-v1.2.0/FlowPostNativeSetup.exe",
      sizeBytes: 63000000,
      sha256: "d92e53987acd10ef0572f9aeeb2365f7b39e263d3589d14263069539f73a89e0",
    },
    portable: {
      name: "FlowPost-portable.zip",
      url: "https://github.com/S-Q-Ali/flowpost-studio/releases/download/desktop-v1.2.0/FlowPost-portable.zip",
      sizeBytes: 84830000,
      sha256: "",
    },
  },
};

describe("ReleaseDownloads", () => {
  it("links both published files with their sizes", () => {
    const { getByRole, getByText } = render(<ReleaseDownloads status={ready} />);

    expect(getByRole("link", { name: "Download FlowPostNativeSetup.exe" }).getAttribute("href")).toBe(
      ready.files.installer.url,
    );
    expect(getByRole("link", { name: "Download FlowPost-portable.zip" })).toBeTruthy();
    getByText(/60\.1 MB/);
    getByText(/80\.9 MB/);
  });

  it("names the version and its publish date", () => {
    const { getByText } = render(<ReleaseDownloads status={ready} />);
    getByText(/Version 1\.2\.0/);
  });

  it("only offers to copy a checksum the release actually carries", () => {
    const { getByTitle, queryByTitle } = render(<ReleaseDownloads status={ready} />);
    expect(getByTitle(/FlowPostNativeSetup\.exe$/)).toBeTruthy();
    expect(queryByTitle(/FlowPost-portable\.zip$/)).toBeNull();
  });

  it("announces a busy panel while GitHub has not answered", () => {
    const { getByRole } = render(<ReleaseDownloads status={null} />);
    expect(getByRole("status", { name: "Loading the release" })).toBeTruthy();
  });

  it("says so when nothing is published and sends the visitor to the releases page", () => {
    const { getByRole, getByText } = render(<ReleaseDownloads status={{ state: "no-release" }} />);

    getByText("No Windows build is published yet.");
    expect(getByRole("link", { name: "Open releases" }).getAttribute("href")).toBe(
      "https://github.com/S-Q-Ali/flowpost-studio/releases",
    );
  });

  it("says the release list could not be reached rather than that it is empty", () => {
    const { getByText } = render(<ReleaseDownloads status={{ state: "unreachable" }} />);
    getByText("The release list could not be reached.");
  });
});
