"use client";

import { useMemo } from "react";
import { startOfMonth, subMonths } from "date-fns";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccounts } from "@/hooks/use-accounts";
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
import { useCategories } from "@/hooks/use-categories";
import { useTransactions } from "@/hooks/use-transactions";
import { formatCurrency } from "@/lib/format";
import { CategoryIcon } from "@/components/categories/category-icons";

const DONUT_COLORS = ["#083458", "#18848c", "#0e7c5b", "#c0392b", "#2a9d9f", "#4a6a7d"];
const UNCATEGORIZED_CATEGORY_ID = "__myfin_uncategorized__";

export function SidePanel() {
  const { data: transactions, isLoading } = useTransactions();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const { currency } = usePrimaryCurrency();

  const { monthSpend, prevSpend, byCategory, accountRows } = useMemo(() => {
    const all = transactions ?? [];
    const now = new Date();
    const currentStart = startOfMonth(now).getTime();
    const prevStart = startOfMonth(subMonths(now, 1)).getTime();

    let monthSpend = 0;
    let prevSpend = 0;
    const catTotals = new Map<string, number>();
    for (const t of all) {
      if (t.amount >= 0) continue;
      const ts = new Date(t.date).getTime();
      const abs = Math.abs(t.amount);
      if (ts >= currentStart) {
        monthSpend += abs;
        const categoryId = t.category_id ?? UNCATEGORIZED_CATEGORY_ID;
        catTotals.set(categoryId, (catTotals.get(categoryId) ?? 0) + abs);
      } else if (ts >= prevStart) {
        prevSpend += abs;
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

    const totals = new Map<string, number>();
    for (const t of all) {
      totals.set(t.account_id, (totals.get(t.account_id) ?? 0) + t.amount);
    }
    const accountRows = (accounts ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
      balance: a.initial_balance + (totals.get(a.id) ?? 0),
    }));

    return { monthSpend, prevSpend, byCategory, accountRows };
  }, [transactions, accounts, categories]);

  const spendPct =
    prevSpend > 0 ? Math.min(100, (monthSpend / prevSpend) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-border/50 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-base font-medium text-ink">
            Spending this month
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-2xl font-medium tabular-nums text-ember">
            {isLoading ? "…" : formatCurrency(monthSpend, currency)}
          </p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[#18848c]"
              style={{ width: `${spendPct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-fog">
            {prevSpend > 0
              ? `${spendPct.toFixed(0)}% of last month's spending`
              : "No spending last month"}
          </p>
        </CardContent>
      </Card>

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

      <Card className="border-border/50 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-base font-medium text-ink">
            Accounts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-fog">…</p>
          ) : accountRows.length === 0 ? (
            <p className="text-sm text-fog">No accounts yet.</p>
          ) : (
            <ul className="space-y-2">
              {accountRows.map((account) => (
                <li
                  key={account.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-ink">{account.name}</span>
                  <span className="font-mono tabular-nums text-ink">
                    {formatCurrency(account.balance, account.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
