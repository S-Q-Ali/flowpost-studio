import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PasswordGate } from "@/components/PasswordGate";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard";
import UploadPage from "./pages/UploadPage";
import WorkflowsPage from "./pages/WorkflowsPage";
import CalendarPage from "./pages/CalendarPage";
import QueuePage from "./pages/QueuePage";
import AccountsPage from "./pages/AccountsPage";
import NotFound from "./pages/NotFound";
import AuthCallback from "./pages/AuthCallback";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";

const queryClient = new QueryClient();

function AppRoutes() {
  const { isAuthenticated, isVerifying, login } = useAuth();

  if (isVerifying) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-6 p-6"
        style={{ backgroundColor: "#0F0F0F" }}
      >
        <Logo size="lg" />
        <p className="text-sm text-zinc-500 flex items-center gap-2">
          <Loader2 size={18} className="animate-spin" />
          Verifying...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <PasswordGate onSuccess={login} />;
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/workflows" element={<WorkflowsPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/queue" element={<QueuePage />} />
        <Route path="/accounts" element={<AccountsPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
