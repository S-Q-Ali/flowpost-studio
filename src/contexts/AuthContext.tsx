import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { getStoredToken, setStoredToken } from "@/components/PasswordGate";
import { supabase } from "@/integrations/supabase/client";

type AuthContextValue = {
  isAuthenticated: boolean;
  isVerifying: boolean;
  login: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setIsVerifying(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.functions.invoke<{
        valid?: boolean;
      }>("verify-session", { body: { token } });

      if (cancelled) return;

      if (!error && data?.valid) {
        setIsAuthenticated(true);
      } else {
        setStoredToken(null);
        setIsAuthenticated(false);
      }
      setIsVerifying(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(() => {
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isVerifying, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
