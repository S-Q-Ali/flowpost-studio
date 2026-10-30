import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const chunkGroups: Record<string, string[]> = {
  vendor: ["react", "react-dom", "react-router-dom"],
  ui: [
    "@radix-ui/react-alert-dialog",
    "@radix-ui/react-avatar",
    "@radix-ui/react-checkbox",
    "@radix-ui/react-dialog",
    "@radix-ui/react-dropdown-menu",
    "@radix-ui/react-label",
    "@radix-ui/react-popover",
    "@radix-ui/react-radio-group",
    "@radix-ui/react-select",
    "@radix-ui/react-separator",
    "@radix-ui/react-slot",
    "@radix-ui/react-switch",
    "@radix-ui/react-tabs",
    "@radix-ui/react-toast",
    "@radix-ui/react-tooltip",
    "lucide-react",
    "next-themes",
    "sonner",
  ],
  supabase: ["@supabase/supabase-js"],
  charts: ["recharts"],
};

function manualChunks(id: string) {
  const pkg = Object.entries(chunkGroups).find(([, names]) =>
    names.some((name) => id.includes(`node_modules/${name}/`)),
  );
  return pkg?.[0];
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: { manualChunks },
    },
  },
}));
