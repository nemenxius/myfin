"use client";

import { useMemo } from "react";
import { startOfMonth, subMonths } from "date-fns";
import {
  Landmark,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Wallet,
  Percent,
} from "lucide-react";
import { useAccounts } from "@/hooks/use-accounts";
import { useTransactions } from "@/hooks/use-transactions";
import { formatCurrency } from "@/lib/format";
import { StatCard } from "./stat-card";

export function StatCards() {
  const { data: transactions, isLoading } = useTransactions();
  const { data: accounts } = useAccounts();

  const stats = useMemo(() => {
    const all = transactions ?? [];
    const income = all
      .filter((t) => t.amount > 0)
      .reduce((s, t) => s + t.amount, 0);
    const expense = all
      .filter((t) => t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const net = income - expense;
    const savingsRate = income > 0 ? (net / income) * 100 : 0;

    const now = new Date();
    const currentStart = startOfMonth(now).getTime();
    const prevStart = startOfMonth(subMonths(now, 1)).getTime();

    let monthIncome = 0;
    let monthExpense = 0;
    let prevExpense = 0;
    for (const t of all) {
      const ts = new Date(t.date).getTime();
      if (ts >= currentStart) {
        if (t.amount > 0) monthIncome += t.amount;
        else monthExpense += Math.abs(t.amount);
      } else if (ts >= prevStart && t.amount < 0) {
        prevExpense += Math.abs(t.amount);
      }
    }
    const monthNet = monthIncome - monthExpense;

    const totalBalance = (accounts ?? []).reduce(
      (s, a) => s + a.initial_balance,
      0
    );

    return {
      net,
      savingsRate,
      monthIncome,
      monthExpense,
      monthNet,
      accountCount: (accounts ?? []).length,
      totalBalance,
      prevExpense,
    };
  }, [transactions, accounts]);

  const spendDelta =
    stats.prevExpense > 0
      ? ((stats.monthExpense - stats.prevExpense) / stats.prevExpense) * 100
      : 0;

  const cards = [
    {
      label: "Net position",
      value: formatCurrency(stats.net),
      icon: Wallet,
      delta: stats.net >= 0 ? "Net positive" : "Net negative",
      deltaTone: stats.net >= 0 ? "positive" : "negative" as const,
    },
    {
      label: "Savings rate",
      value: `${stats.savingsRate.toFixed(1)}%`,
      icon: Percent,
      delta: "of income saved",
    },
    {
      label: "Income · this month",
      value: formatCurrency(stats.monthIncome),
      icon: TrendingUp,
      deltaTone: "positive" as const,
    },
    {
      label: "Spending · this month",
      value: formatCurrency(stats.monthExpense),
      icon: TrendingDown,
      delta: `${Math.abs(spendDelta).toFixed(1)}% vs last month`,
      deltaTone: spendDelta <= 0 ? "positive" : "negative" as const,
    },
    {
      label: "This month's net",
      value: formatCurrency(stats.monthNet),
      icon: PiggyBank,
      deltaTone: stats.monthNet >= 0 ? "positive" : "negative" as const,
    },
    {
      label: "Accounts",
      value: `${stats.accountCount} · ${formatCurrency(stats.totalBalance)}`,
      icon: Landmark,
      delta: "combined balance",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <StatCard
          key={card.label}
          label={card.label}
          value={isLoading ? "…" : card.value}
          icon={card.icon}
          delta={card.delta}
          deltaTone={card.deltaTone}
        />
      ))}
    </div>
  );
}