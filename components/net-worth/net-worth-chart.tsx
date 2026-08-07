"use client";

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
import { useNetWorth } from "@/hooks/use-net-worth";
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
import { formatCurrency, getCurrencySymbol } from "@/lib/format";

interface ChartPoint {
  label: string;
  value: number;
  assets: number;
  liabilities: number;
}

function ChartTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  currency: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-muted-foreground">{point.label}</p>
      <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
        {formatCurrency(point.value, currency)}
      </p>
      <div className="mt-1 space-y-0.5 text-xs text-fog">
        <p>Assets {formatCurrency(point.assets, currency)}</p>
        <p>Liabilities {formatCurrency(point.liabilities, currency)}</p>
      </div>
    </div>
  );
}

export function NetWorthChart() {
  const { netWorthSeries, isLoading } = useNetWorth();
  const { currency } = usePrimaryCurrency();

  return (
    <Card className="border-border/50 bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="font-display text-base font-medium text-foreground">
          Net Worth Evolution
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : netWorthSeries.length === 0 ? (
          <div className="flex h-64 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            Your net worth history will appear here as you update your assets
            and liabilities.
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={netWorthSeries}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="netWorthFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--border)"
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  dy={6}
                  minTickGap={40}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{
                    fontSize: 12,
                    fill: "var(--muted-foreground)",
                    fontFamily: "var(--font-mono)",
                  }}
                  tickFormatter={(value: number) =>
                    `${getCurrencySymbol(currency)}${value}`
                  }
                  width={56}
                />
                <Tooltip
                  content={<ChartTooltip currency={currency} />}
                  cursor={{ stroke: "var(--chart-1)", strokeDasharray: "4 4" }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--chart-1)"
                  strokeWidth={2.5}
                  fill="url(#netWorthFill)"
                  activeDot={{ r: 5, fill: "var(--chart-1)", strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
