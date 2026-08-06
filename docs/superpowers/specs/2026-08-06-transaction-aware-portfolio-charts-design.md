# Transaction-Aware Portfolio & Holding Charts — Design

Date: 2026-08-06

## Overview

Adjust the two portfolio charts so they reflect what the user actually holds over time:

1. **Portfolio Performance** (`portfolio-chart.tsx`) currently multiplies each holding's
   *current* total shares against the full 1-year price history, so it shows value on
   dates before the user owned anything and ignores sells. It must instead derive a value
   series from the user's actual buy/sell transactions, starting at the first purchase.
2. **Holding detail chart** (`holding-price-chart.tsx`) currently shows the full 1-year
   price history regardless of when the user bought. It must start at the holding's first
   transaction date.

Both charts may need price history older than 1 year, so the market-data history range
support must be extended beyond `1y`.

## Scope

- New pure math helpers in `lib/portfolio/math.ts` (shares-over-time value series, range
  selection) with unit tests.
- Extend market-data `HistoryRange` to `3m | 6m | 1y | 2y | 5y | max` across providers and
  the API route.
- Rework `valueSeries` in `hooks/use-portfolio.ts` to be transaction-aware and
  range-aware per symbol.
- Slice holding history to the first transaction date for the holding detail chart.
- Update `AGENTS.md` if conventions/state change.

## Out of Scope

- FX conversion (unchanged; raw values summed and labeled in primary currency).
- Changing the holding chart to show position value instead of price (user chose price
  history from first buy).
- Portfolio stat cards, holdings table, forms — unchanged.

## Decisions

1. **Value series model**: per holding, build a schedule of shares held over time from
   buy/sell transactions (`transacted_at`); value on date D = shares held on D × close on
   D. Buy adds shares, sell subtracts; dividend/transfer do not change shares (consistent
   with `totalShares` in `math.ts`).
2. **Start point**: a holding's series emits points only while shares > 0, so the portfolio
   series starts at the earliest first buy and stops reflecting a holding after a full
   sell.
3. **Date comparison**: a transaction counts toward day D's close if its UTC date (the
   `YYYY-MM-DD` portion of `transacted_at`) is on or before D. History points are compared
   by their `YYYY-MM-DD` portion.
4. **Range selection**: per symbol, compute the earliest transaction date among that
   symbol's holdings and request the smallest `HistoryRange` that covers it with a small
   buffer (e.g. ~7 days). Yahoo and CoinGecko pass ranges through; Alpha Vantage uses
   `outputsize=full` when range > `1y`.
5. **Holding detail chart**: uses the already-fetched symbol history sliced to start at the
   holding's first transaction date (UTC date portion).

## Math Layer (`lib/portfolio/math.ts`)

New/updated pure functions:

```ts
export interface DatedCalcTransaction extends CalcTransaction {
  date: string; // ISO UTC date (e.g. "2026-01-15T00:00:00Z" or YYYY-MM-DD)
}

export function buildHoldingValueSeries(
  transactions: DatedCalcTransaction[],
  history: HistoryPoint[]
): ValuePoint[];
```

- Sort transactions by date ascending.
- Walk history points ascending; maintain running shares (buy `+`, sell `-`).
- Apply any transaction whose UTC date <= point's UTC date before computing that point.
- Only emit a point when running shares > 0.
- Value = running shares × `close`.

```ts
export function rangeForDate(date: string, now?: Date): HistoryRange;
```

- Returns the smallest range whose start date (today minus 3m/6m/1y/2y/5y) is <= the given
  date minus a ~7 day buffer. Falls back to `max` for anything older.
- Uses `date-fns` `subMonths`/`subYears` (already a dependency) and compares date-only
  values.

`combineValueSeries` reworked:

```ts
export function combineValueSeries(
  series: Array<{ symbol: string; points: ValuePoint[] }>
): ValuePoint[];
```

- Sums each symbol's value series by UTC date; sorts ascending. Drops the
  `sharesBySymbol` parameter (shares are now baked into each series).

`HistoryPoint` / `ValuePoint` unchanged.

## Market Data Layer

### `lib/market-data/types.ts`

```ts
export type HistoryRange = "3m" | "6m" | "1y" | "2y" | "5y" | "max";
```

### Providers

- `providers/yahoo.ts` — `getYahooHistory(symbol, range)` range type widened to
  `HistoryRange`; passes straight through to Yahoo (`range` param already accepted).
- `providers/coingecko.ts` — `getCoinGeckoHistory(symbol, range)` maps days:
  `3m→90, 6m→182, 1y→365, 2y→730, 5y→1825, max→max`.
- `providers/alphavantage.ts` — `getAlphaVantageHistory(symbol, range)` uses
  `outputsize=full` when range is `2y | 5y | max`, else `compact`.

### `lib/market-data/history.ts`

`getHistory` already accepts `HistoryRange`; `HistoryRange` widening flows through.
`MAX_POINTS` sampling unchanged.

### `app/api/market-data/route.ts`

- `RANGES` array becomes `["3m", "6m", "1y", "2y", "5y", "max"]`.

## Hook (`hooks/use-portfolio.ts`)

- Compute per-symbol earliest transaction date from `dataQuery.data.transactions` joined
  to holdings by `holding_id` → symbol. Derive the history `range` for each symbol via
  `rangeForDate`.
- Fetch `historyBySymbol` using that per-symbol range instead of hardcoded `"1y"`.
- Build each holding's value series with `buildHoldingValueSeries(transactions, history)`
  using the holding's own transactions (dates from `transacted_at`).
- `valueSeries` = `combineValueSeries(holdings.map(h => ({ symbol, points: buildHoldingValueSeries(...) })))`.
- Expose `chartHistory` on each holding: the symbol history sliced to start at that
  holding's first transaction UTC date (computed in the hook, not the component). The
  holding detail chart consumes `chartHistory` directly.
- Keep all mutations and totals logic unchanged.

## UI

### `components/portfolio/portfolio-chart.tsx`

- No chart config change; it consumes `valueSeries` already. Optionally adjust the empty
  state if no holdings/transactions exist. Ensure Y axis/labels match existing styling.

### `components/portfolio/holding-price-chart.tsx`

- Data mapping currently converts each `points` entry to `{ label, close }`. It now receives
  the already-sliced `chartHistory` from the hook (points starting at the holding's first
  transaction UTC date) and maps as before. Title/labels unchanged.

### `components/portfolio/holding-detail.tsx`

- Pass `holding.chartHistory` to `HoldingPriceChart` instead of `holding.holdingHistory`.

## Testing

- Extend `lib/portfolio/math.test.ts`:
  - `buildHoldingValueSeries`: shares ramp up/down with buys and sells; skips points before
    first buy; skips points after a full sell; dividend/transfer don't change shares;
    date comparison honors UTC date boundary.
  - `rangeForDate`: maps old dates to larger ranges; recent dates to small ranges; >5y to
    `max`.
  - `combineValueSeries`: sums two holdings by date, sorts ascending.
- `npm run build && npm test` required before completion claims.

## Verification

1. `npm run build`
2. `npm test`
3. Manual: add holdings with backdated buy/sell transactions; confirm portfolio chart starts
   at first buy and reflects sells; holding chart starts at that holding's first transaction.
4. Update `AGENTS.md` if the architecture map or conventions change.
