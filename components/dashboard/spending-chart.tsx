"use client";

import { useMemo } from "react";
import { format, startOfMonth, subMonths } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTransactions } from "@/hooks/use-transactions";
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
import { formatCurrency, getCurrencySymbol } from "@/lib/format";

function CustomTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  currency: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-white/90 px-3 py-2 shadow-md backdrop-blur">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
        {formatCurrency(payload[0].value, currency)}
      </p>
    </div>
  );
}

export function SpendingChart() {
  const { data: transactions, isLoading } = useTransactions();
  const { currency } = usePrimaryCurrency();

  const data = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) =>
      startOfMonth(subMonths(now, 5 - i))
    );

    const byMonth = new Map<string, number>();
    for (const transaction of transactions ?? []) {
      if (transaction.amount >= 0) continue;
      if (transaction.transaction_type === "Transfer") continue;
      const key = format(new Date(transaction.date), "yyyy-MM");
      byMonth.set(key, (byMonth.get(key) ?? 0) + Math.abs(transaction.amount));
    }

    return months.map((month) => ({
      month: format(month, "MMM"),
      amount: byMonth.get(format(month, "yyyy-MM")) ?? 0,
    }));
  }, [transactions]);

  return (
    <Card className="h-full border-border/50 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="font-display text-base font-medium text-ink">
          Monthly spending
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : (
          <div className="min-h-0 w-full flex-1">
            <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="spendingFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#18848c" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#083458" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e6eaee"
              />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "#6c7a83" }}
                dy={6}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "#6c7a83", fontFamily: "var(--font-mono)" }}
                tickFormatter={(value: number) =>
                  `${getCurrencySymbol(currency)}${value}`
                }
                width={56}
              />
              <Tooltip
                content={<CustomTooltip currency={currency} />}
                cursor={{ stroke: "#18848c", strokeDasharray: "4 4" }}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="#083458"
                strokeWidth={2.5}
                fill="url(#spendingFill)"
                activeDot={{ r: 5, fill: "#18848c", strokeWidth: 0 }}
              />
            </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}