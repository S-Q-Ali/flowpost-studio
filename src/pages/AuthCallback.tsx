import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { isAuthenticated, isVerifying } = useAuth();

  useEffect(() => {
    if (!isVerifying && isAuthenticated) {
      const saved = localStorage.getItem("redirectPath") || "/dashboard";
      localStorage.removeItem("redirectPath");
      navigate(saved, { replace: true });
    }
  }, [isAuthenticated, isVerifying, navigate]);

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-80">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-40 rounded-md" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <p className="text-destructive mb-4">Sign in failed. Please try again.</p>
          <a href="/" className="text-primary hover:underline">Go back to login</a>
        </div>
      </div>
    );
  }

  return null;
}
