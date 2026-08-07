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
    <div className="rounded-lg border border-border/60 bg-white/90 px-3 py-2 shadow-md backdrop-blur">
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
    <Card className="border-border/50 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="font-display text-base font-medium text-ink">
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
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#6c7a83" }}
                  dy={6}
                  minTickGap={40}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{
                    fontSize: 12,
                    fill: "#6c7a83",
                    fontFamily: "var(--font-mono)",
                  }}
                  tickFormatter={(value: number) =>
                    `${getCurrencySymbol(currency)}${value}`
                  }
                  width={56}
                />
                <Tooltip
                  content={<ChartTooltip currency={currency} />}
                  cursor={{ stroke: "#18848c", strokeDasharray: "4 4" }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#083458"
                  strokeWidth={2.5}
                  fill="url(#netWorthFill)"
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
