const REPO_URL = "https://github.com/S-Q-Ali/flowpost-studio";

/**
 * The installer asset of the newest GitHub release.
 *
 * The release workflow (`.github/workflows/release-desktop.yml`) always names
 * it `FlowPostNativeSetup.exe`, so this is the one line to change when the
 * first release ships. While it is null the CTA points at the releases page,
 * which answers today.
 */
const INSTALLER_ASSET: string | null = null;

/** The link of the desktop download button. */
export function desktopDownloadUrl(
  asset: string | null = INSTALLER_ASSET,
): string {
  return asset
    ? `${REPO_URL}/releases/latest/download/${asset}`
    : `${REPO_URL}/releases`;
}
