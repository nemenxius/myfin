"use client";

import { useState } from "react";
import { format } from "date-fns";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import { formatCurrency } from "@/lib/format";
import { TransactionForm } from "./transaction-form";
import type { Tables } from "@/types/database";

type Transaction = Tables<"transactions">;

const typeStyles: Record<string, string> = {
  income: "bg-emerald-100 text-emerald-700",
  expense: "bg-red-100 text-red-700",
  transfer: "bg-zinc-100 text-zinc-700",
};

export function TransactionList() {
  const { data: transactions, isLoading, deleteTransaction } = useTransactions();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);

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
    <Card className="border-border/50 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Transactions</CardTitle>
        <Button onClick={openCreate}>
          <Plus />
          Add Transaction
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : !transactions || transactions.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            No transactions yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow
                  key={transaction.id}
                  className="transition-colors hover:bg-muted/40"
                >
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {format(new Date(transaction.date), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    {transaction.description ?? "Untitled"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        typeStyles[transaction.transaction_type] ??
                        "bg-zinc-100 text-zinc-700"
                      }
                    >
                      {transaction.transaction_type}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      transaction.amount >= 0
                        ? "text-emerald-600"
                        : "text-red-600"
                    }`}
                  >
                    {transaction.amount >= 0 ? "+" : "-"}
                    {formatCurrency(Math.abs(transaction.amount))}
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