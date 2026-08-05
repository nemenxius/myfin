"use client";

import { useMemo, type ComponentProps } from "react";
import {
  Landmark,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Wallet,
  Percent,
} from "lucide-react";
import { useAccounts } from "@/hooks/use-accounts";
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
import { useTransactions } from "@/hooks/use-transactions";
import { formatCurrency } from "@/lib/format";
import { monthLabel, monthWindow } from "@/lib/month";
import { StatCard } from "./stat-card";

export function StatCards({ month }: { month: string }) {
  const { data: transactions, isLoading } = useTransactions();
  const { data: accounts } = useAccounts();
  const { currency } = usePrimaryCurrency();

  const stats = useMemo(() => {
    const all = transactions ?? [];
    const income = all
      .filter((t) => t.amount > 0)
      .reduce((s, t) => s + t.amount, 0);
    const expense = all
      .filter((t) => t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const net = income - expense;

    const { start, end } = monthWindow(month);
    const startTs = start.getTime();
    const endTs = end.getTime();

    let monthIncome = 0;
    let monthExpense = 0;
    for (const t of all) {
      const ts = new Date(t.date).getTime();
      if (ts >= startTs && ts < endTs) {
        if (t.amount > 0) monthIncome += t.amount;
        else monthExpense += Math.abs(t.amount);
      }
    }
    const monthNet = monthIncome - monthExpense;
    const savingsRate = monthIncome > 0 ? (monthNet / monthIncome) * 100 : 0;

    const accountTotals = new Map<string, number>();
    for (const t of all) {
      accountTotals.set(
        t.account_id,
        (accountTotals.get(t.account_id) ?? 0) + t.amount
      );
    }
    const totalBalance = (accounts ?? []).reduce(
      (s, a) => s + a.initial_balance + (accountTotals.get(a.id) ?? 0),
      0
    );

    return {
      net,
      savingsRate,
      monthIncome,
      monthExpense,
      monthNet,
      totalBalance,
    };
  }, [transactions, accounts, month]);

  const monthName = monthLabel(month);

  const cards: ComponentProps<typeof StatCard>[] = [
    {
      label: "Net position",
      value: formatCurrency(stats.net, currency),
      icon: Wallet,
      delta: stats.net >= 0 ? "Net positive" : "Net negative",
      deltaTone: stats.net >= 0 ? "positive" : "negative",
    },
    {
      label: "Savings rate",
      value: `${stats.savingsRate.toFixed(1)}%`,
      icon: Percent,
      delta: monthName,
    },
    {
      label: "Income",
      value: formatCurrency(stats.monthIncome, currency),
      icon: TrendingUp,
      delta: monthName,
      deltaTone: "neutral",
    },
    {
      label: "Spending",
      value: formatCurrency(stats.monthExpense, currency),
      icon: TrendingDown,
      delta: monthName,
      deltaTone: "neutral",
    },
    {
      label: "Net",
      value: formatCurrency(stats.monthNet, currency),
      icon: PiggyBank,
      delta: monthName,
      deltaTone: stats.monthNet >= 0 ? "positive" : "negative",
    },
    {
      label: "Combined balance",
      value: formatCurrency(stats.totalBalance, currency),
      icon: Landmark,
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