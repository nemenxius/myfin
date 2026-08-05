# Currency Handling — Design Spec

**Date:** 2026-08-04
**Status:** Approved
**Direction:** Approach A — Shared currency utils

## Problem

Accounts have a `currency` field (set in the account form), but every money figure in the app renders as USD regardless. `lib/format.ts` `formatCurrency` is hardcoded to `"en-US"` / `"USD"`. The chosen currency is effectively ignored.

## Goal

Respect the currency chosen on each account:
- **Aggregate displays** (dashboard stat cards, spending chart, ledger, side-panel monthly totals) use a single **primary currency** — the first account's currency, falling back to `USD` when no accounts exist.
- **Per-account displays** (account list balances, side-panel account balances) use that account's own currency.
- The account form's free-text currency field becomes a curated dropdown of common ISO 4217 codes, so stored values are always valid and normalized (uppercase ISO codes).

No schema changes. Single-currency-per-user assumption: no FX conversion.

## Changes

### 1. `lib/format.ts`
- `formatCurrency(amount: number, currency = "USD")` → pass `currency` to `Intl.NumberFormat` (locale stays `en-US`).
- Backwards compatible: existing callers keep working, defaulting to USD.

### 2. New `hooks/use-primary-currency.ts`
- Wraps `useAccounts()`.
- Returns `currency` = the currency of the first account in the `useAccounts()` result, or `"USD"` if no accounts. Note: accounts are fetched ordered by `name` ascending (no `created_at` column exists), so "first account" = alphabetically first by name. This is the documented behavior.
- Also returns `isLoading` / `isError` from the underlying query.
- Used by all aggregate displays.

### 3. New `components/accounts/account-currencies.ts`
- `CURRENCIES` constant: `[{ value, label }]` for common ISO 4217 codes (USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY, SEK, etc.).
- Label format: `"USD — US Dollar"`.
- Mirrors the `ACCOUNT_TYPES` pattern in `account-types.ts`.

### 4. `components/accounts/account-form.tsx`
- Replace the free-text currency `Input` with a `Select` driven by `CURRENCIES`.
- Default to `"USD"`.
- When editing an account whose currency isn't in the list, it still renders as the selected value.

### 5. Aggregate displays → primary currency
Files: `components/dashboard/stat-cards.tsx`, `components/dashboard/spending-chart.tsx`, `components/dashboard/side-panel.tsx` (monthly spend + category donut), `components/transactions/transaction-list.tsx` (ledger amounts + running balance).
- Each calls `usePrimaryCurrency()` and passes `currency` to `formatCurrency`.

### 6. Per-account displays → account's own currency
Files: `components/accounts/account-list.tsx` (balance + total), `components/dashboard/side-panel.tsx` (account balances list).
- Pass `account.currency` to `formatCurrency`.

## Files

- **Modify:** `lib/format.ts`, `components/accounts/account-form.tsx`, `components/accounts/account-list.tsx`, `components/dashboard/stat-cards.tsx`, `components/dashboard/spending-chart.tsx`, `components/dashboard/side-panel.tsx`, `components/transactions/transaction-list.tsx`.
- **Create:** `hooks/use-primary-currency.ts`, `components/accounts/account-currencies.ts`.

## Out of Scope

- No database/schema changes.
- No FX rate conversion or multi-currency aggregation.
- No user-profile currency setting.
- No changes to transaction/account CRUD hooks.
