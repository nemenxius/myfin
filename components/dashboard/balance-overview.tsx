"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTransactions } from "@/hooks/use-transactions";
import { formatCurrency } from "@/lib/format";
import { TrendingDown, TrendingUp, Wallet } from "lucide-react";

export function BalanceOverview() {
  const { data: transactions, isLoading } = useTransactions();

  const income = (transactions ?? [])
    .filter((transaction) => transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const expense = (transactions ?? [])
    .filter((transaction) => transaction.amount < 0)
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);

  const total = income - expense;

  const cards = [
    {
      title: "Total",
      value: total,
      icon: Wallet,
      className: "text-muted-foreground",
    },
    {
      title: "Income",
      value: income,
      icon: TrendingUp,
      className: "text-emerald-600",
    },
    {
      title: "Expense",
      value: expense,
      icon: TrendingDown,
      className: "text-red-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {card.title}
            </CardTitle>
            <card.icon className={`h-4 w-4 ${card.className}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {isLoading ? "..." : formatCurrency(card.value)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}