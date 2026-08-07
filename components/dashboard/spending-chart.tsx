"use client";

import { useMemo } from "react";
import { format, getDaysInMonth } from "date-fns";
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
import { monthWindow } from "@/lib/month";

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
    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
        {formatCurrency(payload[0].value, currency)}
      </p>
    </div>
  );
}

export function SpendingChart({ month }: { month: string }) {
  const { data: transactions, isLoading } = useTransactions();
  const { currency } = usePrimaryCurrency();

  const data = useMemo(() => {
    const { start, end } = monthWindow(month);
    const startTs = start.getTime();
    const endTs = end.getTime();
    const daysInMonth = getDaysInMonth(start);

    const byDay = new Map<number, number>();
    for (const transaction of transactions ?? []) {
      if (transaction.amount >= 0) continue;
      const ts = new Date(transaction.date).getTime();
      if (ts >= startTs && ts < endTs) {
        const day = new Date(transaction.date).getDate();
        byDay.set(day, (byDay.get(day) ?? 0) + Math.abs(transaction.amount));
      }
    }

    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      return {
        day: String(day),
        amount: byDay.get(day) ?? 0,
      };
    });
  }, [transactions, month]);

  return (
    <Card className="border-border/50 bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="font-display text-base font-medium text-foreground">
          Monthly spending
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : (
          <div className="h-64 w-full">
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
                stroke="hsl(var(--border))"
              />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                dy={6}
                interval={Math.max(1, Math.floor(data.length / 8))}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }}
                tickFormatter={(value: number) =>
                  `${getCurrencySymbol(currency)}${value}`
                }
                width={56}
              />
              <Tooltip
                content={<CustomTooltip currency={currency} />}
                cursor={{ stroke: "#18848c", strokeDasharray: "4 4" }}
                labelFormatter={(label) => {
                  const day = parseInt(String(label), 10);
                  const [year, monthIndex] = month.split("-").map(Number);
                  return format(new Date(year, monthIndex - 1, day), "MMM d, yyyy");
                }}
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