import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { supabase } from "@/integrations/supabase/client";

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

    // Instant restore from this tab's cache so a reload does not flash the login page.
    const cached = getCache();
    if (cached?.userId) {
      setUserId(cached.userId);
      setIsAdmin(cached.isAdmin);
      setPendingSecurityVerification(cached.isAdmin);
      setIsAuthenticated(true);
      setIsVerifying(false);
    }

    const apply = async (event: string, session: { user: { id: string } } | null) => {
      if (event === "SIGNED_OUT" || !session) {
        clearCache();
        setIsAuthenticated(false);
        setUserId(null);
        setIsAdmin(false);
        setPendingSecurityVerification(false);
        setIsVerifying(false);
        return;
      }

      // INITIAL_SESSION / SIGNED_IN: this is also how the persisted Supabase
      // session is restored on startup and on every desktop launch.
      const { data: existing } = await supabase
        .from("users")
        .select("id, is_admin")
        .eq("id", session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (!existing) {
        localStorage.setItem(SIGNUP_CLOSED_KEY, "true");
        await supabase.auth.signOut();
        clearCache();
        setIsAuthenticated(false);
        setUserId(null);
        setIsVerifying(false);
        return;
      }

      setCache({ userId: existing.id, isAdmin: existing.is_admin });
      setIsAuthenticated(true);
      setUserId(existing.id);
      setIsAdmin(existing.is_admin);
      setPendingSecurityVerification(existing.is_admin);
      setIsVerifying(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(apply);

    // Never leave the app spinning if Supabase does not answer.
    const timeoutId = setTimeout(() => {
      if (!cancelled) setIsVerifying(false);
    }, 5000);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);
useEffect(() => {
  // Start auto-refresh after 30s so rapid refreshes don't race
  const timer = setTimeout(() => {
    supabase.auth.startAutoRefresh();
  }, 30000);
  return () => clearTimeout(timer);
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
