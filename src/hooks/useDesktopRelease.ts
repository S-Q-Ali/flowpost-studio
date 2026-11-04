import { useEffect, useState } from "react";

import { fetchReleaseStatus, type ReleaseStatus } from "../lib/desktop-download";

/**
 * The newest Windows release, read from GitHub as the visitor's browser sees
 * it; null until GitHub answers.
 */
export function useDesktopRelease() {
  const [status, setStatus] = useState<ReleaseStatus | null>(null);

  useEffect(() => {
    let active = true;
    fetchReleaseStatus().then((result) => {
      if (active) setStatus(result);
    });
    return () => {
      active = false;
    };
  }, []);

  return status;
}
