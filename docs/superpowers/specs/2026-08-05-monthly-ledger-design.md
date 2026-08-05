# Design: Month-scoped Transaction Ledger & Stat Cards

**Date:** 2026-08-05
**Status:** Approved (design review)

## 1. Goal

Give the user the ability to view transactions (the ledger) by a selected month, while the charts stay global. The month selection is the single source of truth for the ledger **and** the month-scoped stat cards.

- **Ledger:** shows only the selected month's transactions.
- **Stat cards:** Income, Spending, Net, and Savings rate reflect the selected month; Net position and Combined balance stay global.
- **Chart + Side panel:** unchanged — the 6-month spending chart stays a global overview; the side panel keeps its current-month behavior.

## 2. Scope

- New: `components/dashboard/month-selector.tsx`, `lib/month.ts`.
- Modified: `app/dashboard/page.tsx`, `components/dashboard/stat-cards.tsx`, `components/transactions/transaction-list.tsx`, `components/transactions/transaction-form.tsx`.
- **No data-layer or schema changes.** Filtering is client-side over the existing `["transactions"]` query cache; optimistic add/edit/delete in `use-transactions.ts` is untouched.

## 3. URL Contract & Page

`app/dashboard/page.tsx` becomes an async server component (Next 16 style):

- Awaits `searchParams`, extracts `month`.
- Validates against `^\d{4}-\d{2}$` plus a real-date check via `lib/month.ts#parseMonthParam`; invalid or missing → current month (`YYYY-MM`).
- Passes the normalized month string to `<MonthSelector>`, `<StatCards>`, and `<TransactionList>`.

The month lives in the URL (`?month=2026-07`): survives refresh, is shareable/bookmarkable, and is the single source of truth — no extra client state layer.

## 4. Month Selector (`components/dashboard/month-selector.tsx`)

Client component. Props: `{ month: string }` (`YYYY-MM`).

- Renders: `←` chevron · **July 2026** label · `→` chevron, plus a "Today" button (only shown when the current month is not selected).
- Prev/next compute adjacent months; navigating uses `router.replace("?month=YYYY-MM", { scroll: false })` — treated as filter state, so the browser back button isn't flooded with month steps, and the page re-renders from the new URL param.
- "Today" removes the param (`router.replace("/dashboard")`).
- Placement: top of the dashboard, above `StatCards`.

## 5. Stat Cards (`components/dashboard/stat-cards.tsx`)

Gains a `month: string` prop.

**Month-scoped cards** (computed over the month window from `monthWindow(month)`):
- **Income** — sum of positive `amount`s in the window.
- **Spending** — sum of `|amount|` for negative amounts in the window.
- **Net** (title renamed from "This month's net") — income − spending in the window.
- **Savings rate** — window net ÷ window income (0 when income is 0).
- Captions (`delta`) become the month name (e.g. "July 2026") instead of "This month".

**Global cards** (unchanged, computed over all transactions):
- **Net position** (all-time).
- **Combined balance** (account initial balances + all transactions).

When the current month is selected, the dashboard matches today's appearance (month names as captions). Selecting another month swaps the four money-flow cards to that month; the two headline position cards stay global.

## 6. Ledger (`components/transactions/transaction-list.tsx`)

Gains a `month: string` prop.

- **Filtering:** rows restricted to the month window (`date >= start && date < end`).
- **Balance column — carried-forward cumulative:**
  1. Seed balance = sum of all transactions dated before the month start.
  2. Within the month, walk transactions chronologically, accumulating onto the seed.
  3. Display newest-first (reverse the chronological pass), so each row's Balance is its true running balance.
- **Header subtitle:** month-aware, e.g. "July 2026 — every movement, with the balance after each line."
- **Empty state:** "No transactions in July 2026." with the Add button. When there are zero transactions across all history, show the original all-time message ("No transactions yet.") — the month-aware copy would be misleading for a brand-new account.
- Edit/delete/optimistic-mutation behavior unchanged; only rendered rows are filtered.

## 7. Transaction Form (`components/transactions/transaction-form.tsx`)

Gains an optional `defaultDate?: string` prop.

- For **new** transactions, the date field defaults to: today if the selected month is the current month, otherwise the 1st of the selected month.
- Editing keeps using the transaction's own date.
- Makes backfilling history in a selected month frictionless.

## 8. Shared Helper (`lib/month.ts`)

Small, pure functions used by both stat-cards and transaction-list so date math can't drift:

- `parseMonthParam(value: string | undefined): string` — validates `YYYY-MM`, falls back to current month.
- `monthWindow(month: string): { start: Date; end: Date }` — inclusive start, exclusive end.
- `monthLabel(month: string): string` — "July 2026" via date-fns.

## 9. Edge Cases

- Invalid/missing `?month=` → current month.
- Future month selected → empty ledger + zeroed month stat cards, still navigable.
- Month with no data → month-aware empty state (not the all-time one); all-time empty (no transactions at all) keeps the original "No transactions yet." message.
- Last/first month boundaries → chevrons keep stepping; empty states cover any month.

## 10. Non-Goals

- No server-side or DB-level month filtering.
- No FX conversion or multi-currency ledger changes.
- Spending chart and side panel remain global/current-month.
- No new persistence beyond the URL param.
