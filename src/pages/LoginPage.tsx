import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Mail, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const navigate = useNavigate();
  const { loginWithEmail, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailVerifying, setEmailVerifying] = useState(false);
  const [googleVerifying, setGoogleVerifying] = useState(false);

  useEffect(() => {
    const signupClosed = localStorage.getItem("flowpost_signup_closed");
    if (signupClosed) {
      localStorage.removeItem("flowpost_signup_closed");
      toast.error("Sign up is closed. Contact the admin.", { duration: 5000 });
    }
  }, []);

  const handleSignIn = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }
    setError(null);
    setEmailVerifying(true);

    try {
      await loginWithEmail(email, password);
      navigate("/dashboard");
    } catch (err: any) {
      const msg = err?.message || "Sign in failed";
      setError(msg);
    } finally {
      setEmailVerifying(false);
    }
  }, [email, password, loginWithEmail, navigate]);

  const handleGoogle = useCallback(async () => {
    setError(null);
    setGoogleVerifying(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      const msg = err?.message || "Google sign-in failed";
      setError(msg);
      setGoogleVerifying(false);
    }
  }, [loginWithGoogle]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: "#0F0F0F" }}
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3">
          <Logo size="lg" />
          <h1 className="text-2xl font-bold tracking-tight text-white">
            FlowPost
          </h1>
          <p className="text-sm text-zinc-500">Sign in to continue</p>
        </div>

        <Card className="bg-card border-border w-full">
          <CardContent className="pt-6 space-y-4">
            <Button
              onClick={handleGoogle}
              disabled={googleVerifying}
              className="w-full h-12 rounded-xl font-medium bg-white text-gray-900 hover:bg-gray-100 disabled:opacity-70"
            >
              {googleVerifying ? (
                <><Loader2 size={18} className="animate-spin mr-2" /> Signing in...</>
              ) : (
                "Continue with Google"
              )}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Admin</span>
              </div>
            </div>

            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email" className="text-foreground">Email</Label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <Input
                    id="signin-email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    placeholder="admin@example.com"
                    autoFocus
                    disabled={emailVerifying}
                    className="h-11 pl-10 rounded-xl border-zinc-700 bg-zinc-900/80 text-white placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-[#5BB5C4] focus-visible:border-[#5BB5C4]"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signin-password" className="text-foreground">Password</Label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <Input
                    id="signin-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    placeholder="Enter password"
                    disabled={emailVerifying}
                    className="h-11 pl-10 pr-12 rounded-xl border-zinc-700 bg-zinc-900/80 text-white placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-[#5BB5C4] focus-visible:border-[#5BB5C4]"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-400 text-center">{error}</p>
              )}

              <Button
                type="submit"
                disabled={emailVerifying || !email || !password}
                className="w-full h-11 rounded-xl font-medium bg-[#5BB5C4] text-white transition-all hover:opacity-90 disabled:opacity-50"
              >
                {emailVerifying ? (
                  <><Loader2 size={18} className="animate-spin mr-2" /> Signing in...</>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
