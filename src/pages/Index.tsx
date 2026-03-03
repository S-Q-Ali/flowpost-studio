import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { useEffect } from "react";

export default function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/dashboard", { replace: true });
  }, [user, loading, navigate]);

  const handleAuth = async (type: "login" | "signup") => {
    setIsSubmitting(true);
    try {
      const { error } =
        type === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
      if (error) throw error;
      if (type === "signup") toast.success("Check your email to confirm your account!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      {/* Hero */}
      <div className="text-center mb-10 animate-fade-in">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-primary shadow-glow">
            <Zap size={26} className="text-primary-foreground" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">FlowPost</h1>
        </div>
        <p className="text-lg text-muted-foreground max-w-md">
          Post once. Distribute everywhere.
        </p>
      </div>

      {/* Auth Card */}
      <Card className="w-full max-w-sm border-border bg-card shadow-card animate-fade-in">
        <Tabs defaultValue="login">
          <CardHeader className="pb-2">
            <TabsList className="grid grid-cols-2 w-full bg-secondary">
              <TabsTrigger value="login">Log In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <TabsContent value="login" className="mt-0">
                <Button
                  className="w-full gradient-primary text-primary-foreground"
                  onClick={() => handleAuth("login")}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Signing in…" : "Sign In"}
                </Button>
              </TabsContent>
              <TabsContent value="signup" className="mt-0">
                <Button
                  className="w-full gradient-primary text-primary-foreground"
                  onClick={() => handleAuth("signup")}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Creating account…" : "Create Account"}
                </Button>
              </TabsContent>
            </div>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
