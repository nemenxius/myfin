"use client";

import { useEffect, useState } from "react";
import { useAccounts } from "@/hooks/use-accounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACCOUNT_TYPES, type AccountType } from "./account-types";
import { CURRENCIES } from "./account-currencies";
import type { Tables } from "@/types/database";

type Account = Tables<"accounts">;

interface AccountFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: Account | null;
}

interface FormErrors {
  name?: string;
  initialBalance?: string;
}

export function AccountForm({
  open,
  onOpenChange,
  account,
}: AccountFormProps) {
  const { createAccount, updateAccount } = useAccounts();

  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("checking");
  const [initialBalance, setInitialBalance] = useState("0");
  const [currency, setCurrency] = useState("USD");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSubmitError(null);

    if (account) {
      setName(account.name);
      setType(account.account_type as AccountType);
      setInitialBalance(String(account.initial_balance));
      setCurrency(account.currency);
    } else {
      setName("");
      setType("checking");
      setInitialBalance("0");
      setCurrency("USD");
    }
  }, [open, account]);

  const validate = (): boolean => {
    const next: FormErrors = {};
    const numericBalance = Number(initialBalance);

    if (!name.trim()) {
      next.name = "Please enter an account name.";
    }
    if (initialBalance !== "" && Number.isNaN(numericBalance)) {
      next.initialBalance = "Balance must be a number.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const currencyOptions = CURRENCIES.some((c) => c.value === currency)
    ? CURRENCIES
    : [...CURRENCIES, { value: currency, label: currency }];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitError(null);

    const payload = {
      name: name.trim(),
      account_type: type,
      initial_balance: Number(initialBalance) || 0,
      currency: currency.trim() || "USD",
    };

    try {
      if (account) {
        await updateAccount.mutateAsync({ id: account.id, ...payload });
      } else {
        await createAccount.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {account ? "Edit Account" : "Add Account"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Main Checking"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="type">Type</Label>
            <Select
              value={type}
              onValueChange={(value) =>
                value !== null && setType(value as AccountType)
              }
              items={ACCOUNT_TYPES.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            >
              <SelectTrigger id="type" className="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="initial-balance">Starting balance</Label>
              <Input
                id="initial-balance"
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="0.00"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                aria-invalid={!!errors.initialBalance}
              />
              {errors.initialBalance && (
                <p className="text-xs text-destructive">
                  {errors.initialBalance}
                </p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={currency}
                onValueChange={(value) =>
                  value !== null && setCurrency(value)
                }
                items={currencyOptions.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
              >
                <SelectTrigger id="currency" className="w-full">
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
          </div>

          {submitError && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {submitError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">
              {account ? "Save Changes" : "Add Account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
