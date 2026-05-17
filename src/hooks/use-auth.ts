/**
 * useAuth Hook
 *
 * Manages authentication state across the application.
 * Provides user info, loading state, and auth actions.
 *
 * Usage:
 *   const { user, loading, login, logout, isAuthenticated } = useAuth();
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  username: string;
}

interface UseAuthResult {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) throw new Error("Not authenticated");
      const data = await res.json();
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || "Login failed" };
      }

      setUser(data.user);
      router.push("/dashboard");
      return { success: true };
    } catch {
      return { success: false, error: "Network error" };
    }
  }, [router]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore errors during logout
    }
    setUser(null);
    router.push("/login");
  }, [router]);

  return {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    refresh,
  };
}
