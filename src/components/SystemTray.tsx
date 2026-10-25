import { useEffect, useState } from "react";

export function SystemTray() {
  const [isTrayAvailable, setIsTrayAvailable] = useState(false);

  useEffect(() => {
    // Detect desktop context via Pake/Tauri injection
    setIsTrayAvailable(!!window.__isDesktop);
  }, []);

  // Handle minimize to tray
  useEffect(() => {
    if (!isTrayAvailable) return;

    const handleWindowClose = (e: Event) => {
      e.preventDefault();
      window.hide(); // Hide to tray instead of closing
    };

    window.addEventListener("beforeunload", handleWindowClose);
    return () => window.removeEventListener("beforeunload", handleWindowClose);
  }, [isTrayAvailable]);

  return null;
}
