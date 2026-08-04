"use client";

import { startOfMonth, subMonths } from "date-fns";
import { ArrowDownRight, ArrowUpRight, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useTransactions } from "@/hooks/use-transactions";
import { formatCurrency } from "@/lib/format";

export function BalanceOverview() {
  const { data: transactions, isLoading } = useTransactions();

  const income = (transactions ?? [])
    .filter((transaction) => transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const expense = (transactions ?? [])
    .filter((transaction) => transaction.amount < 0)
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);

  const total = income - expense;

  const now = new Date();
  const currentStart = startOfMonth(now).getTime();
  const prevStart = startOfMonth(subMonths(now, 1)).getTime();

  let currentNet = 0;
  let prevNet = 0;
  for (const transaction of transactions ?? []) {
    const timestamp = new Date(transaction.date).getTime();
    if (timestamp >= currentStart) currentNet += transaction.amount;
    else if (timestamp >= prevStart) prevNet += transaction.amount;
  }

  const trendPct =
    prevNet !== 0
      ? ((currentNet - prevNet) / Math.abs(prevNet)) * 100
      : currentNet > 0
        ? 100
        : 0;
  const trendUp = trendPct >= 0;

  return (
    <div className="space-y-6">
      {/* Hero card */}
      <Card className="relative overflow-hidden border-primary/10 shadow-lg">
        <div
          className="absolute inset-0"
          style={{ background: "var(--brand-gradient)" }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "var(--brand-glow)" }}
        />
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 85% 15%, rgba(255,255,255,0.12), transparent 40%), radial-gradient(circle at 20% 90%, rgba(24,132,140,0.35), transparent 45%)",
          }}
        />
        <CardContent className="relative p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium uppercase tracking-wider text-white/70">
              Total Liquidity
            </p>
            <Wallet className="h-5 w-5 text-white/70" />
          </div>

          <div className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            {isLoading ? "..." : formatCurrency(total)}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur">
              {trendUp ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
              {Math.abs(trendPct).toFixed(1)}% vs last month
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur">
              {total >= 0 ? "Net positive" : "Net negative"} overall
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Income / Expense */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Card className="border-border/50 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Income</p>
              <div className="mt-2 text-2xl font-semibold text-emerald-600">
                {isLoading ? "..." : formatCurrency(income)}
              </div>
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </span>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Expense</p>
              <div className="mt-2 text-2xl font-semibold text-red-500">
                {isLoading ? "..." : formatCurrency(expense)}
              </div>
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50">
              <TrendingDown className="h-5 w-5 text-red-500" />
            </span>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}