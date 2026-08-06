# Portfolio & Investment Tracking — Design

Date: 2026-08-06

## Overview

Add a Portfolio module to MyFin so users can track investment holdings (stocks, ETFs,
mutual funds, crypto) by logging buy/sell/dividend transactions over time, viewing live
market prices, and seeing visual performance charts.

## Scope

- Database: `portfolio_holdings` + `holding_transactions` tables with RLS.
- Market data: server Route Handler proxying free public quote/history endpoints, cached.
- Data hooks: TanStack Query hooks with optimistic updates (matching `useTransactions`).
- UI: portfolio overview route, holding detail route, holding transaction form, holdings
  table, holding transactions table.
- Types: hand-edited `types/database.ts` (Supabase CLI is not installed).

## Out of Scope

- FX conversion between holding currency and display currency (consistent with existing
  app behavior: raw values are labeled in primary currency).
- Brokerage account linking / real-time websocket feeds.
- Dividend reinvestment modeling beyond a simple `dividend` transaction type.

## Decisions

1. **Migration number**: `007_portfolio_and_holdings.sql` (005/006 already exist).
2. **Portfolio chart**: combined daily value computed by summing each holding's daily
   `close * totalShares` per date across holdings.
3. **Market data source**: Yahoo Finance `/v8/finance/chart/{symbol}` as primary (no API
   key). Fallbacks: Alpha Vantage / CoinGecko, only when their env keys are set.
4. **Types regeneration**: hand-edit `types/database.ts`; document the manual step.

## Database Schema

### `portfolio_holdings`

| column      | type                       | notes                                  |
| ----------- | -------------------------- | -------------------------------------- |
| id          | uuid PK default gen_random_uuid() |                                    |
| user_id     | uuid NOT NULL              | FK profiles(id) ON DELETE CASCADE      |
| symbol      | text NOT NULL              | e.g. AAPL, VWCE.DE, BTC                |
| name        | text                       | optional display name                  |
| asset_type  | text NOT NULL              | CHECK in (stock, etf, crypto, fund, other) |
| currency    | text NOT NULL default 'USD'| holding display currency               |
| created_at  | timestamptz default now()  |                                          |
| updated_at  | timestamptz default now()  |                                          |

- UNIQUE `(user_id, symbol)`.
- updated_at trigger to bump on UPDATE.

### `holding_transactions`

| column          | type                  | notes                                    |
| --------------- | --------------------- | ---------------------------------------- |
| id              | uuid PK default gen_random_uuid() |                               |
| holding_id      | uuid NOT NULL         | FK portfolio_holdings(id) ON DELETE CASCADE |
| user_id         | uuid NOT NULL         | FK profiles(id) ON DELETE CASCADE        |
| type            | text NOT NULL         | CHECK in (buy, sell, dividend, transfer) |
| shares          | numeric(18,8) NOT NULL| fractional shares supported              |
| price_per_share | numeric(14,4) NOT NULL|                                           |
| commission      | numeric(12,2) NOT NULL default 0.00 |                              |
| transacted_at   | timestamptz NOT NULL  |                                           |
| notes           | text                  | optional                                 |
| created_at      | timestamptz default now() |                                        |

### RLS

- Enable RLS on both tables.
- `auth.uid() = user_id` for ALL on both.
- INSERT/UPDATE WITH CHECK on `holding_transactions`: `holding_id` must belong to the
  same user (join to portfolio_holdings).

### Indexes

- `idx_portfolio_holdings_user_symbol` on `(user_id, symbol)`.
- `idx_holding_transactions_holding_id` on `(holding_id)`.
- `idx_holding_transactions_user_id` on `(user_id)`.

## Market Data Layer

### `lib/market-data/`

- `types.ts` — shared types: `MarketQuote`, `MarketHistoryPoint`, `HistoryRange`.
- `providers/yahoo.ts` — fetch from `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}`.
- `providers/alphavantage.ts` — used only when `ALPHA_VANTAGE_API_KEY` is set.
- `providers/coingecko.ts` — used only when `COINGECKO_API_KEY` is set.
- `quote.ts` — `getQuote(symbol)`: tries providers in order, falls through on failure.
- `history.ts` — `getHistory(symbol, range)`: same fallback order.
- `cache.ts` — in-memory TTL cache (60s quotes, 5min history) with `Map`.

Data normalization:
- Quote → `{ currentPrice, change24h, changePercent24h, currency, previousClose }`.
- History → `[{ date: ISO, close: number }]` sorted ascending, sampled to a sane max
  point count (e.g. ≤ 366 points for 1y).

### `app/api/market-data/route.ts`

- GET handler, guarded by `createClient()` auth check (401 if unauthenticated).
- Query params: `symbol`, `action` (`quote` | `history`), optional `range` (default `1y`).
- Sets `Cache-Control: public, max-age=60` for quotes / `max-age=300` for history.
- Returns JSON; errors mapped to 400/404/502.

## Hooks (`hooks/use-portfolio.ts`)

All client-side via `supabaseClient`, mirroring `useTransactions`/`useAccounts` patterns
(resolve `user_id` inside mutations via `auth.getUser()`).

Types (client-side, wrapping generated DB types):

```ts
type Holding = Tables<"portfolio_holdings">;
type HoldingTransaction = Tables<"holding_transactions">;

interface HoldingWithCalculations extends Holding {
  totalShares: number;
  avgPrice: number;
  costBasis: number;      // totalShares * avgPrice + commissions
  currentValue: number;   // totalShares * currentPrice
  totalChange: number;    // currentValue - costBasis
  totalChangePercent: number;
  dailyChange: number;    // (currentPrice - previousClose) * totalShares
  dailyChangePercent: number;
  quote: MarketQuote | null;
  transactions: HoldingTransaction[];
}
```

Calculations (per spec):
- `totalShares = sum(buys) - sum(sells)`.
- `avgPrice = (weighted cost of buys) / total bought shares`.
- `costBasis = totalShares * avgPrice + sum(commissions)`.
- `currentValue = totalShares * currentPrice`.
- `totalChange = currentValue - costBasis`.
- `dailyChange = (currentPrice - previousClose) * totalShares`.

### Exports

- `useHoldings()` — fetches holdings + transactions; per-symbol quotes (parallel queries,
  individually resilient); computes `HoldingWithCalculations[]`; exposes combined
  portfolio `valueSeries` for the overview chart; aggregates portfolio totals
  (total value, cost basis, total return $/%, 24h change $/%).
- `useCreateHoldingWithTransaction()` — insert holding (if symbol doesn't exist for user)
  then insert first transaction; single mutation; optimistic update; rollback on error;
  invalidate on settle.
- `useAddHoldingTransaction()` — insert transaction for existing holding; optimistic
  update; rollback; invalidate.
- `useUpdateHoldingTransaction()` — update transaction row.
- `useDeleteHoldingTransaction()` — delete transaction row.
- `useDeleteHolding()` — delete holding (cascades transactions).
- `useHolding(id)` — convenience wrapper selecting one holding from `useHoldings`.

## UI

### Components

#### `components/portfolio/holding-form.tsx`

- Props: `open`, `onOpenChange`, `holding?` (editing existing = add-transaction mode),
  `defaultSymbol?`.
- Inputs:
  - Symbol (text; on blur/type debounced fetch of live price via `/api/market-data`
    to pre-fill Price Per Share).
  - Transaction type Select (Buy | Sell | Dividend | Transfer).
  - Asset type Select (Stock | ETF | Crypto | Fund | Other) — only when creating a holding.
  - Name (optional) — only when creating a holding.
  - Shares / quantity (number, decimals).
  - Price per share (number, editable, auto-filled).
  - Commission (number, default 0).
  - Date & time (local datetime input → ISO via lib/date helpers).
- Validation:
  - Symbol required + uppercase normalization.
  - Shares > 0.
  - Price > 0.
  - Cannot sell more shares than currently owned (uses current totalShares).
  - Dividend/transfer: price may be 0 (validated contextually).
- Uses Button, Dialog, Input, Label, Select primitives (matching transaction-form).

#### `components/portfolio/holdings-table.tsx`

- Columns: Ticker/Name (with asset-type badge), Total Shares (font-mono), Average Price,
  Current Price, Current Value, Cost Basis, Daily Change (green/red), Total Return
  (% and $).
- Row: click → `/dashboard/portfolio/[id]`; "+" button → opens holding-form pre-filled
  for quick transaction.
- Row dropdown: Edit holding, Delete holding (alert-dialog confirm).
- Empty state: icon + "No holdings added yet. Track your first investment." + CTA.

#### `components/portfolio/holding-transactions-table.tsx`

- Props: `holdingId`.
- Columns: Date, Type badge, Shares, Price per share, Total Value, Commission, actions
  (edit / delete).
- Edit opens holding-form in edit-transaction mode; delete via alert-dialog.

#### `components/portfolio/portfolio-stats.tsx`

- Four stat cards: Total Portfolio Value, Total Cost Basis, Total Return ($ and %),
  24h Change ($ and %). Reuses `StatCard`.

### Routes

#### `app/dashboard/portfolio/page.tsx`

- Server component: renders `<PortfolioOverview />` (client) — header stats, performance
  AreaChart (combined daily value), holdings table.
- Add "Portfolio" nav item in `components/dashboard/header.tsx`.

#### `app/dashboard/portfolio/[id]/page.tsx`

- Server component reading `params`; renders `<HoldingDetail holdingId={id} />`.
- Header: ticker, full name, live price, position summary.
- Recharts AreaChart of this symbol's daily history.
- `holding-transactions-table.tsx`.

## Error Handling

- Market data failures are non-fatal: quote is `null`, UI shows "—"; holdings still render
  from cost-basis data.
- Mutations follow the established onMutate/onError/onSettled optimistic pattern.
- Form submit errors shown inline (submitError box pattern from account-form).

## Testing

- Add unit tests for `lib/portfolio/math.ts` (pure calculation helpers: totals, avg price,
  cost basis, change, combined series) — follows `lib/ledger.test.ts` style.
- Existing test count will grow accordingly.
- No UI component tests in this codebase currently; keep parity.

## Verification

1. `npx tsc --noEmit`
2. `npm run build && npm test`
3. Update `AGENTS.md` (architecture map + migration state).
