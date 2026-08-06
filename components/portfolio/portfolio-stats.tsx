"use client";

import { Briefcase, Coins, TrendingDown, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { useHoldings } from "@/hooks/use-portfolio";
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
import { formatCurrency } from "@/lib/format";

function signedPercent(value: number | null): string | undefined {
  if (value == null) return undefined;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function PortfolioStats() {
  const { totals } = useHoldings();
  const { currency } = usePrimaryCurrency();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Portfolio value"
        value={formatCurrency(totals.totalValue, currency)}
        icon={Briefcase}
      />
      <StatCard
        label="Cost basis"
        value={formatCurrency(totals.totalCostBasis, currency)}
        icon={Coins}
      />
      <StatCard
        label="Total return"
        value={formatCurrency(totals.totalChange, currency)}
        icon={totals.totalChange >= 0 ? TrendingUp : TrendingDown}
        delta={signedPercent(totals.totalChangePercent)}
        deltaTone={totals.totalChange >= 0 ? "positive" : "negative"}
      />
      <StatCard
        label="24h change"
        value={formatCurrency(totals.dailyChange, currency)}
        icon={totals.dailyChange >= 0 ? TrendingUp : TrendingDown}
        delta={signedPercent(totals.dailyChangePercent)}
        deltaTone={totals.dailyChange >= 0 ? "positive" : "negative"}
      />
    </div>
  );
}