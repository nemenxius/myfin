"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccounts } from "@/hooks/use-accounts";
import { useCategories } from "@/hooks/use-categories";
import { useProfile } from "@/hooks/use-profile";
import { useTransactions } from "@/hooks/use-transactions";
import { useRecurringTransactions } from "@/hooks/use-recurring-transactions";
import type { RecurringTransaction } from "@/hooks/use-recurring-transactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Landmark } from "lucide-react";
import { CategoryIcon } from "@/components/categories/category-icons";
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
import { dateInputToISO, isoToDateInput, isoToTimeInput } from "@/lib/date";

type Transaction = Tables<"transactions">;
type TransactionType = "Income" | "Expense" | "Transfer";
export type EditScope = "occurrence" | "future" | "series";

interface TransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction | null;
  defaultAccountId?: string;
  defaultDate?: string;
  /** Recurring-series edit scope; present only when editing an occurrence of a recurring rule. */
  editScope?: EditScope | null;
  /** The recurring rule being edited; used to prefill recurrence controls for future/series edits. */
  recurringRule?: RecurringTransaction | null;
}

interface FormErrors {
  amount?: string;
  accountId?: string;
  toAccountId?: string;
  date?: string;
  recurrenceEndDate?: string;
}

type RecurrenceKind = "never" | "interval" | "workday";
type RecurrenceUnit = "day" | "week" | "month" | "year";

interface RecurrenceOption {
  key: string;
  label: string;
  kind: RecurrenceKind;
  unit: RecurrenceUnit | null;
  interval: number | null;
}

const RECURRENCE_OPTIONS: RecurrenceOption[] = [
  { key: "never", label: "Never", kind: "never", unit: null, interval: null },
  { key: "day-1", label: "Every day", kind: "interval", unit: "day", interval: 1 },
  { key: "day-2", label: "Every 2 days", kind: "interval", unit: "day", interval: 2 },
  { key: "workday", label: "Every work day", kind: "workday", unit: null, interval: null },
  { key: "week-1", label: "Every week", kind: "interval", unit: "week", interval: 1 },
  { key: "week-2", label: "Every 2 weeks", kind: "interval", unit: "week", interval: 2 },
  { key: "week-3", label: "Every 3 weeks", kind: "interval", unit: "week", interval: 3 },
  { key: "week-4", label: "Every 4 weeks", kind: "interval", unit: "week", interval: 4 },
  { key: "month-1", label: "Every month", kind: "interval", unit: "month", interval: 1 },
  { key: "month-2", label: "Every 2 months", kind: "interval", unit: "month", interval: 2 },
  { key: "month-3", label: "Every 3 months", kind: "interval", unit: "month", interval: 3 },
  { key: "month-6", label: "Every 6 months", kind: "interval", unit: "month", interval: 6 },
  { key: "year-1", label: "Every year", kind: "interval", unit: "year", interval: 1 },
];

const optionForRule = (rule: Pick<RecurringTransaction, "recurrence_kind" | "recurrence_unit" | "recurrence_interval">): RecurrenceOption =>
  RECURRENCE_OPTIONS.find(
    (option) =>
      option.kind === rule.recurrence_kind &&
      option.unit === rule.recurrence_unit &&
      option.interval === rule.recurrence_interval
  ) ?? RECURRENCE_OPTIONS[0];

const today = () => isoToDateInput(new Date().toISOString());

export function TransactionForm({
  open,
  onOpenChange,
  transaction,
  defaultAccountId,
  defaultDate,
  editScope = null,
  recurringRule = null,
}: TransactionFormProps) {
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: categories } = useCategories();
  const { data: profile } = useProfile();
  const { addTransaction, updateTransaction } = useTransactions();
  const {
    createRecurringTransaction,
    editOccurrenceOnly,
    editFromOccurrence,
  } = useRecurringTransactions();

  const [type, setType] = useState<TransactionType>("Expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  // Recurrence state (structural, not a display string)
  const [recurrenceKey, setRecurrenceKey] = useState("never");
  const [endMode, setEndMode] = useState<"never" | "date">("never");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");

  const isRecurringEdit =
    !!transaction?.recurring_transaction_id && editScope !== null;
  const showRecurrence =
    !transaction || (isRecurringEdit && (editScope === "future" || editScope === "series"));

  const selectedOption = useMemo(
    () => RECURRENCE_OPTIONS.find((option) => option.key === recurrenceKey) ?? RECURRENCE_OPTIONS[0],
    [recurrenceKey]
  );

  useEffect(() => {
    if (!open) return;
    setErrors({});

    if (transaction) {
      setType(transaction.transaction_type as TransactionType);
      setAmount(String(Math.abs(transaction.amount)));
      setAccountId(transaction.account_id);
      setToAccountId(transaction.to_account_id ?? "");
      setCategoryId(transaction.category_id ?? "");
      setDate(isoToDateInput(transaction.date));
      setDescription(transaction.description ?? "");

      if (isRecurringEdit && (editScope === "future" || editScope === "series") && recurringRule) {
        const option = optionForRule(recurringRule);
        setRecurrenceKey(option.key);
        setEndMode(recurringRule.end_date ? "date" : "never");
        setRecurrenceEndDate(recurringRule.end_date ?? "");
      } else {
        setRecurrenceKey("never");
        setEndMode("never");
        setRecurrenceEndDate("");
      }
    } else {
      setType("Expense");
      setAmount("");
      setAccountId(defaultAccountId ?? profile?.default_account_id ?? "");
      setToAccountId("");
      setCategoryId(profile?.default_category_id ?? "");
      setDate(defaultDate ?? today());
      setDescription("");
      setRecurrenceKey("never");
      setEndMode("never");
      setRecurrenceEndDate("");
    }
  }, [open, transaction, defaultAccountId, defaultDate, profile?.default_account_id, profile?.default_category_id, isRecurringEdit, editScope, recurringRule]);

  const validate = (): boolean => {
    const next: FormErrors = {};
    const numericAmount = Number(amount);

    if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      next.amount = "Amount must be a number greater than 0.";
    }
    if (!accountId) {
      next.accountId = "Please select an account.";
    }
    if (type === "Transfer") {
      if (!toAccountId) {
        next.toAccountId = "Please select a destination account.";
      } else if (toAccountId === accountId) {
        next.toAccountId = "Destination account must differ from source account.";
      }
    }
    if (!date) {
      next.date = "Please select a date.";
    }
    // End dates are rule-level and can only be set when creating a rule;
    // versions that power "this and future"/series edits cannot carry them.
    if (!transaction && selectedOption.kind !== "never" && endMode === "date" && recurrenceEndDate) {
      const start = dateInputToISO(date);
      const end = dateInputToISO(recurrenceEndDate);
      if (new Date(end) < new Date(start)) {
        next.recurrenceEndDate = "End date must not be before the start date.";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;

    const signedAmount =
      type === "Expense" ? -Math.abs(Number(amount)) : Math.abs(Number(amount));

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const basePayload = {
      account_id: accountId,
      to_account_id: type === "Transfer" ? toAccountId : null,
      category_id: categoryId || null,
      amount: signedAmount,
      transaction_type: type,
      date: dateInputToISO(
        date,
        transaction ? isoToTimeInput(transaction.date) : currentTime
      ),
      description: description || null,
    };

    if (transaction) {
      if (isRecurringEdit) {
        const recurringTransactionId = transaction.recurring_transaction_id!;
        const occurrenceDate = isoToDateInput(transaction.date);
        const transactionUpdates = {
          account_id: accountId,
          to_account_id: type === "Transfer" ? toAccountId : null,
          category_id: categoryId || null,
          amount: signedAmount,
          transaction_type: type,
          description: description || null,
        };
        if (editScope === "occurrence") {
          editOccurrenceOnly.mutate({
            recurringTransactionId,
            occurrenceDate,
            transactionId: transaction.id,
            updates: transactionUpdates,
          });
        } else {
          editFromOccurrence.mutate({
            recurringTransactionId,
            effectiveDate: occurrenceDate,
            updates: {
              ...transactionUpdates,
              recurrence_kind: selectedOption.kind,
              recurrence_unit: selectedOption.unit,
              recurrence_interval: selectedOption.interval,
            },
          });
        }
      } else {
        updateTransaction.mutate({ id: transaction.id, ...basePayload });
      }
    } else {
      if (selectedOption.kind === "never") {
        addTransaction.mutate(basePayload);
      } else {
        createRecurringTransaction.mutate({
          account_id: accountId,
          to_account_id: type === "Transfer" ? toAccountId : null,
          category_id: categoryId || null,
          amount: signedAmount,
          transaction_type: type,
          description: description || null,
          start_date: date,
          end_date: endMode === "date" && recurrenceEndDate ? recurrenceEndDate : null,
          recurrence_kind: selectedOption.kind,
          recurrence_unit: selectedOption.unit,
          recurrence_interval: selectedOption.interval,
        });
      }
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
              <p className="text-sm font-medium text-foreground">No accounts yet</p>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

{type === "Transfer" ? (
           <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
             <div className="grid gap-1.5">
               <Label htmlFor="account-from">From</Label>
               <Select
                 value={accountId}
                 onValueChange={(value) => value !== null && setAccountId(value)}
                 items={(accounts ?? []).map((account) => ({
                   value: account.id,
                   label: account.name,
                 }))}
               >
                 <SelectTrigger id="account-from" className="w-full" aria-invalid={!!errors.accountId}>
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
               <Label htmlFor="account-to">To</Label>
               <Select
                 value={toAccountId}
                 onValueChange={(value) => value !== null && setToAccountId(value)}
                 items={(accounts ?? []).filter((a) => a.id !== accountId).map((account) => ({
                   value: account.id,
                   label: account.name,
                 }))}
               >
                 <SelectTrigger id="account-to" className="w-full" aria-invalid={!!errors.toAccountId}>
                   <SelectValue placeholder="Select account" />
                 </SelectTrigger>
                 <SelectContent>
                   {(accounts ?? []).filter((a) => a.id !== accountId).map((account) => (
                     <SelectItem key={account.id} value={account.id}>
                       {account.name}
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
               {errors.toAccountId && (
                 <p className="text-xs text-destructive">{errors.toAccountId}</p>
               )}
             </div>
           </div>
         ) : (
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
         )}

{type !== "Transfer" && (
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
         )}

<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-invalid={!!errors.date}
                  disabled={isRecurringEdit}
                />
                {errors.date && (
                  <p className="text-xs text-destructive">{errors.date}</p>
                )}
                {isRecurringEdit && (
                  <p className="text-xs text-fog">
                    Date is fixed for recurring transactions.
                  </p>
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

          {showRecurrence && (
            <div className="grid gap-3 rounded-xl border border-border/50 bg-muted/20 p-3">
              <div className={`grid grid-cols-1 gap-3 ${transaction ? "" : "sm:grid-cols-2"}`}>
                <div className="grid gap-1.5">
                  <Label htmlFor="recurrence">Recurrence</Label>
                  <Select
                    value={recurrenceKey}
                    onValueChange={(value) => {
                      if (value == null) return;
                      setRecurrenceKey(value);
                      if (value === "never") {
                        setEndMode("never");
                        setRecurrenceEndDate("");
                      }
                    }}
                  >
                    <SelectTrigger id="recurrence" className="w-full">
                      <SelectValue placeholder="Select recurrence" />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_OPTIONS.map((option) => (
                        <SelectItem key={option.key} value={option.key}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!transaction && selectedOption.kind !== "never" && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="recurrence-end">Ends</Label>
                    <Select
                      value={endMode}
                      onValueChange={(value) => {
                        if (value == null) return;
                        setEndMode(value as "never" | "date");
                        if (value === "never") setRecurrenceEndDate("");
                      }}
                    >
                      <SelectTrigger id="recurrence-end" className="w-full">
                        <SelectValue placeholder="Ends" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="never">Never</SelectItem>
                        <SelectItem value="date">On a date</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {!transaction && selectedOption.kind !== "never" && endMode === "date" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="recurrence-end-date">End date</Label>
                  <Input
                    id="recurrence-end-date"
                    type="date"
                    value={recurrenceEndDate}
                    onChange={(e) => setRecurrenceEndDate(e.target.value)}
                    aria-invalid={!!errors.recurrenceEndDate}
                  />
                  {errors.recurrenceEndDate && (
                    <p className="text-xs text-destructive">{errors.recurrenceEndDate}</p>
                  )}
                </div>
              )}
            </div>
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
              {transaction ? "Save Changes" : "Add Transaction"}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
