import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, tokenStore } from "@/api";
import { session } from "@/api/session";
import { ApiError, ROLE_PERMISSIONS, ROLE_RANK, type Permission, type Role, type User } from "@/api/types";

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: { name: string; email: string; password: string }) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (input: { name?: string; email?: string }) => Promise<User>;
  changePassword: (input: { current: string; next: string }) => Promise<void>;
  can: (permission: Permission) => boolean;
  atLeast: (role: Role) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tokenStore.get()) {
        setLoading(false);
        return;
      }
      try {
        const me = await api.auth.me();
        if (!cancelled) setUser(me);
      } catch {
        // Expired/invalid credential → clear it silently.
        tokenStore.clear();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = (next: User, token?: string) => {
    setUser(next);
    if (token) session.set(token, next.id);
  };

  const login = useCallback(async (email: string, password: string) => {
    const { user: u, token } = await api.auth.login(email, password);
    persist(u, token);
    return u;
  }, []);

  const register = useCallback(async (input: { name: string; email: string; password: string }) => {
    const { user: u, token } = await api.auth.register(input);
    persist(u, token);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout().catch(() => undefined);
    tokenStore.clear();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const me = await api.auth.me().catch(() => null);
    setUser(me);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      refresh,
      updateProfile: async (input) => {
        const next = await api.auth.updateProfile(input);
        setUser(next);
        return next;
      },
      changePassword: (input) => api.auth.changePassword(input),
      can: (permission) => (user ? ROLE_PERMISSIONS[user.role].includes(permission) : false),
      atLeast: (role) => (user ? ROLE_RANK[user.role] >= ROLE_RANK[role] : false),
    }),
    [user, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Turns any thrown value into a safe, field-aware message for forms. */
export function toFormError(error: unknown): { message: string; field?: string } {
  if (error instanceof ApiError) return { message: error.message, field: error.field };
  return { message: "Something went wrong. Please try again." };
}
