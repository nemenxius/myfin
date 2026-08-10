"use client";

import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCategories } from "@/hooks/use-categories";
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
import { useTransactions } from "@/hooks/use-transactions";
import { formatCurrency } from "@/lib/format";
import { monthWindow } from "@/lib/month";
import { CategoryIcon } from "@/components/categories/category-icons";

const DONUT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--leaf)",
  "var(--ember)",
  "var(--chart-4)",
  "var(--chart-5)",
];
const UNCATEGORIZED_CATEGORY_ID = "__myfin_uncategorized__";

export function SidePanel({ month }: { month: string }) {
  const { data: transactions, isLoading } = useTransactions();
  const { data: categories } = useCategories();
  const { currency } = usePrimaryCurrency();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const { monthSpend, byCategory } = useMemo(() => {
    const all = transactions ?? [];
    const { start, end } = monthWindow(month);
    const startTs = start.getTime();
    const endTs = end.getTime();

    let monthSpend = 0;
    const catTotals = new Map<string, number>();
    for (const t of all) {
      if (t.amount >= 0) continue;
      const ts = new Date(t.date).getTime();
      const abs = Math.abs(t.amount);
      if (ts >= startTs && ts < endTs) {
        monthSpend += abs;
        const categoryId = t.category_id ?? UNCATEGORIZED_CATEGORY_ID;
        catTotals.set(categoryId, (catTotals.get(categoryId) ?? 0) + abs);
      }
    }

    const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));
    const catIcon = new Map((categories ?? []).map((c) => [c.id, c.icon]));
    const byCategory = [...catTotals.entries()]
      .map(([id, amount]) => ({
        id,
        name: catName.get(id) ?? "Uncategorized",
        icon: catIcon.get(id) ?? null,
        amount,
      }))
      .sort((a, b) => b.amount - a.amount);

    return { monthSpend, byCategory };
  }, [transactions, categories, month]);

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-border/50 bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-base font-medium text-foreground">
            By category
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-fog">…</p>
          ) : byCategory.length === 0 ? (
            <p className="text-sm text-fog">No spending this month.</p>
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="h-28 w-28 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byCategory}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius={34}
                      outerRadius={52}
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
                            outerRadius={props.index === activeIndex ? 56 : 52}
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
                      {byCategory.map((entry, i) => (
                        <Cell
                          key={entry.id}
                          fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-2">
                {byCategory.slice(0, 3).map((entry, i) => {
                  const isActive = activeIndex === null || activeIndex === i;
                  return (
                    <li
                      key={entry.id}
                      onMouseEnter={() => setActiveIndex(i)}
                      onMouseLeave={() => setActiveIndex(null)}
                      className={`flex items-center justify-between gap-2 text-sm transition-opacity duration-200 ${
                        isActive ? "opacity-100" : "opacity-35"
                      }`}
                    >
                      <span
                        className={`flex items-center gap-2 ${
                          isActive ? "font-semibold text-foreground" : "text-foreground"
                        }`}
                      >
                        <span style={{ color: DONUT_COLORS[i % DONUT_COLORS.length] }}>
                          <CategoryIcon slug={entry.icon ?? "Tag"} className="h-4 w-4" />
                        </span>
                        {entry.name}
                      </span>
                      <span className="font-mono tabular-nums text-fog">
                        {formatCurrency(entry.amount, currency)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
