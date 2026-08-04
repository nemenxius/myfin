"use client";

import { startOfMonth, subMonths } from "date-fns";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
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
    <section className="relative overflow-hidden rounded-2xl bg-[#083458] text-white shadow-xl">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--brand-glow)" }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20"
        aria-hidden
      />

      <div className="relative px-6 py-8 sm:px-10 sm:py-10">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/50">
            Statement · Net position
          </p>
          <span className="text-[11px] uppercase tracking-wider text-white/40">
            All time
          </span>
        </div>

        <div className="mt-6 font-mono text-4xl font-medium tracking-tight text-white tabular-nums sm:text-6xl">
          {isLoading ? "…" : formatCurrency(total)}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-6 border-t border-white/10 pt-6 sm:max-w-md">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/45">
              Income
            </p>
            <p className="mt-1.5 font-mono text-base font-medium tabular-nums text-emerald-300 sm:text-lg">
              {isLoading ? "…" : formatCurrency(income)}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/45">
              Spending
            </p>
            <p className="mt-1.5 font-mono text-base font-medium tabular-nums text-red-300 sm:text-lg">
              {isLoading ? "…" : formatCurrency(expense)}
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
            {trendUp ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {Math.abs(trendPct).toFixed(1)}% vs last month
          </span>
          <span className="text-xs text-white/50">
            {total >= 0 ? "Net positive" : "Net negative"} overall
          </span>
        </div>
      </div>
    </section>
  );
}
