# Net Worth: Assets by Category Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Assets by category" card to the Net Worth page showing each asset category's total and percentage, with a hover-synced donut chart.

**Architecture:** A pure `computeCategoryBreakdown()` helper in `lib/net-worth/math.ts` (unit-tested) computes rows from asset entries + a category map. A new `NetWorthCategoryBreakdown` component renders a Recharts donut beside a table/legend, reusing the `side-panel.tsx` hover-sync Sector pattern. The card is placed between the summary and the evolution chart in `net-worth-overview.tsx`.

**Tech Stack:** Next.js 16 App Router, React 19, Recharts, TanStack Query, Tailwind v4, Vitest.

## Global Constraints

- No DB changes, no new hooks, no new dependencies.
- Use brand tokens, never hardcoded hex greys: `bg-card`, `text-foreground`, `text-fog`, `text-muted-foreground`, `border-border/60`, and chart colors via `var(--chart-1..5)` / `var(--leaf)` / `var(--ember)`.
- Money uses `font-mono tabular-nums` and `formatCurrency(value, currency)` from `lib/format.ts`.
- Do not wrap CSS vars in `hsl(...)` — use `var(--x)` directly in Recharts/SVG.
- Follow the existing `side-panel.tsx` donut pattern (Sector `shape` prop, `Cell` carries only `fill`).
- Verification: `npm test` and `npm run build` must pass. Do not run `npm run lint` (broken script).

---

### Task 1: `computeCategoryBreakdown` math helper

**Files:**
- Modify: `lib/net-worth/math.ts` (add `category_id` to `NetWorthEntryLike`, add `UNCATEGORIZED_CATEGORY_ID`, `CategoryInfo`, `CategoryBreakdownRow`, `computeCategoryBreakdown`)
- Test: `lib/net-worth/math.test.ts`

**Interfaces:**
- Consumes: existing `entryCurrentValue(entry: NetWorthEntryLike): number | null` and `NetWorthEntryLike` from `./math`.
- Produces:
  - `export const UNCATEGORIZED_CATEGORY_ID = "__myfin_uncategorized__"`
  - `export interface CategoryInfo { name: string; icon: string }`
  - `export interface CategoryBreakdownRow { id: string; name: string; icon: string; amount: number; percent: number }`
  - `export function computeCategoryBreakdown(entries: NetWorthEntryLike[], categories: Map<string, CategoryInfo>): CategoryBreakdownRow[]`

- [ ] **Step 1: Write the failing tests**

Append to `lib/net-worth/math.test.ts`. First update the `entry` helper to accept an optional `category_id`:

```ts
const entry = (
  id: string,
  entry_type: "asset" | "liability",
  values: ValueRowLike[],
  category_id?: string | null
): NetWorthEntryLike => ({ id, entry_type, values, category_id });
```

Then update the import from `./math` to include `computeCategoryBreakdown` and `UNCATEGORIZED_CATEGORY_ID`:

```ts
import {
  buildNetWorthSeries,
  collectValueDates,
  computeCategoryBreakdown,
  computeNetWorth,
  computeTotals,
  entryCurrentValue,
  monthDelta,
  UNCATEGORIZED_CATEGORY_ID,
  valueAsOf,
  type NetWorthEntryLike,
  type ValueRowLike,
} from "./math";
```

And append this describe block:

```ts
describe("computeCategoryBreakdown", () => {
  const catMap = new Map<string, { name: string; icon: string }>([
    ["c1", { name: "Money", icon: "Banknote" }],
    ["c2", { name: "Stock Exchange", icon: "CandlestickChart" }],
  ]);

  it("returns an empty array for no entries", () => {
    expect(computeCategoryBreakdown([], catMap)).toEqual([]);
  });

  it("groups assets by category and computes percentages", () => {
    const money = entry("a1", "asset", [value("2026-06-01", 30000)], "c1");
    const stock = entry("a2", "asset", [value("2026-06-01", 10000)], "c2");
    const rows = computeCategoryBreakdown([money, stock], catMap);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "c1",
      name: "Money",
      icon: "Banknote",
      amount: 30000,
    });
    expect(rows[0].percent).toBeCloseTo(75, 5);
    expect(rows[1]).toMatchObject({
      id: "c2",
      name: "Stock Exchange",
      icon: "CandlestickChart",
      amount: 10000,
    });
    expect(rows[1].percent).toBeCloseTo(25, 5);
  });

  it("buckets uncategorized assets", () => {
    const uncat = entry("a1", "asset", [value("2026-06-01", 5000)]);
    const rows = computeCategoryBreakdown([uncat], catMap);
    expect(rows).toEqual([
      {
        id: UNCATEGORIZED_CATEGORY_ID,
        name: "Uncategorized",
        icon: "Tag",
        amount: 5000,
        percent: 100,
      },
    ]);
  });

  it("sorts by amount descending", () => {
    const small = entry("a1", "asset", [value("2026-06-01", 1000)], "c1");
    const big = entry("a2", "asset", [value("2026-06-01", 9000)], "c2");
    const rows = computeCategoryBreakdown([small, big], catMap);
    expect(rows.map((r) => r.amount)).toEqual([9000, 1000]);
  });

  it("skips entries without values and liabilities", () => {
    const noValue = entry("a1", "asset", []);
    const liability = entry("l1", "liability", [value("2026-06-01", 5000)]);
    expect(computeCategoryBreakdown([noValue, liability], catMap)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/net-worth/math.test.ts`
Expected: FAIL — `computeCategoryBreakdown` is not exported.

- [ ] **Step 3: Implement the helper**

In `lib/net-worth/math.ts`, add `category_id` to the entry interface:

```ts
export interface NetWorthEntryLike {
  id: string;
  entry_type: string;
  category_id?: string | null;
  values: ValueRowLike[];
}
```

Append at the end of the file:

```ts
export const UNCATEGORIZED_CATEGORY_ID = "__myfin_uncategorized__";

export interface CategoryInfo {
  name: string;
  icon: string;
}

export interface CategoryBreakdownRow {
  id: string;
  name: string;
  icon: string;
  amount: number;
  percent: number;
}

export function computeCategoryBreakdown(
  entries: NetWorthEntryLike[],
  categories: Map<string, CategoryInfo>
): CategoryBreakdownRow[] {
  const totals = new Map<string, number>();
  let totalAssets = 0;

  for (const entry of entries) {
    if (entry.entry_type !== "asset") continue;
    const v = entryCurrentValue(entry);
    if (v === null) continue;
    totalAssets += v;
    const id = entry.category_id ?? UNCATEGORIZED_CATEGORY_ID;
    totals.set(id, (totals.get(id) ?? 0) + v);
  }

  if (totalAssets === 0) return [];

  const rows: CategoryBreakdownRow[] = [...totals.entries()].map(
    ([id, amount]) => {
      const info = categories.get(id);
      return {
        id,
        name: info?.name ?? "Uncategorized",
        icon: info?.icon ?? "Tag",
        amount,
        percent: (amount / totalAssets) * 100,
      };
    }
  );

  return rows.sort(
    (a, b) => b.amount - a.amount || a.name.localeCompare(b.name)
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/net-worth/math.test.ts`
Expected: PASS (all existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add lib/net-worth/math.ts lib/net-worth/math.test.ts
git commit -m "feat: add net worth category breakdown math helper"
```

---

### Task 2: `NetWorthCategoryBreakdown` component + page wiring

**Files:**
- Create: `components/net-worth/net-worth-category-breakdown.tsx`
- Modify: `components/net-worth/net-worth-overview.tsx`

**Interfaces:**
- Consumes: `computeCategoryBreakdown`, `CategoryBreakdownRow` from `lib/net-worth/math.ts` (Task 1); `useNetWorth()` (returns `assets: EntryWithValues[]`, `isLoading`); `useNetWorthCategories()` (returns `data: NetWorthCategory[]` with `id`, `name`, `icon`); `usePrimaryCurrency()` (returns `currency`); `CategoryIcon` from `components/categories/category-icons.tsx`; `formatCurrency` from `lib/format.ts`.
- Produces: `export function NetWorthCategoryBreakdown()` — a self-contained card component.

- [ ] **Step 1: Create the component**

Create `components/net-worth/net-worth-category-breakdown.tsx`:

```tsx
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
    return computeCategoryBreakdown(assets, map);
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
```

- [ ] **Step 2: Wire it into the overview page**

In `components/net-worth/net-worth-overview.tsx`, add the import:

```tsx
import { NetWorthCategoryBreakdown } from "./net-worth-category-breakdown";
```

And render it between the summary and the chart:

```tsx
<NetWorthSummary />
<NetWorthCategoryBreakdown />
<NetWorthChart />
```

- [ ] **Step 3: Verify with tests and build**

Run: `npm test`
Expected: PASS (25 existing + 5 new tests).

Run: `npm run build`
Expected: SUCCESS — type-checks and prerenders.

- [ ] **Step 4: Commit**

```bash
git add components/net-worth/net-worth-category-breakdown.tsx components/net-worth/net-worth-overview.tsx
git commit -m "feat: add assets by category breakdown to net worth page"
```