import { useState, useCallback, useEffect } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";

const TOKEN_KEY = "flowpost_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

type PasswordGateProps = {
  onSuccess: () => void;
};

type AuthStep = "password" | "security-questions" | "setup-questions" | "google";

export function PasswordGate({ onSuccess }: PasswordGateProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [favTeacher, setFavTeacher] = useState("");
  const [bestNightDate, setBestNightDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [authStep, setAuthStep] = useState<AuthStep>("password");
  const [remainingAttempts, setRemainingAttempts] = useState<number>(5);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutUntil, setLockoutUntil] = useState<string | null>(null);
  const [adminHasQuestions, setAdminHasQuestions] = useState<boolean | null>(null);

  useEffect(() => {
    checkAdminQuestions();
  }, []);

  const checkAdminQuestions = async () => {
    try {
      const { data, error } = await supabase.functions.invoke<{
        hasQuestions?: boolean;
        questionsConfigured?: boolean;
      }>("verify-security-questions", { method: "GET" });

      if (!error && data) {
        setAdminHasQuestions(data.questionsConfigured || false);
      }
    } catch (err) {
      console.error("Failed to check admin questions:", err);
      setAdminHasQuestions(false);
    }
  };

  const handlePasswordSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setVerifying(true);

      try {
        const { data, error: fnError } = await supabase.functions.invoke<{
          success: boolean;
          token?: string;
          error?: string;
          remainingAttempts?: number;
          lockoutUntil?: string;
        }>("verify-password", {
          body: { password },
        });

        if (fnError) {
          setError(fnError.message || "Verification failed");
          setShake(true);
          setTimeout(() => setShake(false), 400);
          return;
        }

        if (data?.lockoutUntil) {
          setIsLockedOut(true);
          setLockoutUntil(data.lockoutUntil);
          setError("Too many failed attempts. Try again later.");
          return;
        }

        if (data?.success && data?.token) {
          if (adminHasQuestions) {
            setAuthStep("security-questions");
            setPassword("");
          } else {
            setStoredToken(data.token);
            setAuthStep("setup-questions");
          }
        } else {
          const remaining = data?.remainingAttempts || remainingAttempts - 1;
          setRemainingAttempts(remaining);
          setError(`Incorrect password. ${remaining} attempts remaining.`);
          setShake(true);
          setTimeout(() => setShake(false), 400);
        }
      } catch {
        setError("Network error. Please try again.");
        setShake(true);
        setTimeout(() => setShake(false), 400);
      } finally {
        setVerifying(false);
      }
    },
    [password, onSuccess, adminHasQuestions, remainingAttempts],
  );

  const handleSecurityQuestionsSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setVerifying(true);

      try {
        const { data, error: fnError } = await supabase.functions.invoke<{
          success?: boolean;
          verified?: boolean;
          token?: string;
        }>("verify-security-questions", {
          body: {
            action: "verify",
            favTeacher,
            bestNightDate,
          },
        });

        if (fnError) {
          setError(fnError.message || "Verification failed");
          setShake(true);
          setTimeout(() => setShake(false), 400);
          return;
        }

        if (data?.verified && data?.token) {
          setStoredToken(data.token);
          onSuccess();
        } else {
          setError("Incorrect answers. Please try again.");
          setShake(true);
          setTimeout(() => setShake(false), 400);
        }
      } catch {
        setError("Network error. Please try again.");
        setShake(true);
        setTimeout(() => setShake(false), 400);
      } finally {
        setVerifying(false);
      }
    },
    [favTeacher, bestNightDate, onSuccess],
  );

  const handleSetupQuestionsSubmit = useCallback(
    async (e: React.FormEvent) => {
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
          body: {
            setQuestions: true,
            favTeacher: favTeacher.trim(),
            bestNightDate,
          },
        });

        if (fnError || !data?.success) {
          setError("Failed to save security questions");
          return;
        }

        setAdminHasQuestions(true);
        setAuthStep("security-questions");
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setVerifying(false);
      }
    },
    [favTeacher, bestNightDate],
  );

  const handleGoogleLogin = useCallback(async () => {
    setError(null);
    setVerifying(true);

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setError("Google sign-in failed. Please try again.");
        console.error("Google OAuth error:", error);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setVerifying(false);
    }
  }, []);

  if (isLockedOut && lockoutUntil) {
    const lockoutDate = new Date(lockoutUntil);
    const minutesLeft = Math.ceil((lockoutDate.getTime() - Date.now()) / 60000);
    
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6"
        style={{ backgroundColor: "#0F0F0F" }}
      >
        <Card className="bg-card border-border max-w-sm">
          <CardHeader>
            <CardTitle className="text-destructive">Too Many Attempts</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              You have been locked out due to multiple failed login attempts.
              Please try again in {minutesLeft} minutes.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (authStep === "security-questions" || authStep === "setup-questions") {
    const isSetup = authStep === "setup-questions";
    
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6"
        style={{ backgroundColor: "#0F0F0F" }}
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
            <form onSubmit={isSetup ? handleSetupQuestionsSubmit : handleSecurityQuestionsSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-foreground">What is your favorite teacher's name?</Label>
                <Input
                  type="text"
                  value={favTeacher}
                  onChange={(e) => {
                    setFavTeacher(e.target.value);
                    setError(null);
                  }}
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
                  onChange={(e) => {
                    setBestNightDate(e.target.value);
                    setError(null);
                  }}
                  className="h-10"
                  disabled={verifying}
                />
              </div>

              {error && (
                <p className="text-sm text-red-400 text-center">{error}</p>
              )}

              <Button
                type="submit"
                disabled={verifying}
                className="w-full h-10 bg-primary text-primary-foreground"
              >
                {verifying ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" />
                    Verifying...
                  </>
                ) : (
                  isSetup ? "Save & Continue" : "Verify"
                )}
              </Button>

              {!isSetup && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setAuthStep("password");
                    setFavTeacher("");
                    setBestNightDate("");
                    setError(null);
                  }}
                >
                  Back to Password
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: "#0F0F0F" }}
    >
      <div
        className={cn(
          "w-full max-w-sm flex flex-col items-center gap-8 rounded-2xl p-8 transition-transform",
          shake && "animate-password-shake",
        )}
      >
        <div className="flex flex-col items-center gap-3">
          <Logo size="lg" />
          <h1 className="text-2xl font-bold tracking-tight text-white">
            FlowPost
          </h1>
          <p className="text-sm text-zinc-500">Sign in to continue</p>
        </div>

        <Tabs defaultValue="admin" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="admin">Admin</TabsTrigger>
            <TabsTrigger value="user">User</TabsTrigger>
          </TabsList>
          
          <TabsContent value="admin">
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Admin Password"
                  autoFocus
                  disabled={verifying}
                  className="h-12 rounded-xl border-zinc-700 bg-zinc-900/80 pl-4 pr-12 text-white placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {error && (
                <p className="text-sm text-red-400 text-center">{error}</p>
              )}

              <Button
                type="submit"
                disabled={verifying}
                className="w-full h-12 rounded-xl font-medium bg-primary text-primary-foreground transition-all hover:opacity-90 disabled:opacity-70"
              >
                {verifying ? (
                  <>
                    <Loader2 size={18} className="animate-spin mr-2" />
                    Verifying...
                  </>
                ) : (
                  "Enter"
                )}
              </Button>
            </form>
          </TabsContent>
          
          <TabsContent value="user">
            <div className="space-y-4">
              <Button
                onClick={handleGoogleLogin}
                disabled={verifying}
                className="w-full h-12 rounded-xl font-medium bg-white text-gray-900 hover:bg-gray-100"
              >
                {verifying ? (
                  <Loader2 size={18} className="animate-spin mr-2" />
                ) : null}
                Continue with Google
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Sign in with your Google account to access FlowPost
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}