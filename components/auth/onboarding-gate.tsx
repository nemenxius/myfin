"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profile";
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

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user) {
      router.replace("/auth?mode=signin");
      return;
    }
    if (profile?.display_currency) return;

    const pending = getPendingDisplayCurrency();
    if (pending) {
      updateDisplayCurrency.mutate(pending, {
        onSettled: clearPendingDisplayCurrency,
      });
    } else {
      router.replace("/onboarding");
    }
  }, [
    authLoading,
    profileLoading,
    user,
    profile?.display_currency,
    updateDisplayCurrency,
    router,
  ]);

  if (authLoading || profileLoading) return null;
  if (!user) return null;
  if (profile?.display_currency) return <>{children}</>;
  return null;
}
