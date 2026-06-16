import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { supabase } from "@/integrations/supabase/client";

const TOKEN_KEY = "flowpost_token";

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function setStoredToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

type AuthContextValue = {
  isAuthenticated: boolean;
  isVerifying: boolean;
  userId: string | null;
  isAdmin: boolean;
  pendingSecurityVerification: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  login: (userId?: string) => void;
  logout: () => Promise<void>;
  setPendingSecurityVerification: (v: boolean) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingSecurityVerification, setPendingSecurityVerification] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. Check custom token (admin)
      const token = getStoredToken();
      if (token) {
        const { data, error } = await supabase.functions.invoke<{
          valid?: boolean;
          userId?: string;
        }>("verify-session", { body: { token } });

        if (!cancelled) {
          if (!error && data?.valid) {
            setIsAuthenticated(true);
            setUserId(data.userId ?? "00000000-0000-0000-0000-000000000000");
            setIsAdmin(true);
          } else {
            setStoredToken(null);
          }
          setIsVerifying(false);
        }
        return;
      }

      // 2. Check Supabase session (regular users)
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled && session) {
        const { data: userData } = await supabase
          .from("users")
          .select("is_admin")
          .eq("id", session.user.id)
          .maybeSingle();

        if (userData?.is_admin) {
          // Admin logged in via email but no custom token yet
          setIsAdmin(true);
          setPendingSecurityVerification(true);
          setUserId(session.user.id);
        } else {
          setIsAuthenticated(true);
          setUserId(session.user.id);
        }
      }

      if (!cancelled) setIsVerifying(false);
    })();

    return () => { cancelled = true; };
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    if (data.session) {
      const { data: userData } = await supabase
        .from("users")
        .select("is_admin")
        .eq("id", data.session.user.id)
        .maybeSingle();

      if (userData?.is_admin) {
        setIsAdmin(true);
        setPendingSecurityVerification(true);
        setIsAuthenticated(true);
        setUserId(data.session.user.id);
      } else {
        setIsAuthenticated(true);
        setUserId(data.session.user.id);
      }
    }
  }, []);

  const signup = useCallback(async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) throw error;
  }, []);

  const login = useCallback((adminUserId?: string) => {
    setIsAuthenticated(true);
    setPendingSecurityVerification(false);
    if (adminUserId) setUserId(adminUserId);
  }, []);

  const logout = useCallback(async () => {
    setStoredToken(null);
    setIsAuthenticated(false);
    setUserId(null);
    setIsAdmin(false);
    setPendingSecurityVerification(false);
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isVerifying,
        userId,
        isAdmin,
        pendingSecurityVerification,
        loginWithEmail,
        signup,
        login,
        logout,
        setPendingSecurityVerification,
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
