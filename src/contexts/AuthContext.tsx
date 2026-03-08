import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { getStoredAuth, setStoredAuth } from "@/components/PasswordGate";

type AuthContextValue = {
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    setIsAuthenticated(getStoredAuth());
  }, []);

  const login = useCallback(() => {
    setStoredAuth(true);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    setStoredAuth(false);
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
