"use client";

import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNetWorth } from "@/hooks/use-net-worth";
import { useNetWorthCategories } from "@/hooks/use-net-worth-categories";
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
import { CategoryIcon } from "@/components/categories/category-icons";
import { formatCurrency } from "@/lib/format";
import { computeCategoryBreakdown } from "@/lib/net-worth/math";

const DONUT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--leaf)",
  "var(--ember)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function NetWorthCategoryBreakdown() {
  const { assets, isLoading } = useNetWorth();
  const { data: categories } = useNetWorthCategories();
  const { currency } = usePrimaryCurrency();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const rows = useMemo(() => {
    const map = new Map(
      (categories ?? []).map((c) => [c.id, { name: c.name, icon: c.icon }])
    );
    return computeCategoryBreakdown(assets, map).filter(
      (row) => row.amount > 0
    );
  }, [assets, categories]);

  return (
    <Card className="border-border/50 bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="font-display text-base font-medium text-foreground">
          Assets by category
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            Add an asset to see your breakdown by category.
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <div className="h-40 w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={rows}
                    dataKey="amount"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={74}
                    paddingAngle={2}
                    strokeWidth={0}
                    onMouseEnter={(_, index) => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(null)}
                    shape={(props) => {
                      const isActive =
                        activeIndex === null || props.index === activeIndex;
                      return (
                        <Sector
                          cx={props.cx}
                          cy={props.cy}
                          innerRadius={props.innerRadius}
                          outerRadius={props.index === activeIndex ? 78 : 74}
                          startAngle={props.startAngle}
                          endAngle={props.endAngle}
                          cornerRadius={props.cornerRadius}
                          fill={props.fill}
                          opacity={isActive ? 1 : 0.35}
                          className="transition-opacity duration-200"
                        />
                      );
                    }}
                  >
                    {rows.map((row, i) => (
                      <Cell
                        key={row.id}
                        fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="w-full flex-1 space-y-2">
              {rows.map((row, i) => {
                const isActive = activeIndex === null || activeIndex === i;
                return (
                  <li
                    key={row.id}
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseLeave={() => setActiveIndex(null)}
                    className={`flex items-center justify-between gap-3 text-sm transition-opacity duration-200 ${
                      isActive ? "opacity-100" : "opacity-35"
                    }`}
                  >
                    <span
                      className={`flex min-w-0 items-center gap-2 ${
                        isActive
                          ? "font-semibold text-foreground"
                          : "text-foreground"
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            DONUT_COLORS[i % DONUT_COLORS.length],
                        }}
                      />
                      <CategoryIcon
                        slug={row.icon}
                        className="h-4 w-4 shrink-0 text-fog"
                      />
                      <span className="truncate">{row.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="font-mono tabular-nums text-fog">
                        {formatCurrency(row.amount, currency)}
                      </span>
                      <span className="w-12 text-right font-mono tabular-nums text-foreground">
                        {row.percent.toFixed(1)}%
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
