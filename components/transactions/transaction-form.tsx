"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccounts } from "@/hooks/use-accounts";
import { useCategories } from "@/hooks/use-categories";
import { useTransactions } from "@/hooks/use-transactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategoryIcon } from "@/components/categories/category-icons";
import { Landmark } from "lucide-react";
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
import type { Tables } from "@/types/database";
import { dateInputToISO, isoToDateInput } from "@/lib/date";

type Transaction = Tables<"transactions">;
type TransactionType = "Income" | "Expense" | "Transfer";

interface TransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction | null;
  defaultAccountId?: string;
  defaultDate?: string;
}

interface FormErrors {
  amount?: string;
  accountId?: string;
  date?: string;
}

const today = () => isoToDateInput(new Date().toISOString());

export function TransactionForm({
  open,
  onOpenChange,
  transaction,
  defaultAccountId,
  defaultDate,
}: TransactionFormProps) {
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: categories } = useCategories();
  const { addTransaction, updateTransaction } = useTransactions();

  const [type, setType] = useState<TransactionType>("Expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});

    if (transaction) {
      setType(transaction.transaction_type as TransactionType);
      setAmount(String(Math.abs(transaction.amount)));
      setAccountId(transaction.account_id);
      setCategoryId(transaction.category_id ?? "");
      setDate(isoToDateInput(transaction.date));
      setDescription(transaction.description ?? "");
    } else {
      setType("Expense");
      setAmount("");
      setAccountId(defaultAccountId ?? "");
      setCategoryId("");
      setDate(defaultDate ?? today());
      setDescription("");
    }
  }, [open, transaction, defaultAccountId, defaultDate]);

  const validate = (): boolean => {
    const next: FormErrors = {};
    const numericAmount = Number(amount);

    if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      next.amount = "Amount must be a number greater than 0.";
    }
    if (!accountId) {
      next.accountId = "Please select an account.";
    }
    if (!date) {
      next.date = "Please select a date.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;

    const signedAmount =
      type === "Expense" ? -Math.abs(Number(amount)) : Math.abs(Number(amount));

    const payload = {
      account_id: accountId,
      category_id: categoryId || null,
      amount: signedAmount,
      transaction_type: type,
      date: dateInputToISO(date),
      description: description || null,
    };

    if (transaction) {
      updateTransaction.mutate({ id: transaction.id, ...payload });
    } else {
      addTransaction.mutate(payload);
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {transaction ? "Edit Transaction" : "Add Transaction"}
          </DialogTitle>
        </DialogHeader>

        {!accountsLoading && accounts && accounts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#18848c]/10">
              <Landmark className="h-6 w-6 text-[#18848c]" />
            </span>
            <div>
              <p className="text-sm font-medium text-ink">No accounts yet</p>
              <p className="mt-1 text-sm text-fog">
                Create an account before adding a transaction.
              </p>
            </div>
            <Button
              render={<Link href="/dashboard/accounts" />}
              nativeButton={false}
            >
              Create an account
            </Button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="type">Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as TransactionType)}>
                <SelectTrigger id="type" className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Expense">Expense</SelectItem>
                  <SelectItem value="Income">Income</SelectItem>
                  <SelectItem value="Transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={!!errors.amount}
              />
              {errors.amount && (
                <p className="text-xs text-destructive">{errors.amount}</p>
              )}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="account">Account</Label>
            <Select
              value={accountId}
              onValueChange={(value) => value !== null && setAccountId(value)}
              items={(accounts ?? []).map((account) => ({
                value: account.id,
                label: account.name,
              }))}
            >
              <SelectTrigger id="account" className="w-full" aria-invalid={!!errors.accountId}>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {(accounts ?? []).map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.accountId && (
              <p className="text-xs text-destructive">{errors.accountId}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="category">Category</Label>
            <Select
              value={categoryId}
              onValueChange={(value) => value !== null && setCategoryId(value)}
              items={(categories ?? []).map((category) => ({
                value: category.id,
                label: category.name,
              }))}
            >
              <SelectTrigger id="category" className="w-full">
                <SelectValue>
                  {(value) => {
                    const cat = categories?.find((c) => c.id === value);
                    return cat ? (
                      <>
                        <CategoryIcon slug={cat.icon} className="h-4 w-4 text-fog" />
                        {cat.name}
                      </>
                    ) : (
                      "Select category (optional)"
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(categories ?? []).map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    <CategoryIcon slug={category.icon} className="h-4 w-4 text-fog" />
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={!!errors.date}
              />
              {errors.date && (
                <p className="text-xs text-destructive">{errors.date}</p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                type="text"
                placeholder="Notes or payee"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">
              {transaction ? "Save Changes" : "Add Transaction"}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
