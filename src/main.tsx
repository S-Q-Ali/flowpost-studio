// Detect desktop mode
Object.defineProperty(window, "__isDesktop", {
  value: typeof (window as any).process?.versions?.electron === "boolean" ||
         typeof (window as any).process?.versions?.tauri === "boolean",
  writable: false,
  enumerable: false,
  configurable: false,
});

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
