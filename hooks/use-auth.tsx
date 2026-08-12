"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AuthError, User } from "@supabase/supabase-js";
import { supabaseClient } from "@/lib/supabase/client";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<{ error: AuthError | null }>;
  leaveDemoForAuth: () => Promise<{ error: Error | AuthError | null }>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  signOut: async () => ({ error: null }),
  leaveDemoForAuth: async () => ({ error: null }),
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    if (user?.is_anonymous) {
      // Demo sandbox: purge permanently; never surface cleanup errors.
      try {
        await supabaseClient.rpc("purge_demo_user");
      } catch {
        // Cleanup errors must never block sign-out; the 24h sweep is the backstop.
      }
    }
    // Surface the sign-out result so callers can distinguish success from
    // failure (e.g. only navigate away when the session is actually gone).
    return user?.is_anonymous
      ? supabaseClient.auth.signOut({ scope: "local" })
      : supabaseClient.auth.signOut();
  }, [user]);

  const leaveDemoForAuth = useCallback(async () => {
    if (!user?.is_anonymous) return { error: null };

    const { error: purgeError } = await supabaseClient.rpc("purge_demo_user");
    if (purgeError) return { error: purgeError };

    return supabaseClient.auth.signOut({ scope: "local" });
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, isLoading, signOut, leaveDemoForAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
