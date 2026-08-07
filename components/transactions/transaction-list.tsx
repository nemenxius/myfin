"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { MoreHorizontal, Pencil, Plus, Trash2, ArrowLeftRight } from "lucide-react";
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
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
import { useCategories } from "@/hooks/use-categories";
import { useAccounts } from "@/hooks/use-accounts";
import { CategoryIcon } from "@/components/categories/category-icons";
import { formatCurrency } from "@/lib/format";
import { monthLabel, monthWindow } from "@/lib/month";
import { buildLedger } from "@/lib/ledger";
import { TransactionForm } from "./transaction-form";
import type { Tables } from "@/types/database";

type Transaction = Tables<"transactions">;

const typeStyles: Record<string, string> = {
  income: "bg-leaf/10 text-leaf",
  expense: "bg-ember/10 text-ember",
  transfer: "bg-muted/50 text-muted-foreground",
};

export function TransactionList({ month }: { month: string }) {
   const { data: transactions, isLoading, deleteTransaction } = useTransactions();
   const { currency } = usePrimaryCurrency();
   const { data: categories } = useCategories();
   const { data: accounts } = useAccounts();
   const monthName = monthLabel(month);

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
  const [deleting, setDeleting] = useState<Transaction | null>(null);

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
    setEditing(transaction);
    setFormOpen(true);
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
                    {transaction.description ?? "Untitled"}
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
        )}
      </CardContent>

      <TransactionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        transaction={editing}
        defaultDate={defaultDate}
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