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

const CACHE_KEY = "flowpost_auth";
const SIGNUP_CLOSED_KEY = "flowpost_signup_closed";

function getCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCache(data: { userId: string; isAdmin: boolean }) {
  sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
}

function clearCache() {
  sessionStorage.removeItem(CACHE_KEY);
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
            setPendingSecurityVerification(false);
          } else {
            setStoredToken(null);
          }
          resolve();
        })
        .catch(() => {
          setStoredToken(null);
          resolve();
        });
      return;
    }

    // 2. Check sessionStorage cache (reduces API calls)
    const cached = getCache();
    if (cached?.userId) {
      setIsAuthenticated(true);
      setUserId(cached.userId);
      setIsAdmin(cached.isAdmin);
      setPendingSecurityVerification(cached.isAdmin);
      resolve();
    }

    // 3. Subscribe to Supabase auth state for fresh logins / session recovery
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (cancelled) return;

        if (event === "SIGNED_IN" && session) {
          const { data: existing } = await supabase
            .from("users")
            .select("id, is_admin")
            .eq("id", session.user.id)
            .maybeSingle();

          if (!existing) {
            localStorage.setItem(SIGNUP_CLOSED_KEY, "true");
            await supabase.auth.signOut();
            clearCache();
            resolve();
            return;
          }

          setCache({ userId: existing.id, isAdmin: existing.is_admin });

          if (existing.is_admin) {
            setIsAdmin(true);
            setPendingSecurityVerification(true);
            setIsAuthenticated(true);
            setUserId(existing.id);
          } else {
            setIsAuthenticated(true);
            setUserId(existing.id);
          }

          resolve();
        }

        if (event === "SIGNED_OUT") {
          const t = getStoredToken();
          if (!t) {
            clearCache();
            setIsAuthenticated(false);
            setUserId(null);
            setIsAdmin(false);
            setPendingSecurityVerification(false);
          }
          resolve();
        }
      }
    );

    // Fresh visit (no OAuth hash) → resolve immediately, no 5s delay
    const hasOAuthHash = window.location.hash.includes("access_token");
    if (!hasOAuthHash) {
      resolve();
    } else {
      // OAuth callback — wait up to 5s for SIGNED_IN
      timeoutId = setTimeout(resolve, 5000);
    }

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const result = await Promise.race([
      supabase.auth.signInWithPassword({ email, password }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Connection timed out. Check your network or try again.")), 15000)
      ),
    ]);
    const { data, error } = result;
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
    clearCache();
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
