import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { loadStoredToken, setToken, onUnauthorized } from "@/services/authStore";
import { apiLogin, apiLogout, apiRegister, getMe, updateMe, AuthUser } from "@/services/api";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (telephone: string, password: string) => Promise<void>;
  register: (nom: string, telephone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (update: Partial<Pick<AuthUser, "nom" | "telephone">>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await loadStoredToken();
      if (token) {
        try {
          const me = await getMe();
          setUser(me);
        } catch {
          // Session expirée ou invalide côté serveur — on repart propre.
          await setToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    })();
  }, []);

  // Une requête rejetée en 401 pendant l'utilisation (token expiré, secret
  // serveur changé) ramène automatiquement à l'écran de connexion : le token
  // a déjà été effacé par api.ts, il reste à vider l'utilisateur courant.
  useEffect(() => {
    onUnauthorized(() => setUser(null));
    return () => onUnauthorized(null);
  }, []);

  const login = useCallback(async (telephone: string, password: string) => {
    const me = await apiLogin(telephone, password);
    setUser(me);
  }, []);

  const register = useCallback(async (nom: string, telephone: string, password: string) => {
    const me = await apiRegister(nom, telephone, password);
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (update: Partial<Pick<AuthUser, "nom" | "telephone">>) => {
    const me = await updateMe(update);
    setUser(me);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, register, logout, updateProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé à l'intérieur de <AuthProvider>");
  return ctx;
}
