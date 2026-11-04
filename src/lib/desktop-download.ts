const REPO_URL = "https://github.com/S-Q-Ali/flowpost-studio";

/**
 * The files `.github/workflows/release-desktop.yml` attaches to a release.
 *
 * The names are fixed (no version in them) so a download link written once
 * keeps pointing at the newest release; the workflow publishes them under
 * exactly these names, and `src/lib/desktop-download.test.ts` pins them.
 */
export const RELEASE_ASSETS = {
  installer: "FlowPostNativeSetup.exe",
  portable: "FlowPost-portable.zip",
  installerChecksum: "FlowPostNativeSetup.exe.sha256",
  portableChecksum: "FlowPost-portable.zip.sha256",
} as const;

/** A named asset of the newest release, or the releases page for `null`. */
export function latestReleaseDownloadUrl(asset: string | null): string {
  return asset ? `${REPO_URL}/releases/latest/download/${asset}` : `${REPO_URL}/releases`;
}

/** The link of the primary "Download for Windows" button. */
export function desktopDownloadUrl(
  asset: string | null = RELEASE_ASSETS.installer,
): string {
  return latestReleaseDownloadUrl(asset);
}

/** The newest non-draft release, read as the visitor's browser sees it. */
export type ReleaseFile = {
  name: string;
  url: string;
  sizeBytes: number;
  /** Lowercase hex, or "" when GitHub carries no digest for the asset. */
  sha256: string;
};

export type ReleaseStatus =
  | {
      state: "ready";
      version: string;
      publishedAt: string;
      files: { installer: ReleaseFile; portable: ReleaseFile };
    }
  /** Nothing to hand out: no release tag, or a tag without its files. */
  | { state: "no-release" }
  /** GitHub did not answer, so the page cannot tell either way. */
  | { state: "unreachable" };

/** The part of `fetch` this reads, so a test can answer for GitHub. */
type JsonResponder = (input: string) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

const LATEST_RELEASE_API =
  "https://api.github.com/repos/S-Q-Ali/flowpost-studio/releases/latest";

export async function fetchReleaseStatus(
  respond: JsonResponder = async (input) => {
    // Keep the Response and call json() on it: taking the method out of the
    // object loses its receiver, and a browser then throws.
    const response = await fetch(input);
    return {
      ok: response.ok,
      status: response.status,
      json: () => response.json(),
    };
  },
): Promise<ReleaseStatus> {
  let response;
  try {
    response = await respond(LATEST_RELEASE_API);
  } catch {
    return { state: "unreachable" };
  }
  if (response.status === 404) return { state: "no-release" };
  if (!response.ok) return { state: "unreachable" };

  // A body that is not the JSON GitHub sends (a proxy page, a truncated
  // reply) is not a statement about the release, so say nothing either way.
  let release: unknown;
  try {
    release = await response.json();
  } catch {
    return { state: "unreachable" };
  }
  const files = releaseDownloadFiles(release);
  if (!files) return { state: "no-release" };
  return {
    state: "ready",
    version: String((release as { tag_name?: string }).tag_name ?? "").replace(/^desktop-v/, ""),
    publishedAt: String((release as { published_at?: string }).published_at ?? ""),
    files,
  };
}

type DownloadPair = { installer: ReleaseFile; portable: ReleaseFile };

function releaseDownloadFiles(release: unknown): DownloadPair | null {
  const assets = (release as { assets?: unknown })?.assets;
  if (!Array.isArray(assets)) return null;
  const find = (name: string) => {
    const asset = assets.find((entry) => (entry as { name?: string }).name === name) as
      | { name: string; browser_download_url: string; size: number; digest?: string | null }
      | undefined;
    if (!asset?.browser_download_url) return null;
    return {
      name: asset.name,
      url: asset.browser_download_url,
      sizeBytes: Number(asset.size) || 0,
      sha256: (asset.digest ?? "").replace(/^sha256:/, "").toLowerCase(),
    };
  };
  const installer = find(RELEASE_ASSETS.installer);
  const portable = find(RELEASE_ASSETS.portable);
  return installer && portable ? { installer, portable } : null;
}

/**
 * The href of a "Download for Windows" button.
 *
 * A published release sends the visitor straight at the installer. Until the
 * state is known, the button walks them to the panel that explains it rather
 * than to a link that may 404.
 */
export function downloadButtonHref(status: ReleaseStatus | null): string {
  return status?.state === "ready" ? status.files.installer.url : "#download";
}

/** A file size a visitor compares against the download they are about to take. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${round(kilobytes)} KB`;
  return `${round(kilobytes / 1024)} MB`;
}

function round(value: number): string {
  return String(Math.round(value * 10) / 10);
}

export { REPO_URL };
