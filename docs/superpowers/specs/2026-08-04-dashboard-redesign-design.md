# Dashboard Redesign — Design Spec

**Date:** 2026-08-04
**Status:** Approved
**Direction:** Modern fintech / data-dense (Approach A — Clean fintech grid)

## Problem

The current dashboard is dominated by a large navy "jumbotron" (`BalanceOverview`) that:
- takes up too much vertical space and overwhelms the rest of the page,
- arranges net position / income / spending / trend in an awkward layout,
- lacks visual interest.

A white "Spending this month" banner (`InsightBanner`) overlaps the jumbotron, adding clutter.

## Goal

Replace the jumbotron with a clean, data-dense fintech layout: a responsive row of stat cards, a chart + side-panel grid, and a full-width ledger. No schema or data-layer changes — everything is computed client-side from the existing `useTransactions` and `useAccounts` hooks.

## Page Structure (top to bottom)

1. **Stat card row** — replaces the jumbotron entirely.
2. **Chart + side panel** — 2/3 + 1/3 grid.
3. **Ledger** — full-width, restyled to match.

## 1. Stat Card Row

Responsive grid: 2 columns on mobile, 3 on tablet, 6 on desktop. Six cards, equal height:

| Card | Value | Time frame |
|------|-------|-----------|
| Net position | income − expense (all-time) | all-time |
| Savings rate | (income − spending) / income | all-time |
| Income | Σ positive amounts | this month |
| Spending | Σ |amount| of negative amounts | this month |
| This month's net | this-month income − this-month spending | this month |
| Accounts | count + combined balance | all-time |

**Card anatomy:** thin border, white card, small icon chip, uppercase micro-label, mono tabular value, and a small delta/context line. The net-position card gets a mini sparkline. No heavy shadows — a hairline border and a soft hover lift.

## 2. Chart + Side Panel

**Left (2/3):** the 6-month spending area chart, restyled to match the new look (spending only, unchanged data).

**Right (1/3):** a stacked side panel of three compact cards:
- **This month's spending** — total with a thin progress bar comparing to last month.
- **Category donut + top categories** — a donut of this month's spending by category using the brand palette (navy/teal/leaf/ember), beside a top-3 categories list with amounts.
- **Account balances** — each account with its computed balance (`initial_balance` + Σ transactions).

## 3. Ledger

Kept functionally as-is; restyled to match the new card treatment.

## Removals

- `BalanceOverview` (jumbotron) — replaced by the stat card row.
- `InsightBanner` — removed; its "spending this month" info moves into the side panel.

## Files

- **New:** `components/dashboard/stat-card.tsx`, `components/dashboard/stat-cards.tsx`, `components/dashboard/side-panel.tsx`.
- **Rework:** `components/dashboard/spending-chart.tsx` (restyle), `app/dashboard/page.tsx` (new composition).
- **Remove:** `components/dashboard/balance-overview.tsx`, `components/dashboard/insight-banner.tsx`.

## Data & Dependencies

- Uses existing `useTransactions` and `useAccounts` hooks.
- `formatCurrency` from `lib/format.ts`.
- Recharts for the area chart and donut.
- Brand tokens from `app/globals.css` (navy `#083458`, teal `#18848C`, leaf `#0E7C5B`, ember `#C0392B`, paper `#F4F5F3`, ink `#0B1C28`, fog `#6C7A83`).
- Mono + tabular-nums for all money figures.

## Out of Scope

- No database/schema changes.
- No changes to transaction/account CRUD.
- No dark-mode-specific work beyond using existing tokens.
