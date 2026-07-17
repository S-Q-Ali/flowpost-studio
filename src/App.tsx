import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SecurityQuestionsGate } from "@/components/SecurityQuestionsGate";
import LoginPage from "./pages/LoginPage";
import { AppLayout } from "@/components/AppLayout";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const UploadPage = lazy(() => import("./pages/UploadPage"));
const WorkflowsPage = lazy(() => import("./pages/WorkflowsPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const QueuePage = lazy(() => import("./pages/QueuePage"));
const WorkflowItemsPage = lazy(() => import("./pages/WorkflowItemsPage"));
const AccountsPage = lazy(() => import("./pages/AccountsPage"));
const StoragePage = lazy(() => import("./pages/StoragePage"));
const InsightsPage = lazy(() => import("./pages/InsightsPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));

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
      <Route path="/auth/callback" element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}><AuthCallback /></Suspense>} />
      <Route path="/terms" element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}><TermsPage /></Suspense>} />
      <Route path="/privacy" element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}><PrivacyPage /></Suspense>} />
      <Route element={<RequireVerified />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}><Dashboard /></Suspense>} />
          <Route path="/upload" element={<Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}><UploadPage /></Suspense>} />
          <Route path="/workflows" element={<Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}><WorkflowsPage /></Suspense>} />
          <Route path="/workflows/:id/items" element={<Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}><WorkflowItemsPage /></Suspense>} />
          <Route path="/calendar" element={<Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}><CalendarPage /></Suspense>} />
          <Route path="/queue" element={<Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}><QueuePage /></Suspense>} />
          <Route path="/accounts" element={<Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}><AccountsPage /></Suspense>} />
          <Route path="/storage" element={<Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}><StoragePage /></Suspense>} />
          <Route path="/insights" element={<Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}><InsightsPage /></Suspense>} />
          <Route path="/profile" element={<Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}><ProfilePage /></Suspense>} />
        </Route>
      </Route>
      <Route path="*" element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}><NotFound /></Suspense>} />
    </Routes>
  );
}

const App = () => (
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
);

export default App;
