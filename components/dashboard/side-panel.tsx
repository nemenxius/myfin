"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCategories } from "@/hooks/use-categories";
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
import { useTransactions } from "@/hooks/use-transactions";
import { formatCurrency } from "@/lib/format";
import { monthWindow } from "@/lib/month";
import { CategoryIcon } from "@/components/categories/category-icons";

const DONUT_COLORS = ["#083458", "#18848c", "#0e7c5b", "#c0392b", "#2a9d9f", "#4a6a7d"];
const UNCATEGORIZED_CATEGORY_ID = "__myfin_uncategorized__";

export function SidePanel({ month }: { month: string }) {
  const { data: transactions, isLoading } = useTransactions();
  const { data: categories } = useCategories();
  const { currency } = usePrimaryCurrency();

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
      <Card className="border-border/50 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-base font-medium text-ink">
            By category
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-fog">…</p>
          ) : byCategory.length === 0 ? (
            <p className="text-sm text-fog">No spending this month.</p>
          ) : (
            <div className="flex items-center gap-4">
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
                {byCategory.slice(0, 3).map((entry, i) => (
                  <li key={entry.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 text-ink">
                      <span style={{ color: DONUT_COLORS[i % DONUT_COLORS.length] }}>
                        <CategoryIcon slug={entry.icon ?? "Tag"} className="h-4 w-4" />
                      </span>
                      {entry.name}
                    </span>
                    <span className="font-mono tabular-nums text-fog">
                      {formatCurrency(entry.amount, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
