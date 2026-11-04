import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  RELEASE_ASSETS,
  desktopDownloadUrl,
  downloadButtonHref,
  fetchReleaseStatus,
  formatBytes,
  latestReleaseDownloadUrl,
  type ReleaseStatus,
} from "./desktop-download";

const REPO = "https://github.com/S-Q-Ali/flowpost-studio";

describe("latestReleaseDownloadUrl", () => {
  it("points straight at an asset of the newest release", () => {
    expect(latestReleaseDownloadUrl("FlowPostNativeSetup.exe")).toBe(
      `${REPO}/releases/latest/download/FlowPostNativeSetup.exe`,
    );
  });
});

describe("RELEASE_ASSETS", () => {
  it("names every file the release workflow uploads", () => {
    // A renamed asset in .github/workflows/release-desktop.yml breaks the
    // website's download buttons, so the names are pinned here.
    expect(RELEASE_ASSETS).toEqual({
      installer: "FlowPostNativeSetup.exe",
      portable: "FlowPost-portable.zip",
      installerChecksum: "FlowPostNativeSetup.exe.sha256",
      portableChecksum: "FlowPost-portable.zip.sha256",
    });
  });

  it("keeps every checksum paired with its own file", () => {
    expect(`${RELEASE_ASSETS.installer}.sha256`).toBe(
      RELEASE_ASSETS.installerChecksum,
    );
    expect(`${RELEASE_ASSETS.portable}.sha256`).toBe(
      RELEASE_ASSETS.portableChecksum,
    );
  });
});

describe("desktopDownloadUrl", () => {
  it("points straight at the installer of the newest release", () => {
    expect(desktopDownloadUrl()).toBe(
      `${REPO}/releases/latest/download/FlowPostNativeSetup.exe`,
    );
  });

  it("falls back to the releases page for an asset-less release", () => {
    expect(desktopDownloadUrl(null)).toBe(`${REPO}/releases`);
  });
});

function response(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function releaseBody(assets: unknown[]) {
  return {
    tag_name: "desktop-v1.2.0",
    published_at: "2026-11-05T10:00:00Z",
    assets,
  };
}

function asset(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    size: 63000000,
    browser_download_url: `${REPO}/releases/download/desktop-v1.2.0/${name}`,
    ...overrides,
  };
}

const BOTH_ASSETS = [
  asset(RELEASE_ASSETS.installer, { digest: "sha256:aaa" }),
  asset(RELEASE_ASSETS.portable, { digest: "sha256:bbb" }),
  asset(RELEASE_ASSETS.installerChecksum),
  asset(RELEASE_ASSETS.portableChecksum),
];

describe("fetchReleaseStatus", () => {
  it("reports the files of a published release with their checksums", async () => {
    const status = await fetchReleaseStatus(async () => response(200, releaseBody(BOTH_ASSETS)));

    expect(status).toEqual({
      state: "ready",
      version: "1.2.0",
      publishedAt: "2026-11-05T10:00:00Z",
      files: {
        installer: {
          name: RELEASE_ASSETS.installer,
          url: `${REPO}/releases/download/desktop-v1.2.0/${RELEASE_ASSETS.installer}`,
          sizeBytes: 63000000,
          sha256: "aaa",
        },
        portable: {
          name: RELEASE_ASSETS.portable,
          url: `${REPO}/releases/download/desktop-v1.2.0/${RELEASE_ASSETS.portable}`,
          sizeBytes: 63000000,
          sha256: "bbb",
        },
      },
    });
  });

  it("leaves the checksum empty when the release carries no digest", async () => {
    const status = await fetchReleaseStatus(
      async () =>
        response(
          200,
          releaseBody([
            asset(RELEASE_ASSETS.installer),
            asset(RELEASE_ASSETS.portable),
          ]),
        ),
    );

    if (status.state !== "ready") throw new Error("expected a ready release");
    expect(status.files.installer.sha256).toBe("");
  });

  it("reports no release while the newest tag is missing", async () => {
    expect(
      await fetchReleaseStatus(async () => response(404, { message: "Not Found" })),
    ).toEqual({ state: "no-release" });
  });

  it("reports no release when the newest tag has no download attached", async () => {
    const status = await fetchReleaseStatus(
      async () => response(200, releaseBody([asset("source-code.zip")])),
    );

    expect(status).toEqual({ state: "no-release" });
  });

  it("reports the release as unreachable when GitHub cannot be read", async () => {
    expect(
      await fetchReleaseStatus(async () => {
        throw new TypeError("Failed to fetch");
      }),
    ).toEqual({ state: "unreachable" });

    expect(
      await fetchReleaseStatus(async () => response(500, { message: "Server Error" })),
    ).toEqual({ state: "unreachable" });
  });
});

describe("downloadButtonHref", () => {
  const published: ReleaseStatus = {
    state: "ready",
    version: "1.2.0",
    publishedAt: "2026-11-05T10:00:00Z",
    files: {
      installer: {
        name: RELEASE_ASSETS.installer,
        url: `${REPO}/releases/download/desktop-v1.2.0/${RELEASE_ASSETS.installer}`,
        sizeBytes: 1,
        sha256: "",
      },
      portable: {
        name: RELEASE_ASSETS.portable,
        url: `${REPO}/releases/download/desktop-v1.2.0/${RELEASE_ASSETS.portable}`,
        sizeBytes: 1,
        sha256: "",
      },
    },
  };

  it("sends the button straight to the installer once a release is published", () => {
    expect(downloadButtonHref(published)).toBe(published.files.installer.url);
  });

  it("sends the button to the download panel while the release is unknown", () => {
    expect(downloadButtonHref(null)).toBe("#download");
    expect(downloadButtonHref({ state: "no-release" })).toBe("#download");
    expect(downloadButtonHref({ state: "unreachable" })).toBe("#download");
  });
});

describe("the deployed Content-Security-Policy", () => {
  it("lets the page ask GitHub about the newest release", () => {
    // A blocked fetch is silent: the panel just falls back to "could not be
    // reached", so the host the download system reads belongs in the CSP.
    // jsdom gives this module an http import.meta.url, so read from the run root.
    const policy = JSON.parse(
      readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
    ).headers[0].headers.find((header: { key: string }) => header.key === "Content-Security-Policy")
      .value as string;
    const connectSrc = /connect-src([^;]*)/.exec(policy)?.[1] ?? "";

    expect(connectSrc).toContain("https://api.github.com");
  });
});

describe("formatBytes", () => {
  it("shows megabytes once a file passes a megabyte", () => {
    expect(formatBytes(63000000)).toBe("60.1 MB");
    expect(formatBytes(1536 * 1024)).toBe("1.5 MB");
  });

  it("shows kilobytes below that", () => {
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1023)).toBe("1023 B");
  });
});

