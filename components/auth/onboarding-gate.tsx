"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import {
  clearPendingDisplayCurrency,
  getPendingDisplayCurrency,
} from "@/lib/pending-display-currency";

export function OnboardingGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const {
    data: profile,
    isLoading: profileLoading,
    updateDisplayCurrency,
  } = useProfile();
  const [applyError, setApplyError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const { mutate: applyCurrency } = updateDisplayCurrency;

  const tryApply = useCallback(() => {
    const pending = getPendingDisplayCurrency();
    if (!pending) return;
    if (startedRef.current) return;
    startedRef.current = true;
    setApplyError(null);
    applyCurrency(pending, {
      onSuccess: clearPendingDisplayCurrency,
      onError: (err) => {
        startedRef.current = false;
        setApplyError(
          err instanceof Error
            ? err.message
            : "Couldn't save your display currency."
        );
      },
    });
  }, [applyCurrency]);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user) {
      router.replace("/auth?mode=signin");
      return;
    }
    if (profile?.display_currency) return;
    if (applyError) return;

    if (getPendingDisplayCurrency()) {
      tryApply();
    } else {
      router.replace("/onboarding");
    }
  }, [
    authLoading,
    profileLoading,
    user,
    profile?.display_currency,
    applyError,
    router,
    tryApply,
  ]);

  if (authLoading || profileLoading) return null;
  if (!user) return null;
  if (profile?.display_currency) return <>{children}</>;

  if (applyError) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 text-center shadow-sm">
          <div>
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm text-muted-foreground">{applyError}</p>
          </div>
          <Button className="w-full" onClick={tryApply}>
            Try again
          </Button>
        </div>
      </main>
    );
  }

  return null;
}
