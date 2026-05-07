import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { getStoredToken, setStoredToken } from "@/components/PasswordGate";
import { supabase } from "@/integrations/supabase/client";

export type AuthMode = "none" | "password" | "security-questions" | "google";

type AuthContextValue = {
  isAuthenticated: boolean;
  isVerifying: boolean;
  authMode: AuthMode;
  login: () => void;
  logout: () => void;
  setAuthMode: (mode: AuthMode) => void;
  loginWithGoogle: () => Promise<void>;
  checkSecurityQuestions: () => Promise<boolean>;
  verifySecurityQuestions: (favTeacher: string, bestNightDate: string) => Promise<boolean>;
  setSecurityQuestions: (favTeacher: string, bestNightDate: string) => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("none");

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

  const checkSecurityQuestions = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke<{
        hasQuestions?: boolean;
        questionsConfigured?: boolean;
      }>("verify-security-questions", { method: "GET" });

      if (error) throw error;
      return data?.questionsConfigured || false;
    } catch (err) {
      console.error("Failed to check security questions:", err);
      return false;
    }
  }, []);

  const verifySecurityQuestions = useCallback(async (
    favTeacher: string, 
    bestNightDate: string
  ): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke<{
        success?: boolean;
        verified?: boolean;
      }>("verify-security-questions", { 
        body: { 
          action: "verify", 
          favTeacher, 
          bestNightDate 
        } 
      });

      if (error) throw error;
      return data?.verified || false;
    } catch (err) {
      console.error("Failed to verify security questions:", err);
      return false;
    }
  }, []);

  const setSecurityQuestions = useCallback(async (
    favTeacher: string, 
    bestNightDate: string
  ): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke<{
        success?: boolean;
      }>("verify-security-questions", { 
        body: { 
          setQuestions: true, 
          favTeacher, 
          bestNightDate 
        } 
      });

      if (error) throw error;
      return data?.success || false;
    } catch (err) {
      console.error("Failed to set security questions:", err);
      return false;
    }
  }, []);

  const handleGoogleLogin = useCallback(async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      console.error("Google OAuth error:", error);
      throw error;
    }

    if (data.url) {
      window.location.href = data.url;
    }
  }, []);

  const login = useCallback(() => {
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(async () => {
    setStoredToken(null);
    setIsAuthenticated(false);
    setAuthMode("none");
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider
      value={{ 
        isAuthenticated, 
        isVerifying, 
        authMode,
        login, 
        logout,
        setAuthMode,
        loginWithGoogle: handleGoogleLogin,
        checkSecurityQuestions,
        verifySecurityQuestions,
        setSecurityQuestions
      }}
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