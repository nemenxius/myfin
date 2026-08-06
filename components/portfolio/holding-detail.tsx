"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useHolding } from "@/hooks/use-portfolio";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HoldingPriceChart } from "./holding-price-chart";
import { HoldingTransactionsTable } from "./holding-transactions-table";
import { ASSET_TYPE_LABELS } from "./portfolio-types";

function changeClass(value: number): string {
  if (value > 0) return "text-leaf";
  if (value < 0) return "text-ember";
  return "text-fog";
}

export function HoldingDetail({ holdingId }: { holdingId: string }) {
  const { holding, isLoading } = useHolding(holdingId);

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!holding) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm font-medium text-ink">Holding not found</p>
        <Link
          href="/dashboard/portfolio"
          className="text-sm text-[#18848c] hover:underline"
        >
          Back to portfolio
        </Link>
      </div>
    );
  }

  const hasQuote = holding.quote !== null;
  const history = holding.chartHistory ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/portfolio"
          className="inline-flex items-center gap-1.5 text-sm text-fog transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Portfolio
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-medium text-ink">
              {holding.symbol}
            </h1>
            <Badge variant="outline" className="bg-[#eaf2f5] text-[#083458]">
              {ASSET_TYPE_LABELS[holding.asset_type] ?? holding.asset_type}
            </Badge>
          </div>
          {holding.name && (
            <p className="mt-1 text-sm text-fog">{holding.name}</p>
          )}
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-medium tabular-nums text-ink">
            {hasQuote
              ? formatCurrency(
                  holding.quote!.currentPrice,
                  holding.quote!.currency
                )
              : "—"}
          </p>
          {hasQuote && (
            <p
              className={cn(
                "mt-0.5 text-xs",
                changeClass(holding.quote!.change24h)
              )}
            >
              {holding.quote!.change24h >= 0 ? "+" : ""}
              {formatCurrency(holding.quote!.change24h, holding.quote!.currency)}
              {" · "}
              {holding.quote!.changePercent24h >= 0 ? "+" : ""}
              {holding.quote!.changePercent24h.toFixed(2)}%
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
            Shares
          </p>
          <p className="mt-1 font-mono text-xl font-medium tabular-nums text-ink">
            {holding.totalShares.toFixed(
              holding.totalShares % 1 === 0 ? 0 : 4
            )}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
            Avg cost
          </p>
          <p className="mt-1 font-mono text-xl font-medium tabular-nums text-ink">
            {formatCurrency(holding.avgPrice, holding.currency)}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
            Current value
          </p>
          <p className="mt-1 font-mono text-xl font-medium tabular-nums text-ink">
            {formatCurrency(holding.currentValue, holding.currency)}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
            Total return
          </p>
          <p
            className={cn(
              "mt-1 font-mono text-xl font-medium tabular-nums",
              changeClass(holding.totalChange)
            )}
          >
            {holding.totalChange >= 0 ? "+" : ""}
            {formatCurrency(holding.totalChange, holding.currency)}
          </p>
        </div>
      </div>

      <HoldingPriceChart
        symbol={holding.symbol}
        points={history}
        currency={holding.currency}
      />

      <HoldingTransactionsTable holding={holding} />
    </div>
  );
}
