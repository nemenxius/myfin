"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { MoreHorizontal, Pencil, Plus, Trash2, ArrowLeftRight, Tag, Repeat2, CalendarClock, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTransactions } from "@/hooks/use-transactions";
import { useRecurringTransactions, type RecurringTransaction } from "@/hooks/use-recurring-transactions";
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
import { useCategories } from "@/hooks/use-categories";
import { useAccounts } from "@/hooks/use-accounts";
import { CategoryIcon } from "@/components/categories/category-icons";
import { formatCurrency } from "@/lib/format";
import { monthLabel, monthWindow } from "@/lib/month";
import { buildLedger } from "@/lib/ledger";
import { isoToDateInput } from "@/lib/date";
import { cn } from "@/lib/utils";
import { TransactionForm, type EditScope } from "./transaction-form";
import type { Tables } from "@/types/database";

type Transaction = Tables<"transactions">;

const typeStyles: Record<string, string> = {
  income: "bg-leaf/10 text-leaf",
  expense: "bg-ember/10 text-ember",
  transfer: "bg-muted/50 text-muted-foreground",
};

const SCOPE_OPTIONS: {
  value: EditScope;
  label: string;
  icon: LucideIcon;
  editDescription: string;
  deleteDescription: string;
}[] = [
  {
    value: "occurrence",
    label: "This occurrence only",
    icon: Pencil,
    editDescription:
      "Change only this transaction. Future occurrences keep the original rule.",
    deleteDescription:
      "Delete only this transaction. Future occurrences remain.",
  },
  {
    value: "future",
    label: "This and future occurrences",
    icon: CalendarClock,
    editDescription:
      "Apply changes from this date onward. Earlier transactions stay as recorded.",
    deleteDescription:
      "Stop the series from this date. Earlier transactions stay as recorded.",
  },
  {
    value: "series",
    label: "Entire series",
    icon: Repeat2,
    editDescription:
      "Apply changes to the series from this date onward. Past rows are preserved.",
    deleteDescription:
      "Cancel the whole series. Existing transactions are kept.",
  },
];

interface ScopeDialogProps {
  open: boolean;
  mode: "edit" | "delete";
  value: EditScope;
  onValueChange: (scope: EditScope) => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

function ScopeDialog({
  open,
  mode,
  value,
  onValueChange,
  onConfirm,
  onOpenChange,
}: ScopeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "edit"
              ? "Edit recurring transaction"
              : "Delete recurring transaction"}
          </DialogTitle>
          <DialogDescription>
            Choose how far this {mode === "edit" ? "edit" : "delete"} applies.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {SCOPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={value === option.value}
              onClick={() => onValueChange(option.value)}
              className={cn(
                "flex items-start gap-3 rounded-xl border border-border/60 p-3 text-left transition-colors hover:bg-muted/40",
                value === option.value && "border-[#18848c] bg-[#18848c]/10"
              )}
            >
              <option.icon className="mt-0.5 h-4 w-4 shrink-0 text-fog" />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {option.label}
                </span>
                <span className="block text-xs text-fog">
                  {mode === "edit"
                    ? option.editDescription
                    : option.deleteDescription}
                </span>
              </span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={mode === "delete" ? "destructive" : undefined}
            onClick={onConfirm}
          >
            {mode === "edit" ? "Continue" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TransactionList({ month }: { month: string }) {
  const { data: transactions, isLoading, deleteTransaction } = useTransactions(month);
  const { data: recurringRules, deleteOccurrenceOnly, deleteFromOccurrence, cancelSeries } = useRecurringTransactions();
  const { currency } = usePrimaryCurrency();
  const { data: categories } = useCategories();
  const { data: accounts } = useAccounts();
  const monthName = monthLabel(month);

  const recurringRuleMap = useMemo(() => {
    const map = new Map<string, RecurringTransaction>();
    for (const rule of recurringRules ?? []) {
      map.set(rule.id, rule);
    }
    return map;
  }, [recurringRules]);

   const categoryMap = useMemo(() => {
     const map = new Map<string, { name: string; icon: string }>();
     for (const c of categories ?? []) {
       map.set(c.id, { name: c.name, icon: c.icon });
     }
     return map;
   }, [categories]);

   const accountMap = useMemo(() => {
     const map = new Map<string, string>();
     for (const a of accounts ?? []) {
       map.set(a.id, a.name);
     }
     return map;
   }, [accounts]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [editScope, setEditScope] = useState<EditScope>("occurrence");
  const [editRule, setEditRule] = useState<RecurringTransaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [scopeDialog, setScopeDialog] = useState<{
    mode: "edit" | "delete";
    transaction: Transaction;
  } | null>(null);
  const [pendingScope, setPendingScope] = useState<EditScope>("occurrence");

  const rows = useMemo(() => {
    if (!transactions) return [];
    return buildLedger(transactions, month);
  }, [transactions, month]);

  const defaultDate = useMemo(() => {
    const currentMonth = format(new Date(), "yyyy-MM");
    if (month === currentMonth) {
      return format(new Date(), "yyyy-MM-dd");
    }
    const { start } = monthWindow(month);
    return format(start, "yyyy-MM-dd");
  }, [month]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (transaction: Transaction) => {
    if (transaction.recurring_transaction_id) {
      setPendingScope("occurrence");
      setScopeDialog({ mode: "edit", transaction });
      return;
    }
    setEditing(transaction);
    setFormOpen(true);
  };

  const openDelete = (transaction: Transaction) => {
    if (transaction.recurring_transaction_id) {
      setPendingScope("occurrence");
      setScopeDialog({ mode: "delete", transaction });
      return;
    }
    setDeleting(transaction);
  };

  const confirmScope = () => {
    if (!scopeDialog) return;
    const { mode, transaction } = scopeDialog;
    const scope = pendingScope;

    if (mode === "edit") {
      setEditScope(scope);
      setEditRule(
        transaction.recurring_transaction_id
          ? recurringRuleMap.get(transaction.recurring_transaction_id) ?? null
          : null
      );
      setEditing(transaction);
      setFormOpen(true);
    } else if (transaction.recurring_transaction_id) {
      const recurringTransactionId = transaction.recurring_transaction_id;
      const occurrenceDate = isoToDateInput(transaction.date);
      if (scope === "occurrence") {
        deleteOccurrenceOnly.mutate({
          recurringTransactionId,
          occurrenceDate,
          transactionId: transaction.id,
        });
      } else if (scope === "future") {
        deleteFromOccurrence.mutate({
          recurringTransactionId,
          effectiveDate: occurrenceDate,
        });
      } else {
        cancelSeries.mutate(recurringTransactionId);
      }
    }

    setScopeDialog(null);
  };

  const confirmDelete = () => {
    if (deleting) {
      deleteTransaction.mutate(deleting.id);
    }
    setDeleting(null);
  };

  return (
    <Card className="border-border/50 bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="font-display text-xl font-medium text-foreground">
            This Month Activity
          </CardTitle>
          <p className="mt-0.5 text-xs text-fog">
            {monthName} — every movement, with the balance after each line.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus />
          Add Transaction
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : !transactions || transactions.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <p>No transactions yet.</p>
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus />
              Add your first
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <p>No transactions in {monthName}.</p>
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus />
              Add transaction
            </Button>
          </div>
        ) : (
          <>
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((transaction) => (
                <TableRow
                  key={transaction.id}
                  className="transition-colors hover:bg-muted/40"
                >
                  <TableCell className="whitespace-nowrap text-fog">
                    {format(new Date(transaction.date), "MMM d, yyyy")}
                  </TableCell>
                    <TableCell className="text-foreground">
                      {transaction.transaction_type === "Transfer" &&
                      transaction.to_account_id ? (
                        <span className="flex items-center gap-1.5">
                          <ArrowLeftRight className="h-4 w-4" />
                          {accountMap.get(transaction.to_account_id) ??
                            transaction.to_account_id}
                        </span>
                      ) : transaction.category_id ? (
                        <span className="flex items-center gap-1.5">
                          <CategoryIcon
                            slug={
                              categoryMap.get(transaction.category_id)?.icon ??
                              "Tag"
                            }
                            className="h-4 w-4"
                          />
                          {categoryMap.get(transaction.category_id)?.name ??
                            transaction.category_id}
                        </span>
                      ) : (
                        "Untitled"
                      )}
                    </TableCell>
                  <TableCell className="text-foreground">
                    <span className="flex items-center gap-1.5">
                      {transaction.description ?? "Untitled"}
                      {transaction.recurring_transaction_id && (
                        <Repeat2
                          className="h-3.5 w-3.5 shrink-0 text-fog"
                          aria-label="Recurring transaction"
                        />
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge
                      variant="outline"
                      className={
                        typeStyles[transaction.transaction_type] ??
                        "bg-muted/50 text-muted-foreground"
                      }
                    >
                      {transaction.transaction_type}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono tabular-nums ${
                      transaction.amount >= 0 ? "text-leaf" : "text-ember"
                    }`}
                  >
                    {transaction.amount >= 0 ? "+" : "−"}
                    {formatCurrency(Math.abs(transaction.amount), currency)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-foreground">
                    {formatCurrency(transaction.balance, currency)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" />}
                        aria-label="Transaction actions"
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => openEdit(transaction)}>
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleting(transaction)}
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>

          <ul className="space-y-2 md:hidden">
            {rows.map((transaction) => (
              <li
                key={transaction.id}
                className="rounded-xl border border-border/60 bg-card p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                      {transaction.transaction_type === "Transfer" &&
                      transaction.to_account_id ? (
                        <ArrowLeftRight className="h-4 w-4" />
                      ) : (
                        <CategoryIcon
                          slug={
                            categoryMap.get(transaction.category_id ?? "")?.icon ??
                            "Tag"
                          }
                          className="h-4 w-4"
                        />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="truncate text-sm font-medium text-foreground">
                          {transaction.transaction_type === "Transfer" &&
                          transaction.to_account_id
                            ? `Transfer to ${
                                accountMap.get(transaction.to_account_id) ??
                                transaction.to_account_id
                              }`
                            : (categoryMap.get(transaction.category_id ?? "")?.name ??
                              "Untitled")}
                        </p>
                        {transaction.recurring_transaction_id && (
                          <Repeat2
                            className="h-3.5 w-3.5 shrink-0 text-fog"
                            aria-label="Recurring transaction"
                          />
                        )}
                      </div>
                      {transaction.description && (
                        <p className="truncate text-xs text-fog">
                          {transaction.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <span
                      className={`font-mono text-sm font-semibold tabular-nums ${
                        transaction.amount >= 0 ? "text-leaf" : "text-ember"
                      }`}
                    >
                      {transaction.amount >= 0 ? "+" : "−"}
                      {formatCurrency(Math.abs(transaction.amount), currency)}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" />}
                        aria-label="Transaction actions"
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(transaction)}>
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => openDelete(transaction)}
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/50 pt-2 text-xs text-fog">
                  <span className="truncate">
                    {format(new Date(transaction.date), "MMM d, yyyy")} ·{" "}
                    {accountMap.get(transaction.account_id) ?? "Account"}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                    Bal {formatCurrency(transaction.balance, currency)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          </>
        )}
      </CardContent>

      <TransactionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        transaction={editing}
        defaultDate={defaultDate}
        editScope={editScope}
        recurringRule={editRule}
      />

      <ScopeDialog
        open={!!scopeDialog}
        mode={scopeDialog?.mode ?? "edit"}
        value={pendingScope}
        onValueChange={setPendingScope}
        onConfirm={confirmScope}
        onOpenChange={(open) => !open && setScopeDialog(null)}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently remove the
              transaction from your records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
