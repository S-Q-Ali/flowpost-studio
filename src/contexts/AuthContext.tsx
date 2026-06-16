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
  loginWithGoogle: () => Promise<void>;
  login: (userId?: string) => void;
  logout: () => Promise<void>;
  setPendingSecurityVerification: (v: boolean) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function ensureUserRecord(sessionUserId: string, session: any) {
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("id", sessionUserId)
    .maybeSingle();

  if (!existing) {
    await supabase.from("users").insert({
      id: sessionUserId,
      email: session.user.email,
      name: session.user.user_metadata?.full_name || session.user.email,
      avatar_url: session.user.user_metadata?.avatar_url,
      is_admin: false,
    });
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingSecurityVerification, setPendingSecurityVerification] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let resolved = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const resolve = () => {
      if (!resolved && !cancelled) {
        resolved = true;
        setIsVerifying(false);
      }
    };

    // 1. Check custom token (admin)
    const token = getStoredToken();
    if (token) {
      supabase.functions.invoke<{ valid?: boolean; userId?: string }>("verify-session", { body: { token } })
        .then(({ data, error }) => {
          if (cancelled) return;
          if (!error && data?.valid) {
            setIsAuthenticated(true);
            setUserId(data.userId ?? "00000000-0000-0000-0000-000000000000");
            setIsAdmin(true);
          } else {
            setStoredToken(null);
          }
          resolve();
        });
      return;
    }

    // 2. No custom token → subscribe to Supabase auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (cancelled) return;

        if (event === "SIGNED_IN" && session) {
          await ensureUserRecord(session.user.id, session);

          if (cancelled) return;

          const { data: userData } = await supabase
            .from("users")
            .select("is_admin")
            .eq("id", session.user.id)
            .maybeSingle();

          if (userData?.is_admin) {
            setIsAdmin(true);
            setPendingSecurityVerification(true);
            setIsAuthenticated(true);
            setUserId(session.user.id);
          } else {
            setIsAuthenticated(true);
            setUserId(session.user.id);
          }

          resolve();
        }

        if (event === "SIGNED_OUT") {
          const t = getStoredToken();
          if (!t) {
            setIsAuthenticated(false);
            setUserId(null);
            setIsAdmin(false);
            setPendingSecurityVerification(false);
          }
          resolve();
        }
      }
    );

    // Timeout fallback — if no session, stop verifying after 5s
    timeoutId = setTimeout(resolve, 5000);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
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

  const loginWithGoogle = useCallback(async () => {
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

    if (error) throw error;

    if (data.url) {
      window.location.href = data.url;
    }
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
        loginWithGoogle,
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
