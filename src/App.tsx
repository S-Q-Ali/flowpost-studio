import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SecurityQuestionsGate } from "@/components/SecurityQuestionsGate";
import LoginPage from "./pages/LoginPage";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard";
import UploadPage from "./pages/UploadPage";
import WorkflowsPage from "./pages/WorkflowsPage";
import CalendarPage from "./pages/CalendarPage";
import QueuePage from "./pages/QueuePage";
import AccountsPage from "./pages/AccountsPage";
import StoragePage from "./pages/StoragePage";
import InsightsPage from "./pages/InsightsPage";
import ProfilePage from "./pages/ProfilePage";
import NotFound from "./pages/NotFound";
import AuthCallback from "./pages/AuthCallback";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";

const queryClient = new QueryClient();

const PUBLIC_PATHS = new Set(["/terms", "/privacy", "/auth/callback"]);

function RootRedirect() {
  const saved = localStorage.getItem("redirectPath");
  if (saved) {
    localStorage.removeItem("redirectPath");
    return <Navigate to={saved} replace />;
  }
  return <Navigate to="/dashboard" replace />;
}

function RequireVerified() {
  const { isAuthenticated, pendingSecurityVerification } = useAuth();
  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (pendingSecurityVerification) return <Navigate to="/security-questions" replace />;
  return <Outlet />;
}

function AppRoutes() {
  const { isAuthenticated, isVerifying, pendingSecurityVerification } = useAuth();
  const location = useLocation();
  const isPublicRoute = PUBLIC_PATHS.has(location.pathname);

  if (isVerifying) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 bg-background text-foreground"
      >
        <Logo size="lg" />
         <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 size={18} className="animate-spin" />
          Verifying...
        </p>
      </div>
    );
  }

  if (!isAuthenticated && !isPublicRoute) {
    localStorage.setItem("redirectPath", location.pathname + location.search);
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/security-questions" element={<SecurityQuestionsGate />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route element={<RequireVerified />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/workflows" element={<WorkflowsPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/queue" element={<QueuePage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/storage" element={<StoragePage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
