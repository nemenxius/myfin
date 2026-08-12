"use client";

import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useNetWorth } from "@/hooks/use-net-worth";
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NetWorthSummary({ children }: { children?: ReactNode }) {
  const { totals, netWorth, monthDelta, assets, liabilities, isLoading } =
    useNetWorth();
  const { currency } = usePrimaryCurrency();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-border/50 bg-card p-5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
            Net Worth
          </p>
          <p className="mt-2 font-mono text-4xl font-medium tracking-tight text-foreground tabular-nums">
            {isLoading ? "—" : formatCurrency(netWorth, currency)}
          </p>
          {monthDelta ? (
            <p
              className={cn(
                "mt-2 text-sm",
                monthDelta.amount >= 0 ? "text-leaf" : "text-ember"
              )}
            >
              {monthDelta.amount >= 0 ? "+" : ""}
              {formatCurrency(monthDelta.amount, currency)} this month
            </p>
          ) : null}
        </Card>
        {children}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="border-border/50 bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
              Assets
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#18848c]/10">
              <TrendingUp className="h-3.5 w-3.5 text-[#18848c]" />
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-medium tracking-tight text-foreground tabular-nums">
            {isLoading ? "—" : formatCurrency(totals.totalAssets, currency)}
          </p>
          <p className="mt-1 text-xs text-fog">
            {assets.length} {assets.length === 1 ? "asset" : "assets"}
          </p>
        </Card>

        <Card className="border-border/50 bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
              Liabilities
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#c0392b]/10">
              <TrendingDown className="h-3.5 w-3.5 text-[#c0392b]" />
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-medium tracking-tight text-foreground tabular-nums">
            {isLoading ? "—" : formatCurrency(totals.totalLiabilities, currency)}
          </p>
          <p className="mt-1 text-xs text-fog">
            {liabilities.length}{" "}
            {liabilities.length === 1 ? "liability" : "liabilities"}
          </p>
        </Card>
      </div>
    </div>
  );
}
