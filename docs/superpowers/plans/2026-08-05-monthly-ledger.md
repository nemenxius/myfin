# Month-scoped Transaction Ledger & Stat Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user view the ledger and the four money-flow stat cards for a selected month (via `?month=YYYY-MM` in the URL), while the spending chart and side panel stay global.

**Architecture:** `app/dashboard/page.tsx` becomes an async server component that awaits `searchParams`, normalizes the `month` param with pure helpers in `lib/month.ts`, and passes the validated `YYYY-MM` string down to `<MonthSelector>`, `<StatCards>`, and `<TransactionList>`. The URL is the single source of truth — navigating uses `router.replace` (no history flooding) and all filtering is client-side over the existing `["transactions"]` TanStack Query cache. The ledger computes a carried-forward seed balance (sum of all pre-month transactions) and walks the month chronologically to produce running balances.

**Tech Stack:** Next.js 16 App Router (async `searchParams`), React 19, date-fns, lucide-react, Base UI `Button`, TanStack Query (unchanged data layer).

## Global Constraints

- Verification gate is **`npm run build`** — the repo has no unit test framework. Never run `npm run lint` (broken in this repo).
- App runs at `http://localhost:3000`; dashboard is auth-protected, so manual checks require a signed-in user with accounts/transactions.
- Base UI `Button` uses a `render` prop, not `asChild`. `Button` sizes: `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`; variants: `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`.
- Existing visual conventions: money figures use `font-mono tabular-nums`; muted text uses `text-fog`; ink text uses `text-ink`; cards use `rounded-xl border border-border/60 bg-white p-4 shadow-sm`.
- `transaction.date` is an ISO timestamp; compare via `new Date(t.date).getTime()`. `amount` is `NUMERIC`: positive = income, negative = expense.
- **No data-layer or schema changes.** Do not touch `hooks/use-transactions.ts`, `components/dashboard/spending-chart.tsx`, or `components/dashboard/side-panel.tsx`.

---

### Task 1: Month helpers and selector UI

**Files:**
- Create: `lib/month.ts`
- Create: `components/dashboard/month-selector.tsx`

**Interfaces:**
- Produces:
  - `parseMonthParam(value: string | undefined): string` — validates `^\d{4}-(0[1-9]|1[0-2])$` plus a real-date round-trip; falls back to current month (`format(new Date(), "yyyy-MM")`).
  - `monthWindow(month: string): { start: Date; end: Date }` — inclusive start (1st of month 00:00 local), exclusive end (1st of next month 00:00 local).
  - `monthLabel(month: string): string` — e.g. `"July 2026"` via date-fns `format(..., "MMMM yyyy")`.
  - `MonthSelector({ month }: { month: string })` — client component; chevrons step months via `router.replace("/dashboard?month=YYYY-MM", { scroll: false })`; a "Today" button (shown only when a non-current month is selected) goes to `router.replace("/dashboard", { scroll: false })`.
- Consumes: none.

- [ ] **Step 1: Create `lib/month.ts`**

```ts
import { format } from "date-fns";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseMonthParam(value: string | undefined): string {
  if (value && MONTH_PATTERN.test(value)) {
    const [year, monthIndex] = value.split("-").map(Number);
    const date = new Date(year, monthIndex - 1, 1);
    if (date.getFullYear() === year && date.getMonth() === monthIndex - 1) {
      return value;
    }
  }
  return format(new Date(), "yyyy-MM");
}

export function monthWindow(month: string): { start: Date; end: Date } {
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(year, monthIndex - 1, 1);
  const end = new Date(year, monthIndex, 1);
  return { start, end };
}

export function monthLabel(month: string): string {
  const [year, monthIndex] = month.split("-").map(Number);
  return format(new Date(year, monthIndex - 1, 1), "MMMM yyyy");
}
```

- [ ] **Step 2: Create `components/dashboard/month-selector.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { addMonths, format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monthLabel } from "@/lib/month";

export function MonthSelector({ month }: { month: string }) {
  const router = useRouter();

  const currentMonth = format(new Date(), "yyyy-MM");
  const [year, monthIndex] = month.split("-").map(Number);
  const base = new Date(year, monthIndex - 1, 1);
  const prev = format(addMonths(base, -1), "yyyy-MM");
  const next = format(addMonths(base, 1), "yyyy-MM");

  const navigate = (target: string) => {
    router.replace(`/dashboard?month=${target}`, { scroll: false });
  };

  const goToday = () => {
    router.replace("/dashboard", { scroll: false });
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Previous month"
        onClick={() => navigate(prev)}
      >
        <ChevronLeft />
      </Button>
      <span className="w-32 text-center text-sm font-medium text-ink">
        {monthLabel(month)}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Next month"
        onClick={() => navigate(next)}
      >
        <ChevronRight />
      </Button>
      {month !== currentMonth ? (
        <Button variant="outline" size="xs" onClick={goToday}>
          Today
        </Button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Verify the build passes**

Run: `npm run build`
Expected: BUILD SUCCESSFUL. (Files are not imported anywhere yet, so this confirms they type-check.)

- [ ] **Step 4: Commit**

```bash
git add lib/month.ts components/dashboard/month-selector.tsx
git commit -m "feat: add month helpers and selector UI"
```

---

### Task 2: Month-scoped stat cards + URL wiring

**Files:**
- Modify: `components/dashboard/stat-cards.tsx`
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `monthWindow(month)`, `monthLabel(month)` from `lib/month.ts` (Task 1); `MonthSelector` from `components/dashboard/month-selector.tsx` (Task 1).
- Produces: `StatCards({ month }: { month: string })`; `app/dashboard/page.tsx` becomes async, reads `searchParams`, and passes `month` to `MonthSelector` and `StatCards`. (The `TransactionList` on this page is still rendered without a `month` prop — Task 4 threads it through.)

- [ ] **Step 1: Add the `month` prop and scope the money-flow cards**

In `components/dashboard/stat-cards.tsx`:
1. Remove the `startOfMonth` import (no longer used) — change line 4 from `import { startOfMonth } from "date-fns";` to nothing (delete the line). Add `import { monthLabel, monthWindow } from "@/lib/month";`.
2. Change the component signature to `export function StatCards({ month }: { month: string }) {`.
3. Add `month` to the `useMemo` dependency array and replace the `useMemo` body with:

```tsx
  const stats = useMemo(() => {
    const all = transactions ?? [];

    const income = all
      .filter((t) => t.amount > 0)
      .reduce((s, t) => s + t.amount, 0);
    const expense = all
      .filter((t) => t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const net = income - expense;

    const { start, end } = monthWindow(month);
    const startTs = start.getTime();
    const endTs = end.getTime();

    let monthIncome = 0;
    let monthExpense = 0;
    for (const t of all) {
      const ts = new Date(t.date).getTime();
      if (ts >= startTs && ts < endTs) {
        if (t.amount > 0) monthIncome += t.amount;
        else monthExpense += Math.abs(t.amount);
      }
    }
    const monthNet = monthIncome - monthExpense;
    const savingsRate = monthIncome > 0 ? (monthNet / monthIncome) * 100 : 0;

    const accountTotals = new Map<string, number>();
    for (const t of all) {
      accountTotals.set(
        t.account_id,
        (accountTotals.get(t.account_id) ?? 0) + t.amount
      );
    }
    const totalBalance = (accounts ?? []).reduce(
      (s, a) => s + a.initial_balance + (accountTotals.get(a.id) ?? 0),
      0
    );

    return {
      net,
      savingsRate,
      monthIncome,
      monthExpense,
      monthNet,
      totalBalance,
    };
  }, [transactions, accounts, month]);
```

Note: `net` here is the all-time net position (global card); `monthNet` is the month-scoped card.

- [ ] **Step 2: Update the card captions to the month name**

Replace the `const cards` array so the four money-flow cards use `monthName` as their caption and the fifth card is titled "Net":

```tsx
  const monthName = monthLabel(month);

  const cards: ComponentProps<typeof StatCard>[] = [
    {
      label: "Net position",
      value: formatCurrency(stats.net, currency),
      icon: Wallet,
      delta: stats.net >= 0 ? "Net positive" : "Net negative",
      deltaTone: stats.net >= 0 ? "positive" : "negative",
    },
    {
      label: "Savings rate",
      value: `${stats.savingsRate.toFixed(1)}%`,
      icon: Percent,
      delta: monthName,
    },
    {
      label: "Income",
      value: formatCurrency(stats.monthIncome, currency),
      icon: TrendingUp,
      delta: monthName,
      deltaTone: "neutral",
    },
    {
      label: "Spending",
      value: formatCurrency(stats.monthExpense, currency),
      icon: TrendingDown,
      delta: monthName,
      deltaTone: "neutral",
    },
    {
      label: "Net",
      value: formatCurrency(stats.monthNet, currency),
      icon: PiggyBank,
      delta: monthName,
      deltaTone: stats.monthNet >= 0 ? "positive" : "negative",
    },
    {
      label: "Combined balance",
      value: formatCurrency(stats.totalBalance, currency),
      icon: Landmark,
    },
  ];
```

- [ ] **Step 3: Rewrite `app/dashboard/page.tsx` as an async server component**

Replace the entire file content:

```tsx
import { MonthSelector } from "@/components/dashboard/month-selector";
import { SidePanel } from "@/components/dashboard/side-panel";
import { SpendingChart } from "@/components/dashboard/spending-chart";
import { StatCards } from "@/components/dashboard/stat-cards";
import { TransactionList } from "@/components/transactions/transaction-list";
import { parseMonthParam } from "@/lib/month";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const month = parseMonthParam(monthParam);

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up">
        <MonthSelector month={month} />
        <div className="mt-4">
          <StatCards month={month} />
        </div>
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

- [ ] **Step 4: Verify the build passes**

Run: `npm run build`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Manual verification**

Run: `npm run dev` and open `http://localhost:3000/dashboard` signed in.
- The month selector shows the current month (e.g. "August 2026") and NO "Today" button.
- Clicking the left chevron updates the URL to `?month=YYYY-MM` and the label changes; the page does not scroll to top and the browser back button does not step back through months.
- Visiting `?month=garbage` and `?month=2026-13` directly resolves to the current month.
- Income/Spending/Net/Savings-rate cards reflect the selected month (captions show the month name); "Net position" and "Combined balance" are unchanged across months.
- A month with no data shows zeroed money-flow cards with that month's name as caption.
- Savings rate = Net ÷ Income for the selected month.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/stat-cards.tsx app/dashboard/page.tsx
git commit -m "feat: scope stat cards to selected month via URL param"
```

---

### Task 3: Month-aware default date in the transaction form

**Files:**
- Modify: `components/transactions/transaction-form.tsx`

**Interfaces:**
- Produces: `TransactionForm` gains an optional `defaultDate?: string` prop. Callers that omit it keep current behavior (defaults to today).

- [ ] **Step 1: Add the optional prop**

In `components/transactions/transaction-form.tsx`, extend the props interface:

```tsx
interface TransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction | null;
  defaultAccountId?: string;
  defaultDate?: string;
}
```

Destructure the new prop:

```tsx
export function TransactionForm({
  open,
  onOpenChange,
  transaction,
  defaultAccountId,
  defaultDate,
}: TransactionFormProps) {
```

- [ ] **Step 2: Use it for new transactions**

In the reset `useEffect`, the `else` branch (new transaction) currently has `setDate(today());`. Change it to use the default and add `defaultDate` to the effect's dependency array:

```tsx
    } else {
      setType("Expense");
      setAmount("");
      setAccountId(defaultAccountId ?? "");
      setCategoryId("");
      setDate(defaultDate ?? today());
      setDescription("");
    }
  }, [open, transaction, defaultAccountId, defaultDate]);
```

- [ ] **Step 3: Verify the build passes**

Run: `npm run build`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add components/transactions/transaction-form.tsx
git commit -m "feat: support default date for new transactions"
```

---

### Task 4: Month-filtered ledger with carried-forward balances

**Files:**
- Modify: `components/transactions/transaction-list.tsx`
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `monthWindow(month)`, `monthLabel(month)` from `lib/month.ts` (Task 1); `defaultDate` prop from `TransactionForm` (Task 3); `parseMonthParam` and the async page from Task 2.
- Produces: `TransactionList({ month }: { month: string })` — used by `app/dashboard/page.tsx`.

- [ ] **Step 1: Add the `month` prop and month-scoped rows**

In `components/transactions/transaction-list.tsx`:
1. Add `import { monthLabel, monthWindow } from "@/lib/month";`.
2. Change the component signature to `export function TransactionList({ month }: { month: string }) {`.
3. Add `const monthName = monthLabel(month);` right after the `currency` line.
4. Replace the `rows` `useMemo` with:

```tsx
  const rows = useMemo(() => {
    if (!transactions) return [];
    const { start, end } = monthWindow(month);
    const startTs = start.getTime();
    const endTs = end.getTime();

    let seed = 0;
    const inMonth: Transaction[] = [];
    for (const t of transactions) {
      const ts = new Date(t.date).getTime();
      if (ts < startTs) {
        seed += t.amount;
      } else if (ts < endTs) {
        inMonth.push(t);
      }
    }

    const chronological = [...inMonth].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    let running = seed;
    const withBalance = chronological.map((t) => {
      running += t.amount;
      return { ...t, balance: running };
    });
    return withBalance.reverse();
  }, [transactions, month]);
```

- [ ] **Step 2: Add month-aware subtitle and month-empty state**

Replace the ledger subtitle `<p>` with:

```tsx
          <p className="mt-0.5 text-xs text-fog">
            {monthName} — every movement, with the balance after each line.
          </p>
```

Then insert a month-empty branch between the existing all-time empty block and the `<Table>`. The existing `!transactions || transactions.length === 0` block keeps its "No transactions yet." message; add after it:

```tsx
        ) : rows.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <p>No transactions in {monthName}.</p>
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus />
              Add transaction
            </Button>
          </div>
        ) : (
```

(The final `) : (` continues the existing ternary chain that currently flows into `<Table>` — do not change the `<Table>` branch.)

- [ ] **Step 3: Pass a month-aware default date to the form**

Add a `defaultDate` memo. Insert before the `openCreate` function:

```tsx
  const defaultDate = useMemo(() => {
    const currentMonth = format(new Date(), "yyyy-MM");
    if (month === currentMonth) {
      return format(new Date(), "yyyy-MM-dd");
    }
    const { start } = monthWindow(month);
    return format(start, "yyyy-MM-dd");
  }, [month]);
```

Update the form usage at the bottom of the component:

```tsx
      <TransactionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        transaction={editing}
        defaultDate={defaultDate}
      />
```

- [ ] **Step 4: Thread `month` through the page**

In `app/dashboard/page.tsx`, change `<TransactionList />` to `<TransactionList month={month} />`.

- [ ] **Step 5: Verify the build passes**

Run: `npm run build`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, open `/dashboard` signed in.
- Current month shows the current month's transactions newest-first; the Balance of the newest row equals the all-time running balance.
- A past month with data shows only that month's rows; the oldest row's Balance equals the carried-forward seed (sum of all pre-month transactions); the newest row's Balance equals seed + that month's net.
- A month with no transactions shows "No transactions in <Month>." with the Add button.
- Fresh account with zero transactions still shows "No transactions yet.".
- The subtitle reads "<Month> — every movement, with the balance after each line."
- On a past month, click "Add Transaction" — the Date field defaults to the 1st of that month. On the current month it defaults to today. Editing an existing transaction still pre-fills its own date.

- [ ] **Step 7: Commit**

```bash
git add components/transactions/transaction-list.tsx app/dashboard/page.tsx
git commit -m "feat: filter ledger to selected month with carried-forward balances"
```

---

### Task 5: Update AGENTS.md project log

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: none.

- [ ] **Step 1: Add a dated entry to the progress log**

In `AGENTS.md`, under `## 5. Current Status & Recent Progress Log`, append a new subsection (matching the existing dated-entry style) describing:

- **Month-scoped ledger & stat cards (2026-08-05):** dashboard accepts `?month=YYYY-MM`; `lib/month.ts` (`parseMonthParam`, `monthWindow`, `monthLabel`) + `components/dashboard/month-selector.tsx` (chevrons + Today, `router.replace` so the back button isn't flooded). Income/Spending/Net/Savings-rate cards follow the month; Net position + Combined balance stay global. Ledger filters to the month with carried-forward seed balances; month-aware subtitle/empty states. Transaction form defaults new dates to the selected month (today if current). Chart + side panel unchanged.
- Note: **no schema or env changes**; no data-layer changes (client-side filter over the `["transactions"]` cache).
- Confirm the commit SHA once pushed.

- [ ] **Step 2: Verify build still passes**

Run: `npm run build`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: log month-scoped ledger feature"
```

---

### Task 6: Whole-branch verification

**Files:**
- None (verification only).

**Interfaces:**
- Consumes: the complete feature from Tasks 1–5.

- [ ] **Step 1: Run the full build**

Run: `npm run build`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 2: End-to-end browser check**

Run: `npm run dev`, open `/dashboard` signed in.
1. Current month renders; no "Today" button; captions show the month name.
2. Step back to a past month with data: URL has `?month=`, stat cards swap, ledger shows only that month, balances carried forward, subtitle month-aware.
3. Step into a future month: empty ledger ("No transactions in …"), zeroed money-flow cards, still navigable.
4. "Today" returns to `/dashboard` with no param.
5. Direct-visit `?month=2026-13` and `?month=foo` fall back to the current month.
6. Refresh on `?month=` keeps the selected month.
7. Add a transaction while on a past month — date defaults to the 1st of that month; after save the ledger updates optimistically (same behavior as before).
8. Spending chart and side panel still show global/current-month data.

- [ ] **Step 3: Review the commit list**

Run: `git log --oneline -10`
Expected: five feature commits on top of the spec commit (`964dda4`), each with a `feat:`/`docs:` prefix as described in Tasks 1–5.

- [ ] **Step 4: Commit any final fixes**

If the end-to-end check surfaced issues, fix them in focused commits with clear messages. If clean, no commit needed.

- [ ] **Step 5: Report**

Summarize for the user: what shipped, the commit SHAs, the verification evidence (build + browser checks), and note that nothing was pushed (push only on request).
