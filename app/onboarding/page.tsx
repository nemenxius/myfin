"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCIES } from "@/components/accounts/account-currencies";
import { Logo } from "@/components/brand/logo";

const currencyOptions = CURRENCIES.map((c) => ({
  value: c.value,
  label: c.label,
}));

export default function OnboardingPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const {
    data: profile,
    isLoading: profileLoading,
    updateDisplayCurrency,
  } = useProfile();
  const [currency, setCurrency] = useState("USD");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace("/auth?mode=signin");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (profileLoading) return;
    if (profile?.display_currency) router.replace("/dashboard");
  }, [profileLoading, profile?.display_currency, router]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    updateDisplayCurrency.mutate(currency, {
      onSuccess: () => router.replace("/dashboard"),
      onError: (err) => {
        setError(
          err instanceof Error ? err.message : "Something went wrong."
        );
        setSaving(false);
      },
    });
  };

  if (authLoading || profileLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-semibold">Choose your currency</h1>
          <p className="text-sm text-muted-foreground">
            Combined totals and charts will be shown in this currency. You can
            change it anytime in Settings.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-4 rounded-xl border bg-card p-6 shadow-sm">
          <div className="grid gap-1.5">
            <Label htmlFor="onboarding-currency">Display currency</Label>
            <Select
              value={currency}
              onValueChange={(value) => value !== null && setCurrency(value)}
              items={currencyOptions}
            >
              <SelectTrigger id="onboarding-currency" className="w-full">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {currencyOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving…" : "Get started"}
          </Button>
        </form>
      </div>
    </main>
  );
}
