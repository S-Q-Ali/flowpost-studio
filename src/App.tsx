import { lazy, Suspense, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";

const PipelineLandingPage = lazy(() => import("./pages/PipelineLandingPage"));
const ConnectDonePage = lazy(() => import("./pages/ConnectDonePage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const WebAppShutdownPage = lazy(() => import("./pages/WebAppShutdownPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const RETIRED_WEB_PATHS = [
  "/login",
  "/auth/callback",
  "/security-questions",
  "/dashboard",
  "/upload",
  "/workflows",
  "/workflows/:id/items",
  "/calendar",
  "/queue",
  "/accounts",
  "/storage",
  "/insights",
  "/tools",
  "/profile",
];

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

function renderLazy(node: ReactNode) {
  return <Suspense fallback={<PageLoader />}>{node}</Suspense>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={renderLazy(<PipelineLandingPage />)} />
      <Route path="/pipeline" element={<Navigate to="/" replace />} />
      <Route path="/connect-done" element={renderLazy(<ConnectDonePage />)} />
      <Route path="/terms" element={renderLazy(<TermsPage />)} />
      <Route path="/privacy" element={renderLazy(<PrivacyPage />)} />
      {RETIRED_WEB_PATHS.map((path) => (
        <Route
          key={path}
          path={path}
          element={renderLazy(<WebAppShutdownPage />)}
        />
      ))}
      <Route path="*" element={renderLazy(<NotFound />)} />
    </Routes>
  );
}

const App = () => {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ErrorBoundary>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ErrorBoundary>
      </TooltipProvider>
    </ThemeProvider>
  );
};

export default App;
