import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const TOKEN_KEY = "flowpost_token";

function setStoredToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function SecurityQuestionsGate() {
  const { login, logout, isAuthenticated, pendingSecurityVerification } = useAuth();
  const navigate = useNavigate();
  const [favTeacher, setFavTeacher] = useState("");
  const [bestNightDate, setBestNightDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [isSetup, setIsSetup] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdminQuestions();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/", { replace: true });
    } else if (!pendingSecurityVerification) {
      const saved = localStorage.getItem("redirectPath");
      localStorage.removeItem("redirectPath");
      navigate(saved || "/dashboard", { replace: true });
    }
  }, [isAuthenticated, pendingSecurityVerification, navigate]);

  const checkAdminQuestions = async () => {
    try {
      const { data, error } = await supabase.functions.invoke<{
        hasQuestions?: boolean;
        questionsConfigured?: boolean;
      }>("verify-security-questions", { method: "GET" });

      if (!error && data) {
        setIsSetup(!data.questionsConfigured);
      } else {
        setIsSetup(true);
      }
    } catch {
      setIsSetup(true);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!favTeacher.trim() || !bestNightDate) {
      setError("Please answer both security questions");
      return;
    }
    setError(null);
    setVerifying(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke<{
        verified?: boolean;
        token?: string;
      }>("verify-security-questions", {
        body: { action: "verify", favTeacher, bestNightDate },
      });

      if (fnError) {
        setError(fnError.message || "Verification failed");
        return;
      }

      if (data?.verified && data?.token) {
        setStoredToken(data.token);
        window.location.reload();
      } else {
        setError("Incorrect answers. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setVerifying(false);
    }
  }, [favTeacher, bestNightDate]);

  const handleSetup = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!favTeacher.trim() || !bestNightDate) {
      setError("Please answer both security questions");
      return;
    }
    setError(null);
    setVerifying(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke<{
        success?: boolean;
      }>("verify-security-questions", {
        body: { setQuestions: true, favTeacher: favTeacher.trim(), bestNightDate },
      });

      if (fnError || !data?.success) {
        setError("Failed to save security questions");
        return;
      }

      setIsSetup(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setVerifying(false);
    }
  }, [favTeacher, bestNightDate]);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-background text-foreground"
      >
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground"
      >
      <Card className="bg-card border-border max-w-sm w-full">
        <CardHeader>
          <CardTitle className="text-foreground text-center">
            {isSetup ? "Set Up Security Questions" : "Security Verification"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-6 text-center">
            {isSetup
              ? "Set up two security questions for additional protection."
              : "Answer your security questions to continue."
            }
          </p>
          <form onSubmit={isSetup ? handleSetup : handleVerify} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-foreground">What is your favorite teacher's name?</Label>
              <Input
                type="text"
                value={favTeacher}
                onChange={(e) => { setFavTeacher(e.target.value); setError(null); }}
                placeholder="Enter teacher's name"
                className="h-10"
                disabled={verifying}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">What is the date of your best night ever?</Label>
              <Input
                type="date"
                value={bestNightDate}
                onChange={(e) => { setBestNightDate(e.target.value); setError(null); }}
                className="h-10"
                disabled={verifying}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <Button
              type="submit"
              disabled={verifying}
              className="w-full h-10 font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {verifying ? (
                <><Loader2 size={16} className="animate-spin mr-2" /> Verifying...</>
              ) : (
                isSetup ? "Save & Continue" : "Verify"
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={logout}
            >
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
