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
import { formatCurrency, getCurrencySymbol } from "@/lib/format";

function ChartTooltip({
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

export function HoldingPriceChart({
  symbol,
  points,
  currency,
}: {
  symbol: string;
  points: Array<{ date: string; close: number }>;
  currency: string;
}) {
  const data = points.map((point) => ({
    label: new Date(`${point.date.slice(0, 10)}T00:00:00`).toLocaleDateString(
      "en-US",
      { month: "short", day: "numeric" }
    ),
    close: point.close,
  }));

  return (
    <Card className="border-border/50 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="font-display text-base font-medium text-ink">
          {symbol} price history
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            No price history yet
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id={`priceFill-${symbol}`}
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
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  content={<ChartTooltip currency={currency} />}
                  cursor={{ stroke: "#18848c", strokeDasharray: "4 4" }}
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke="#083458"
                  strokeWidth={2.5}
                  fill={`url(#priceFill-${symbol})`}
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
