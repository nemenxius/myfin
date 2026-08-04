# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's large navy "jumbotron" with a clean, data-dense fintech layout: a responsive row of six stat cards, a chart + side-panel grid, and a full-width ledger.

**Architecture:** All data is computed client-side from the existing `useTransactions` and `useAccounts` TanStack Query hooks — no schema or data-layer changes. New presentational components (`stat-card`, `stat-cards`, `side-panel`) compose the page; the old `balance-overview` and `insight-banner` are removed.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4, TanStack Query v5, Recharts, date-fns, Lucide, Shadcn/Base UI primitives.

## Global Constraints

- No database/schema changes; no changes to transaction/account CRUD hooks.
- All money figures use `font-mono tabular-nums` and `formatCurrency` from `lib/format.ts`.
- Brand palette tokens from `app/globals.css`: navy `#083458`, teal `#18848C`, leaf `#0E7C5B`, ember `#C0392B`, paper `#F4F5F3`, ink `#0B1C28`, fog `#6C7A83`.
- Use existing Shadcn primitives in `components/ui/` (e.g. `Card`) over hand-rolled markup.
- No test framework exists in this repo. Verification is `npm run build` (type-checks) and `npm run lint`. Run both after each task.
- `amount` is NUMERIC: positive = income, negative = expense.
- Follow existing component conventions: `"use client"` at top, named exports, `cn()` from `lib/utils`.

---

### Task 1: Stat card component

**Files:**
- Create: `components/dashboard/stat-card.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`, Lucide icon type `LucideIcon`.
- Produces: `StatCard` — a presentational card used by Task 2.

- [ ] **Step 1: Create the component**

Create `components/dashboard/stat-card.tsx`:

```tsx
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  delta?: string;
  deltaTone?: "positive" | "negative" | "neutral";
  children?: React.ReactNode;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  deltaTone = "neutral",
  children,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border/60 bg-white p-4 shadow-sm transition-shadow hover:shadow-md",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
          {label}
        </span>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#18848c]/10">
          <Icon className="h-3.5 w-3.5 text-[#18848c]" />
        </span>
      </div>
      <p className="font-mono text-2xl font-medium tracking-tight text-ink tabular-nums">
        {value}
      </p>
      {delta ? (
        <p
          className={cn(
            "text-xs",
            deltaTone === "positive" && "text-leaf",
            deltaTone === "negative" && "text-ember",
            deltaTone === "neutral" && "text-fog"
          )}
        >
          {delta}
        </p>
      ) : null}
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/stat-card.tsx
git commit -m "feat: add StatCard dashboard component"
```

---

### Task 2: Stat cards row (replaces jumbotron)

**Files:**
- Create: `components/dashboard/stat-cards.tsx`
- Delete: `components/dashboard/balance-overview.tsx`

**Interfaces:**
- Consumes: `StatCard` from `./stat-card`, `useTransactions` from `@/hooks/use-transactions`, `useAccounts` from `@/hooks/use-accounts`, `formatCurrency` from `@/lib/format`, `startOfMonth`/`subMonths` from `date-fns`, Lucide icons.
- Produces: `StatCards` — the top row of six cards, used by Task 5 in `app/dashboard/page.tsx`.

- [ ] **Step 1: Create the component**

Create `components/dashboard/stat-cards.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { startOfMonth, subMonths } from "date-fns";
import {
  Landmark,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Wallet,
  Percent,
} from "lucide-react";
import { useAccounts } from "@/hooks/use-accounts";
import { useTransactions } from "@/hooks/use-transactions";
import { formatCurrency } from "@/lib/format";
import { StatCard } from "./stat-card";

export function StatCards() {
  const { data: transactions, isLoading } = useTransactions();
  const { data: accounts } = useAccounts();

  const stats = useMemo(() => {
    const all = transactions ?? [];
    const income = all
      .filter((t) => t.amount > 0)
      .reduce((s, t) => s + t.amount, 0);
    const expense = all
      .filter((t) => t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const net = income - expense;
    const savingsRate = income > 0 ? (net / income) * 100 : 0;

    const now = new Date();
    const currentStart = startOfMonth(now).getTime();
    const prevStart = startOfMonth(subMonths(now, 1)).getTime();

    let monthIncome = 0;
    let monthExpense = 0;
    let prevExpense = 0;
    for (const t of all) {
      const ts = new Date(t.date).getTime();
      if (ts >= currentStart) {
        if (t.amount > 0) monthIncome += t.amount;
        else monthExpense += Math.abs(t.amount);
      } else if (ts >= prevStart && t.amount < 0) {
        prevExpense += Math.abs(t.amount);
      }
    }
    const monthNet = monthIncome - monthExpense;

    const totalBalance = (accounts ?? []).reduce(
      (s, a) => s + a.initial_balance,
      0
    );

    return {
      net,
      savingsRate,
      monthIncome,
      monthExpense,
      monthNet,
      accountCount: (accounts ?? []).length,
      totalBalance,
      prevExpense,
    };
  }, [transactions, accounts]);

  const spendDelta =
    stats.prevExpense > 0
      ? ((stats.monthExpense - stats.prevExpense) / stats.prevExpense) * 100
      : 0;

  const cards = [
    {
      label: "Net position",
      value: formatCurrency(stats.net),
      icon: Wallet,
      delta: stats.net >= 0 ? "Net positive" : "Net negative",
      deltaTone: stats.net >= 0 ? "positive" : "negative" as const,
    },
    {
      label: "Savings rate",
      value: `${stats.savingsRate.toFixed(1)}%`,
      icon: Percent,
      delta: "of income saved",
    },
    {
      label: "Income · this month",
      value: formatCurrency(stats.monthIncome),
      icon: TrendingUp,
      deltaTone: "positive" as const,
    },
    {
      label: "Spending · this month",
      value: formatCurrency(stats.monthExpense),
      icon: TrendingDown,
      delta: `${Math.abs(spendDelta).toFixed(1)}% vs last month`,
      deltaTone: spendDelta <= 0 ? "positive" : "negative" as const,
    },
    {
      label: "This month's net",
      value: formatCurrency(stats.monthNet),
      icon: PiggyBank,
      deltaTone: stats.monthNet >= 0 ? "positive" : "negative" as const,
    },
    {
      label: "Accounts",
      value: `${stats.accountCount} · ${formatCurrency(stats.totalBalance)}`,
      icon: Landmark,
      delta: "combined balance",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <StatCard
          key={card.label}
          label={card.label}
          value={isLoading ? "…" : card.value}
          icon={card.icon}
          delta={card.delta}
          deltaTone={card.deltaTone}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Delete the old jumbotron**

Delete `components/dashboard/balance-overview.tsx`:

```bash
rm components/dashboard/balance-overview.tsx
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds. (Note: `app/dashboard/page.tsx` still imports `BalanceOverview` — this will fail until Task 5. If it fails, that's expected; proceed to Task 5 before re-verifying.)

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/stat-cards.tsx
git rm components/dashboard/balance-overview.tsx
git commit -m "feat: add stat cards row, remove jumbotron"
```

---

### Task 3: Side panel (this-month spending, category donut, account balances)

**Files:**
- Create: `components/dashboard/side-panel.tsx`

**Interfaces:**
- Consumes: `useTransactions`, `useAccounts`, `useCategories` from `@/hooks/use-categories`, `formatCurrency`, `startOfMonth`/`subMonths` from `date-fns`, Recharts `PieChart`/`Pie`/`Cell`/`ResponsiveContainer`, `Card` from `@/components/ui/card`.
- Produces: `SidePanel` — the right 1/3 column, used by Task 5.

- [ ] **Step 1: Create the component**

Create `components/dashboard/side-panel.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { startOfMonth, subMonths } from "date-fns";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccounts } from "@/hooks/use-accounts";
import { useCategories } from "@/hooks/use-categories";
import { useTransactions } from "@/hooks/use-transactions";
import { formatCurrency } from "@/lib/format";

const DONUT_COLORS = ["#083458", "#18848c", "#0e7c5b", "#c0392b", "#2a9d9f", "#4a6a7d"];

export function SidePanel() {
  const { data: transactions, isLoading } = useTransactions();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();

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
        if (t.category_id) {
          catTotals.set(t.category_id, (catTotals.get(t.category_id) ?? 0) + abs);
        }
      } else if (ts >= prevStart) {
        prevSpend += abs;
      }
    }

    const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));
    const byCategory = [...catTotals.entries()]
      .map(([id, amount]) => ({ id, name: catName.get(id) ?? "Uncategorized", amount }))
      .sort((a, b) => b.amount - a.amount);

    const totals = new Map<string, number>();
    for (const t of all) {
      totals.set(t.account_id, (totals.get(t.account_id) ?? 0) + t.amount);
    }
    const accountRows = (accounts ?? []).map((a) => ({
      name: a.name,
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
            {isLoading ? "…" : formatCurrency(monthSpend)}
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
          {byCategory.length === 0 ? (
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
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                      />
                      {entry.name}
                    </span>
                    <span className="font-mono tabular-nums text-fog">
                      {formatCurrency(entry.amount)}
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
          {accountRows.length === 0 ? (
            <p className="text-sm text-fog">No accounts yet.</p>
          ) : (
            <ul className="space-y-2">
              {accountRows.map((account) => (
                <li
                  key={account.name}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-ink">{account.name}</span>
                  <span className="font-mono tabular-nums text-ink">
                    {formatCurrency(account.balance)}
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
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds (component not yet imported by the page, so no breakage).

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/side-panel.tsx
git commit -m "feat: add dashboard side panel with spending, categories, accounts"
```

---

### Task 4: Restyle spending chart

**Files:**
- Modify: `components/dashboard/spending-chart.tsx`

**Interfaces:**
- Consumes: existing `useTransactions`, `formatCurrency`, Recharts.
- Produces: restyled `SpendingChart` — unchanged data, updated card styling to match the new look.

- [ ] **Step 1: Restyle the card wrapper**

In `components/dashboard/spending-chart.tsx`, replace the `Card` wrapper (lines 61-67) so the header matches the side-panel cards and the chart fills the card:

```tsx
  return (
    <Card className="h-full border-border/50 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="font-display text-base font-medium text-ink">
          Monthly spending
        </CardTitle>
      </CardHeader>
      <CardContent>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/spending-chart.tsx
git commit -m "style: restyle spending chart to match new dashboard"
```

---

### Task 5: Compose the new dashboard page

**Files:**
- Modify: `app/dashboard/page.tsx`
- Delete: `components/dashboard/insight-banner.tsx`

**Interfaces:**
- Consumes: `StatCards` from `@/components/dashboard/stat-cards`, `SpendingChart` from `@/components/dashboard/spending-chart`, `SidePanel` from `@/components/dashboard/side-panel`, `TransactionList` from `@/components/transactions/transaction-list`.

- [ ] **Step 1: Rewrite the page**

Replace the contents of `app/dashboard/page.tsx`:

```tsx
import { SidePanel } from "@/components/dashboard/side-panel";
import { SpendingChart } from "@/components/dashboard/spending-chart";
import { StatCards } from "@/components/dashboard/stat-cards";
import { TransactionList } from "@/components/transactions/transaction-list";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up">
        <StatCards />
      </div>
      <div
        className="grid animate-fade-in-up grid-cols-1 gap-4 lg:grid-cols-3"
        style={{ animationDelay: "60ms" }}
      >
        <div className="lg:col-span-2">
          <SpendingChart />
        </div>
        <SidePanel />
      </div>
      <div
        className="animate-fade-in-up"
        style={{ animationDelay: "120ms" }}
      >
        <TransactionList />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete the insight banner**

Delete `components/dashboard/insight-banner.tsx`:

```bash
rm components/dashboard/insight-banner.tsx
```

- [ ] **Step 3: Verify build and lint**

Run: `npm run build`
Expected: build succeeds with no type errors (this confirms the `BalanceOverview` import removal from Task 2 is now clean).

Run: `npm run lint`
Expected: no lint errors.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/page.tsx
git rm components/dashboard/insight-banner.tsx
git commit -m "feat: compose new dashboard layout, remove insight banner"
```

---

### Task 6: Update project memory

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update the progress log**

In `AGENTS.md`, under "Current Status & Recent Progress Log", add a dated entry describing the dashboard redesign (stat card row replacing the jumbotron, chart + side-panel grid, removed `balance-overview` and `insight-banner`, new `stat-card`/`stat-cards`/`side-panel` components). Note there were no schema/env changes.

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md with dashboard redesign progress"
```

---

## Self-Review

**Spec coverage:**
- Stat card row (6 cards, responsive grid) → Task 2 ✓
- Chart + side panel (2/3 + 1/3) → Tasks 3, 4, 5 ✓
- Ledger full-width → Task 5 (kept `TransactionList`) ✓
- Remove jumbotron + insight banner → Tasks 2, 5 ✓
- No schema/data changes → Global Constraints ✓

**Placeholder scan:** No TBD/TODO; every step has concrete code or commands.

**Type consistency:** `StatCard` props (`label`, `value`, `icon`, `delta`, `deltaTone`, `children`, `className`) are used consistently in Task 2. `StatCards`, `SidePanel`, `SpendingChart` are all named exports consumed by Task 5. `formatCurrency`, `useTransactions`, `useAccounts`, `useCategories` signatures match the existing hooks.
