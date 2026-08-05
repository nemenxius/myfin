# Currency Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Respect the currency chosen on each account instead of hardcoding USD — aggregate displays use a single primary currency (first account's currency, USD fallback), per-account displays use the account's own currency, and the account form uses a curated currency dropdown.

**Architecture:** `formatCurrency` becomes currency-aware (defaulting to USD). A new `usePrimaryCurrency` hook derives the primary currency from `useAccounts()`. A `CURRENCIES` constant drives the account-form dropdown. Each display passes its currency into `formatCurrency`. No schema changes.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4, TanStack Query v5, Base UI Select, `Intl.NumberFormat`.

## Global Constraints

- No database/schema changes; no changes to transaction/account CRUD hooks.
- Single-currency-per-user assumption: no FX conversion. Aggregates use one primary currency.
- Primary currency = currency of the first account in `useAccounts()` result (accounts fetched ordered by `name` ascending), or `"USD"` if no accounts.
- All money figures use `font-mono tabular-nums` and `formatCurrency` from `lib/format.ts`.
- Use existing Shadcn/Base UI primitives in `components/ui/` over hand-rolled markup.
- No test framework exists in this repo. Verification is `npm run build` (type-checks). Run it after each task. (`next lint` is broken in Next 16 — ignore it.)
- Follow existing component conventions: `"use client"` where needed, named exports, `cn()` from `lib/utils`.

---

### Task 1: Currency-aware `formatCurrency` + symbol helper

**Files:**
- Modify: `lib/format.ts`

**Interfaces:**
- Produces: `formatCurrency(amount: number, currency?: string): string` (currency defaults to `"USD"`), and `getCurrencySymbol(currency?: string): string` (used by Task 4's chart Y-axis).

- [ ] **Step 1: Rewrite `lib/format.ts`**

Replace the entire contents of `lib/format.ts`:

```ts
export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export function getCurrencySymbol(currency = "USD"): string {
  const parts = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? currency;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds (all existing `formatCurrency(amount)` calls still compile, defaulting to USD).

- [ ] **Step 3: Commit**

```bash
git add lib/format.ts
git commit -m "feat: make formatCurrency currency-aware"
```

---

### Task 2: Primary currency hook

**Files:**
- Create: `hooks/use-primary-currency.ts`

**Interfaces:**
- Consumes: `useAccounts` from `@/hooks/use-accounts`.
- Produces: `usePrimaryCurrency(): { currency: string; isLoading: boolean; isError: boolean }` — used by Tasks 4, 5, 6.

- [ ] **Step 1: Create the hook**

Create `hooks/use-primary-currency.ts`:

```ts
import { useAccounts } from "./use-accounts";

export function usePrimaryCurrency() {
  const { data: accounts, isLoading, isError } = useAccounts();

  const currency = accounts && accounts.length > 0 ? accounts[0].currency : "USD";

  return { currency, isLoading, isError };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds (hook not yet imported anywhere).

- [ ] **Step 3: Commit**

```bash
git add hooks/use-primary-currency.ts
git commit -m "feat: add usePrimaryCurrency hook"
```

---

### Task 3: Currency options constant + account form dropdown

**Files:**
- Create: `components/accounts/account-currencies.ts`
- Modify: `components/accounts/account-form.tsx`

**Interfaces:**
- Produces: `CURRENCIES: ReadonlyArray<{ value: string; label: string }>` — used by `account-form.tsx`.
- Consumes: existing `Select`/`SelectItem`/`SelectContent`/`SelectTrigger`/`SelectValue` primitives from `@/components/ui/select`.

- [ ] **Step 1: Create the currencies constant**

Create `components/accounts/account-currencies.ts`:

```ts
export const CURRENCIES = [
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "JPY", label: "JPY — Japanese Yen" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "AUD", label: "AUD — Australian Dollar" },
  { value: "CHF", label: "CHF — Swiss Franc" },
  { value: "CNY", label: "CNY — Chinese Yuan" },
  { value: "SEK", label: "SEK — Swedish Krona" },
  { value: "NOK", label: "NOK — Norwegian Krone" },
  { value: "DKK", label: "DKK — Danish Krone" },
  { value: "NZD", label: "NZD — New Zealand Dollar" },
  { value: "INR", label: "INR — Indian Rupee" },
  { value: "BRL", label: "BRL — Brazilian Real" },
  { value: "MXN", label: "MXN — Mexican Peso" },
  { value: "SGD", label: "SGD — Singapore Dollar" },
  { value: "HKD", label: "HKD — Hong Kong Dollar" },
  { value: "KRW", label: "KRW — South Korean Won" },
  { value: "ZAR", label: "ZAR — South African Rand" },
] as const;
```

- [ ] **Step 2: Replace the currency input with a dropdown**

In `components/accounts/account-form.tsx`:

Add the import after the existing `ACCOUNT_TYPES` import:

```tsx
import { ACCOUNT_TYPES, type AccountType } from "./account-types";
import { CURRENCIES } from "./account-currencies";
```

Inside the component, build a currency options array that always includes the account's current currency (in case it's a legacy value not in the list). Add this right before the `return` statement:

```tsx
  const currencyOptions = CURRENCIES.some((c) => c.value === currency)
    ? CURRENCIES
    : [...CURRENCIES, { value: currency, label: currency }];
```

Replace the currency `Input` block (the `<div className="grid gap-1.5">` containing `Label htmlFor="currency"` and the `<Input id="currency" ... />`) with:

```tsx
            <div className="grid gap-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={currency}
                onValueChange={(value) =>
                  value !== null && setCurrency(value)
                }
                items={currencyOptions.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
              >
                <SelectTrigger id="currency" className="w-full">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {currencyOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
```

Note: `handleSubmit` already does `currency: currency.trim() || "USD"` — the dropdown values are already uppercase ISO codes, so this stays valid.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/accounts/account-currencies.ts components/accounts/account-form.tsx
git commit -m "feat: currency dropdown in account form"
```

---

### Task 4: Aggregate displays use primary currency

**Files:**
- Modify: `components/dashboard/stat-cards.tsx`
- Modify: `components/dashboard/spending-chart.tsx`
- Modify: `components/transactions/transaction-list.tsx`

**Interfaces:**
- Consumes: `usePrimaryCurrency` from `@/hooks/use-primary-currency`; `formatCurrency` and `getCurrencySymbol` from `@/lib/format`.

- [ ] **Step 1: Update `stat-cards.tsx`**

Add the import after the existing `useAccounts` import:

```tsx
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
```

Inside the component, add the hook call after the existing `useAccounts()` call:

```tsx
  const { currency } = usePrimaryCurrency();
```

Pass `currency` to every `formatCurrency` call in the `cards` array. The `cards` array becomes:

```tsx
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
      delta: "of income saved",
    },
    {
      label: "Income",
      value: formatCurrency(stats.monthIncome, currency),
      icon: TrendingUp,
      delta: "This month",
      deltaTone: "neutral",
    },
    {
      label: "Spending",
      value: formatCurrency(stats.monthExpense, currency),
      icon: TrendingDown,
      delta: "This month",
      deltaTone: "neutral",
    },
    {
      label: "This month's net",
      value: formatCurrency(stats.monthNet, currency),
      icon: PiggyBank,
      deltaTone: stats.monthNet >= 0 ? "positive" : "negative",
    },
    {
      label: "Combined balance",
      value: formatCurrency(stats.totalBalance, currency),
      icon: Landmark,
    },
  ];
```

- [ ] **Step 2: Update `spending-chart.tsx`**

Add the imports:

```tsx
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
import { formatCurrency, getCurrencySymbol } from "@/lib/format";
```

Inside the component, add the hook call after `useTransactions()`:

```tsx
  const { currency } = usePrimaryCurrency();
```

Update the `CustomTooltip` to receive the currency. Change its signature and body:

```tsx
function CustomTooltip({
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
```

Pass `currency` to the Tooltip content and update the Y-axis tick formatter to use the currency symbol. Replace the `<Tooltip ... />` and `<YAxis ... />` blocks:

```tsx
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "#6c7a83", fontFamily: "var(--font-mono)" }}
                tickFormatter={(value: number) =>
                  `${getCurrencySymbol(currency)}${value}`
                }
                width={56}
              />
```

and

```tsx
              <Tooltip
                content={<CustomTooltip currency={currency} />}
                cursor={{ stroke: "#18848c", strokeDasharray: "4 4" }}
              />
```

- [ ] **Step 3: Update `transaction-list.tsx`**

Add the import after the existing `useTransactions` import:

```tsx
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
```

Inside the component, add the hook call after `useTransactions()`:

```tsx
  const { currency } = usePrimaryCurrency();
```

Pass `currency` to the two `formatCurrency` calls in the table body:

```tsx
                    {formatCurrency(Math.abs(transaction.amount), currency)}
```

and

```tsx
                    {formatCurrency(transaction.balance, currency)}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/stat-cards.tsx components/dashboard/spending-chart.tsx components/transactions/transaction-list.tsx
git commit -m "feat: aggregate displays use primary currency"
```

---

### Task 5: Side panel uses primary + per-account currency

**Files:**
- Modify: `components/dashboard/side-panel.tsx`

**Interfaces:**
- Consumes: `usePrimaryCurrency` from `@/hooks/use-primary-currency`; `formatCurrency` from `@/lib/format`.

- [ ] **Step 1: Update `side-panel.tsx`**

Add the import after the existing `useAccounts` import:

```tsx
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
```

Inside the component, add the hook call after the `useCategories()` call:

```tsx
  const { currency } = usePrimaryCurrency();
```

Carry the account's own currency into `accountRows`. Change the `accountRows` mapping:

```tsx
    const accountRows = (accounts ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
      balance: a.initial_balance + (totals.get(a.id) ?? 0),
    }));
```

Update the three `formatCurrency` call sites:

- Monthly spending total (aggregate → primary currency):

```tsx
            {isLoading ? "…" : formatCurrency(monthSpend, currency)}
```

- Category donut amounts (aggregate → primary currency):

```tsx
                      {formatCurrency(entry.amount, currency)}
```

- Account balances list (per-account → that account's currency):

```tsx
                    {formatCurrency(account.balance, account.currency)}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/side-panel.tsx
git commit -m "feat: side panel uses primary and per-account currency"
```

---

### Task 6: Account list uses per-account currency

**Files:**
- Modify: `components/accounts/account-list.tsx`

**Interfaces:**
- Consumes: `usePrimaryCurrency` from `@/hooks/use-primary-currency`; `formatCurrency` from `@/lib/format`.

- [ ] **Step 1: Update `account-list.tsx`**

Add the import after the existing `useTransactions` import:

```tsx
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
```

Inside the component, add the hook call after `useTransactions()`:

```tsx
  const { currency } = usePrimaryCurrency();
```

Update the header total (aggregate across accounts → primary currency). Replace the `formatCurrency(totalBalance)` call in the header subtitle:

```tsx
              : `${rows.length} account${rows.length === 1 ? "" : "s"} · ${formatCurrency(totalBalance, currency)} total`}
```

Update each row's balance (per-account → that account's currency). Replace the row balance cell:

```tsx
                    {formatCurrency(account.balance, account.currency)}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/accounts/account-list.tsx
git commit -m "feat: account list uses per-account currency"
```

---

### Task 7: Update project memory

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update the progress log**

In `AGENTS.md`, under "Current Status & Recent Progress Log", add a dated entry (2026-08-04) describing the currency handling work: `formatCurrency` is now currency-aware (defaults USD), new `usePrimaryCurrency` hook (first account's currency, USD fallback), new `CURRENCIES` dropdown in the account form, aggregate displays use primary currency, per-account displays use the account's own currency. Note: no schema/env changes.

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md with currency handling progress"
```

---

## Self-Review

**Spec coverage:**
- `formatCurrency(amount, currency)` → Task 1 ✓
- `usePrimaryCurrency` hook → Task 2 ✓
- `CURRENCIES` constant + account form dropdown → Task 3 ✓
- Aggregate displays (stat-cards, spending-chart, side-panel monthly totals, transaction-list) → Tasks 4, 5 ✓
- Per-account displays (account-list, side-panel account balances) → Tasks 5, 6 ✓
- AGENTS.md → Task 7 ✓
- No schema changes → Global Constraints ✓

**Placeholder scan:** No TBD/TODO; every step has concrete code or commands.

**Type consistency:** `usePrimaryCurrency()` returns `{ currency, isLoading, isError }` consistently in Tasks 2, 4, 5, 6. `formatCurrency(amount, currency)` and `getCurrencySymbol(currency)` signatures match across all tasks. `accountRows` gains `currency: a.currency` in Task 5 and is consumed at the same file's render. `CURRENCIES` is `{ value, label }[]` matching `ACCOUNT_TYPES` pattern.
