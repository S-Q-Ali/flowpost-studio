import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Mail, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/Logo";

type Tab = "signin" | "signup";

export default function LoginPage() {
  const navigate = useNavigate();
  const { loginWithEmail, signup } = useAuth();
  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const resetForm = useCallback(() => {
    setError(null);
    setVerifying(false);
  }, []);

  const handleSignIn = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }
    setError(null);
    setVerifying(true);

    try {
      await loginWithEmail(email, password);
      navigate("/dashboard");
    } catch (err: any) {
      const msg = err?.message || "Sign in failed. Check your credentials.";
      setError(msg);
    } finally {
      setVerifying(false);
    }
  }, [email, password, loginWithEmail, navigate]);

  const handleSignUp = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !name) {
      setError("All fields are required");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setError(null);
    setVerifying(true);

    try {
      await signup(email, password, name);
      setSignupSuccess(true);
    } catch (err: any) {
      const msg = err?.message || "Sign up failed. Please try again.";
      setError(msg);
    } finally {
      setVerifying(false);
    }
  }, [email, password, name, signup]);

  if (signupSuccess) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6"
        style={{ backgroundColor: "#0F0F0F" }}
      >
        <Card className="bg-card border-border max-w-sm w-full">
          <CardHeader>
            <CardTitle className="text-foreground text-center">
              Check Your Email
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              We sent a confirmation link to <strong>{email}</strong>.
              Click the link in the email to activate your account.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setSignupSuccess(false);
                setTab("signin");
                resetForm();
              }}
            >
              Back to Sign In
            </Button>
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
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3">
          <Logo size="lg" />
          <h1 className="text-2xl font-bold tracking-tight text-white">
            FlowPost
          </h1>
          <p className="text-sm text-zinc-500">
            {tab === "signin" ? "Sign in to your account" : "Create an account"}
          </p>
        </div>

        <Card className="bg-card border-border w-full">
          <CardContent className="pt-6">
            <Tabs value={tab} onValueChange={(v) => { setTab(v as Tab); setError(null); }} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
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
                        placeholder="you@example.com"
                        autoFocus
                        disabled={verifying}
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
                        placeholder="Enter your password"
                        disabled={verifying}
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
                    disabled={verifying || !email || !password}
                    className="w-full h-11 rounded-xl font-medium bg-[#5BB5C4] text-white transition-all hover:opacity-90 disabled:opacity-50"
                  >
                    {verifying ? (
                      <><Loader2 size={18} className="animate-spin mr-2" /> Signing in...</>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name" className="text-foreground">Name</Label>
                    <div className="relative">
                      <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <Input
                        id="signup-name"
                        type="text"
                        value={name}
                        onChange={(e) => { setName(e.target.value); setError(null); }}
                        placeholder="Your name"
                        autoFocus
                        disabled={verifying}
                        className="h-11 pl-10 rounded-xl border-zinc-700 bg-zinc-900/80 text-white placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-[#5BB5C4] focus-visible:border-[#5BB5C4]"
                        autoComplete="name"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-foreground">Email</Label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <Input
                        id="signup-email"
                        type="email"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setError(null); }}
                        placeholder="you@example.com"
                        disabled={verifying}
                        className="h-11 pl-10 rounded-xl border-zinc-700 bg-zinc-900/80 text-white placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-[#5BB5C4] focus-visible:border-[#5BB5C4]"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-foreground">Password</Label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setError(null); }}
                        placeholder="At least 6 characters"
                        disabled={verifying}
                        className="h-11 pl-10 pr-12 rounded-xl border-zinc-700 bg-zinc-900/80 text-white placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-[#5BB5C4] focus-visible:border-[#5BB5C4]"
                        autoComplete="new-password"
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
                    disabled={verifying || !email || !password || !name}
                    className="w-full h-11 rounded-xl font-medium bg-[#5BB5C4] text-white transition-all hover:opacity-90 disabled:opacity-50"
                  >
                    {verifying ? (
                      <><Loader2 size={18} className="animate-spin mr-2" /> Creating account...</>
                    ) : (
                      "Create Account"
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
