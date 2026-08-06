"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { supabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CURRENCIES } from "@/components/accounts/account-currencies";
import { CategoryList } from "@/components/categories/category-list";
import { useAccounts } from "@/hooks/use-accounts";
import { useCategories } from "@/hooks/use-categories";

const currencyOptions = CURRENCIES.map((c) => ({
  value: c.value,
  label: c.label,
}));

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const {
    data: profile,
    updateDisplayCurrency,
    updateDefaults,
  } = useProfile();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const router = useRouter();

  const isGoogleUser = user?.app_metadata?.provider === "google";

  const [currency, setCurrency] = useState(profile?.display_currency ?? "USD");
  const [currencyMsg, setCurrencyMsg] = useState<string | null>(null);
  const [currencyError, setCurrencyError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [defaultAccountId, setDefaultAccountId] = useState(
    profile?.default_account_id ?? ""
  );
  const [defaultCategoryId, setDefaultCategoryId] = useState(
    profile?.default_category_id ?? ""
  );
  const [defaultsMsg, setDefaultsMsg] = useState<string | null>(null);
  const [defaultsError, setDefaultsError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.display_currency) setCurrency(profile.display_currency);
  }, [profile?.display_currency]);

  useEffect(() => {
    setDefaultAccountId(profile?.default_account_id ?? "");
    setDefaultCategoryId(profile?.default_category_id ?? "");
  }, [profile?.default_account_id, profile?.default_category_id]);

  const handleCurrency = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCurrencyError(null);
    setCurrencyMsg(null);
    updateDisplayCurrency.mutate(currency, {
      onSuccess: () => setCurrencyMsg("Display currency updated."),
      onError: (err) =>
        setCurrencyError(
          err instanceof Error ? err.message : "Something went wrong."
        ),
    });
  };

  const handleDefaults = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDefaultsError(null);
    setDefaultsMsg(null);
    updateDefaults.mutate(
      {
        default_account_id: defaultAccountId || null,
        default_category_id: defaultCategoryId || null,
      },
      {
        onSuccess: () => setDefaultsMsg("Default account and category updated."),
        onError: (err) =>
          setDefaultsError(
            err instanceof Error ? err.message : "Something went wrong."
          ),
      }
    );
  };

  const handlePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordMsg(null);
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setPasswordLoading(true);
    const { error } = await supabaseClient.auth.updateUser({ password });
    setPasswordLoading(false);
    if (error) {
      setPasswordError(error.message);
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setPasswordMsg("Password updated.");
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">Settings</h1>
        <p className="mt-0.5 text-sm text-fog">
          Signed in as {user?.email}
        </p>
      </div>

      <Card className="border-border/50 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-medium">Display currency</CardTitle>
          <CardDescription>
            Used for combined totals and charts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCurrency} className="grid gap-3">
            <Select
              value={currency}
              onValueChange={(value) => value !== null && setCurrency(value)}
              items={currencyOptions}
            >
              <SelectTrigger className="w-full">
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
            {currencyError && (
              <p className="text-xs text-destructive">{currencyError}</p>
            )}
            {currencyMsg && (
              <p className="text-xs text-[#0e7c5b]">{currencyMsg}</p>
            )}
            <Button type="submit" className="w-fit">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-medium">Defaults</CardTitle>
          <CardDescription>
            Prefill new transactions with a default account and category.
            Leaving both unset means no default.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleDefaults} className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="default-account">Default account</Label>
              <Select
                value={defaultAccountId}
                onValueChange={(value) => value !== null && setDefaultAccountId(value)}
                items={[
                  { value: "", label: "None" },
                  ...(accounts ?? []).map((account) => ({
                    value: account.id,
                    label: account.name,
                  })),
                ]}
              >
                <SelectTrigger id="default-account" className="w-full">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {(accounts ?? []).map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="default-category">Default category</Label>
              <Select
                value={defaultCategoryId}
                onValueChange={(value) => value !== null && setDefaultCategoryId(value)}
                items={[
                  { value: "", label: "None" },
                  ...(categories ?? []).map((category) => ({
                    value: category.id,
                    label: category.name,
                  })),
                ]}
              >
                <SelectTrigger id="default-category" className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {(categories ?? []).map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {defaultsError && (
              <p className="text-xs text-destructive">{defaultsError}</p>
            )}
            {defaultsMsg && (
              <p className="text-xs text-[#0e7c5b]">{defaultsMsg}</p>
            )}
            <Button type="submit" className="w-fit">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>

      {!isGoogleUser && (
        <Card className="border-border/50 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-medium">Password</CardTitle>
            <CardDescription>
              Use at least 8 characters.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePassword} className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="settings-password">New password</Label>
                <Input
                  id="settings-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="settings-confirm-password">
                  Confirm new password
                </Label>
                <Input
                  id="settings-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              {passwordError && (
                <p className="text-xs text-destructive">{passwordError}</p>
              )}
              {passwordMsg && (
                <p className="text-xs text-[#0e7c5b]">{passwordMsg}</p>
              )}
              <Button type="submit" className="w-fit" disabled={passwordLoading}>
                {passwordLoading ? "Updating…" : "Update password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-medium">Categories</CardTitle>
          <CardDescription>
            Custom categories appear in the transaction form and charts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryList />
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-medium">Sign out</CardTitle>
          <CardDescription>
            End your session on this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleSignOut}>
            <LogOut />
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
