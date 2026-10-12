import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { getCurrentWindow, minimizeToTray, restoreFromTray } from "./preload";

getCurrentWindow().then((window) => {
  // Minimize to system tray on close (Windows taskbar fallback)
  window.onclose(() => {
    minimizeToTray();
  });

  // Restore from tray on double-click
  window.ondoubleclick(() => {
    restoreFromTray();
  });
}).catch((err) => {
  console.error("Failed to get Tauri window:", err);
});

createRoot(document.getElementById("root")!).render(<App />);
