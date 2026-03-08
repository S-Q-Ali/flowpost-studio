import { useState, useCallback } from "react";
import { Zap, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const AUTH_KEY = "flowpost_authenticated";

export function getStoredAuth(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(AUTH_KEY) === "true";
}

export function setStoredAuth(authenticated: boolean) {
  if (typeof window === "undefined") return;
  if (authenticated) {
    sessionStorage.setItem(AUTH_KEY, "true");
  } else {
    sessionStorage.removeItem(AUTH_KEY);
  }
}

type PasswordGateProps = {
  onSuccess: () => void;
};

export function PasswordGate({ onSuccess }: PasswordGateProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      const envPassword = import.meta.env.VITE_APP_PASSWORD;
      if (typeof envPassword !== "string" || !envPassword.trim()) {
        setError("App password not configured.");
        setShake(true);
        setTimeout(() => setShake(false), 400);
        return;
      }
      if (password.trim() === envPassword) {
        setStoredAuth(true);
        onSuccess();
      } else {
        setError("Incorrect password");
        setShake(true);
        setTimeout(() => setShake(false), 400);
      }
    },
    [password, onSuccess],
  );

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
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: "linear-gradient(135deg, #7C3AED, #A78BFA)" }}
          >
            <Zap size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            FlowPost
          </h1>
          <p className="text-sm text-zinc-500">Enter password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder="Password"
              autoFocus
              className="h-12 rounded-xl border-zinc-700 bg-zinc-900/80 pl-4 pr-12 text-white placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:border-[#7C3AED]"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff size={18} />
              ) : (
                <Eye size={18} />
              )}
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full h-12 rounded-xl font-medium text-white transition-all hover:opacity-90"
            style={{ backgroundColor: "#7C3AED" }}
          >
            Enter
          </Button>
        </form>
      </div>
    </div>
  );
}
