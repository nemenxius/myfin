"use client";

import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTransactions } from "@/hooks/use-transactions";
import { formatCurrency } from "@/lib/format";
import type { TransactionType } from "@/types/database";

const typeStyles: Record<TransactionType, string> = {
  income: "bg-emerald-100 text-emerald-700",
  expense: "bg-red-100 text-red-700",
  transfer: "bg-zinc-100 text-zinc-700",
};

export function TransactionList() {
  const { data: transactions, isLoading } = useTransactions();

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No transactions yet.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((transaction) => (
          <TableRow key={transaction.id}>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {format(new Date(transaction.date), "MMM d, yyyy")}
            </TableCell>
            <TableCell>
              {transaction.description ?? "Untitled"}
            </TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className={typeStyles[transaction.transaction_type]}
              >
                {transaction.transaction_type}
              </Badge>
            </TableCell>
            <TableCell
              className={`text-right font-medium ${
                transaction.amount >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {transaction.amount >= 0 ? "+" : "-"}
              {formatCurrency(Math.abs(transaction.amount))}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}