"use client";

import { startOfMonth } from "date-fns";
import { CalendarDays } from "lucide-react";
import { useTransactions } from "@/hooks/use-transactions";
import { formatCurrency } from "@/lib/format";

export function InsightBanner() {
  const { data: transactions, isLoading } = useTransactions();

  const now = new Date();
  const currentStart = startOfMonth(now).getTime();

  let monthSpend = 0;
  for (const transaction of transactions ?? []) {
    if (
      transaction.amount < 0 &&
      new Date(transaction.date).getTime() >= currentStart
    ) {
      monthSpend += Math.abs(transaction.amount);
    }
  }

  return (
    <div className="relative z-10 mx-4 -mt-5 sm:mx-8">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-white px-5 py-3.5 shadow-lg shadow-[#083458]/10">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#18848c]/10">
            <CalendarDays className="h-4 w-4 text-[#18848c]" />
          </span>
          <p className="text-sm text-ink">Spending this month</p>
        </div>
        <p className="font-mono text-lg font-semibold tabular-nums text-ember">
          {isLoading ? "…" : formatCurrency(monthSpend)}
        </p>
      </div>
    </div>
  );
}
