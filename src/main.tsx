// Detect desktop mode (Pake wrapper)
Object.defineProperty(window, "__isDesktop", {
  value: typeof (window as any).process?.versions?.electron === "boolean" ||
         typeof (window as any).process?.versions?.tauri === "boolean" ||
         // Pake desktop detection
         !!document.querySelector('iframe[src^="https://flowpost-studio.vercel.app"]') ||
         window.location.href.includes("flowpost-studio.vercel.app"),
  writable: false,
  enumerable: false,
  configurable: false,
});

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
