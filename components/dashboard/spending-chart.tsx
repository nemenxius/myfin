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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTransactions } from "@/hooks/use-transactions";
import { formatCurrency } from "@/lib/format";

export function SpendingChart() {
  const { data: transactions, isLoading } = useTransactions();

  const data = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) =>
      startOfMonth(subMonths(now, 5 - i))
    );

    const byMonth = new Map<string, number>();
    for (const transaction of transactions ?? []) {
      if (transaction.amount >= 0) continue;
      const key = format(new Date(transaction.date), "yyyy-MM");
      byMonth.set(
        key,
        (byMonth.get(key) ?? 0) + Math.abs(transaction.amount)
      );
    }

    return months.map((month) => ({
      month: format(month, "MMM"),
      amount: byMonth.get(format(month, "yyyy-MM")) ?? 0,
    }));
  }, [transactions]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Spending</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={256}>
            <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="spendingFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
                tickFormatter={(value: number) => `$${value}`}
                width={48}
              />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                labelStyle={{ fontWeight: 600 }}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="hsl(var(--primary))"
                fill="url(#spendingFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}