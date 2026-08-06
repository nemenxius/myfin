# Transaction-Aware Portfolio & Holding Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Portfolio Performance chart and each holding detail chart reflect only what the user actually held over time, starting from their first purchase.

**Architecture:** (1) Extend the market-data history range type to `3m|6m|1y|2y|5y|max` so price history can cover old purchases; (2) add pure math helpers that build a shares-over-time value series from dated buy/sell transactions and pick a history range from a date; (3) wire those into `use-portfolio.ts` so `valueSeries` is transaction-aware and each holding exposes a `chartHistory` sliced to its first transaction; (4) point the holding detail chart at `chartHistory`.

**Tech Stack:** TypeScript, date-fns v4 (`format`, `parseISO`, `subMonths`, `subYears`, `addDays`), Vitest, TanStack Query, Recharts.

## Global Constraints

- Do not change `npm run lint` (broken legacy script). Never run it.
- All tests: `npm test` (Vitest). All type/build checks: `npm run build`.
- Components do not call Supabase directly; use hooks from `hooks/`.
- Follow existing code style: no comments unless asked; `font-mono tabular-nums` for money.
- Spec: `docs/superpowers/specs/2026-08-06-transaction-aware-portfolio-charts-design.md`.
- `combineValueSeries` signature changes (drops `sharesBySymbol`) — update its only caller and its test.
- History points and transaction dates are compared by their `YYYY-MM-DD` (first 10 chars) portion.

---

### Task 1: Extend HistoryRange across the market-data layer

**Files:**
- Modify: `lib/market-data/types.ts`
- Modify: `lib/market-data/providers/yahoo.ts`
- Modify: `lib/market-data/providers/coingecko.ts`
- Modify: `lib/market-data/providers/alphavantage.ts`
- Modify: `lib/market-data/history.ts`
- Modify: `app/api/market-data/route.ts`

**Interfaces:**
- Produces: `type HistoryRange = "3m" | "6m" | "1y" | "2y" | "5y" | "max"` exported from `lib/market-data/types.ts`; `getYahooHistory(symbol, range: HistoryRange)`, `getCoinGeckoHistory(symbol, range: HistoryRange)`, `getAlphaVantageHistory(symbol, range?: HistoryRange)`. Later tasks rely on these.

- [ ] **Step 1: Widen `HistoryRange`**

In `lib/market-data/types.ts`, change:

```ts
export type HistoryRange = "3m" | "6m" | "1y";
```

to:

```ts
export type HistoryRange = "3m" | "6m" | "1y" | "2y" | "5y" | "max";
```

- [ ] **Step 2: Widen Yahoo provider**

In `lib/market-data/providers/yahoo.ts`, change the import:

```ts
import type { MarketHistoryPoint, MarketQuote } from "../types";
```

to:

```ts
import type { HistoryRange, MarketHistoryPoint, MarketQuote } from "../types";
```

And change the signature:

```ts
export async function getYahooHistory(
  symbol: string,
  range: "3m" | "6m" | "1y"
): Promise<MarketHistoryPoint[]> {
```

to:

```ts
export async function getYahooHistory(
  symbol: string,
  range: HistoryRange
): Promise<MarketHistoryPoint[]> {
```

- [ ] **Step 3: Widen CoinGecko provider**

In `lib/market-data/providers/coingecko.ts`, change the import:

```ts
import type { MarketHistoryPoint, MarketQuote } from "../types";
```

to:

```ts
import type { HistoryRange, MarketHistoryPoint, MarketQuote } from "../types";
```

And change the signature and days mapping:

```ts
export async function getCoinGeckoHistory(
  symbol: string,
  range: "3m" | "6m" | "1y"
): Promise<MarketHistoryPoint[]> {
  const key = apiKey();
  const id = coinId(symbol);
  const days = range === "3m" ? 90 : range === "6m" ? 182 : 365;
```

to:

```ts
export async function getCoinGeckoHistory(
  symbol: string,
  range: HistoryRange
): Promise<MarketHistoryPoint[]> {
  const key = apiKey();
  const id = coinId(symbol);
  const days =
    range === "3m"
      ? 90
      : range === "6m"
        ? 182
        : range === "1y"
          ? 365
          : range === "2y"
            ? 730
            : range === "5y"
              ? 1825
              : "max";
```

- [ ] **Step 4: Add range to Alpha Vantage provider**

In `lib/market-data/providers/alphavantage.ts`, change the import:

```ts
import type { MarketHistoryPoint, MarketQuote } from "../types";
```

to:

```ts
import type { HistoryRange, MarketHistoryPoint, MarketQuote } from "../types";
```

And change the function:

```ts
export async function getAlphaVantageHistory(
  symbol: string
): Promise<MarketHistoryPoint[]> {
  const key = apiKey();
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${key}`;
```

to:

```ts
export async function getAlphaVantageHistory(
  symbol: string,
  range?: HistoryRange
): Promise<MarketHistoryPoint[]> {
  const key = apiKey();
  const outputsize =
    range === "2y" || range === "5y" || range === "max" ? "full" : "compact";
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=${outputsize}&apikey=${key}`;
```

- [ ] **Step 5: Pass range through in history.ts**

In `lib/market-data/history.ts`, change the Alpha Vantage fallback call:

```ts
    () => getAlphaVantageHistory(symbol),
```

to:

```ts
    () => getAlphaVantageHistory(symbol, range),
```

- [ ] **Step 6: Widen allowed ranges in the API route**

In `app/api/market-data/route.ts`, change:

```ts
const RANGES: HistoryRange[] = ["3m", "6m", "1y"];
```

to:

```ts
const RANGES: HistoryRange[] = ["3m", "6m", "1y", "2y", "5y", "max"];
```

- [ ] **Step 7: Type-check and commit**

Run: `npm run build`
Expected: build succeeds (type-checks pass).

```bash
git add lib/market-data/types.ts lib/market-data/providers/yahoo.ts lib/market-data/providers/coingecko.ts lib/market-data/providers/alphavantage.ts lib/market-data/history.ts app/api/market-data/route.ts
git commit -m "feat: extend market data history ranges to 2y/5y/max"
```

---

### Task 2: Transaction-aware value series math helpers

**Files:**
- Modify: `lib/portfolio/math.ts`
- Modify: `lib/portfolio/math.test.ts`

**Interfaces:**
- Consumes: `HistoryRange` from `lib/market-data/types.ts`; `CalcTransaction`, `HistoryPoint`, `ValuePoint` (already in `math.ts`).
- Produces:
  - `export interface DatedCalcTransaction extends CalcTransaction { date: string }`
  - `export function buildHoldingValueSeries(transactions: DatedCalcTransaction[], history: HistoryPoint[]): ValuePoint[]`
  - `export function rangeForDate(date: string, now?: Date): HistoryRange`
  - `export function combineValueSeries(series: Array<{ symbol: string; points: ValuePoint[] }>): ValuePoint[]`

- [ ] **Step 1: Write the failing tests**

Append to `lib/portfolio/math.test.ts`:

```ts
import {
  addDays,
  format,
  parseISO,
  subMonths,
  subYears,
} from "date-fns";
```

and replace the existing `combineValueSeries` describe block:

```ts
const datedBuy = (shares: number, price: number, date: string): DatedCalcTransaction => ({
  type: "buy",
  shares,
  pricePerShare: price,
  commission: 0,
  date,
});
const datedSell = (shares: number, price: number, date: string): DatedCalcTransaction => ({
  type: "sell",
  shares,
  pricePerShare: price,
  commission: 0,
  date,
});

describe("buildHoldingValueSeries", () => {
  const history = [
    { date: "2026-01-01T00:00:00Z", close: 100 },
    { date: "2026-01-02T00:00:00Z", close: 110 },
    { date: "2026-01-03T00:00:00Z", close: 120 },
  ];

  it("skips points before the first buy and multiplies running shares by close", () => {
    const txs = [datedBuy(2, 100, "2026-01-02T10:00:00Z")];
    expect(buildHoldingValueSeries(txs, history)).toEqual([
      { date: "2026-01-02", value: 220 },
      { date: "2026-01-03", value: 240 },
    ]);
  });

  it("reflects sells and stops emitting after a full sell", () => {
    const txs = [
      datedBuy(10, 100, "2026-01-01T00:00:00Z"),
      datedSell(4, 120, "2026-01-02T00:00:00Z"),
    ];
    expect(buildHoldingValueSeries(txs, history)).toEqual([
      { date: "2026-01-01", value: 1000 },
      { date: "2026-01-02", value: 6 * 110 },
      { date: "2026-01-03", value: 6 * 120 },
    ]);
  });

  it("ignores dividend and transfer types for the share schedule", () => {
    const txs = [
      datedBuy(5, 100, "2026-01-01T00:00:00Z"),
      { ...datedBuy(0, 0, "2026-01-02T00:00:00Z"), type: "dividend" },
      { ...datedSell(0, 0, "2026-01-02T00:00:00Z"), type: "transfer" },
    ];
    expect(buildHoldingValueSeries(txs, history)).toEqual([
      { date: "2026-01-01", value: 500 },
      { date: "2026-01-02", value: 550 },
      { date: "2026-01-03", value: 600 },
    ]);
  });
});

describe("rangeForDate", () => {
  const now = new Date("2026-08-06T12:00:00Z");

  it("maps recent dates to small ranges", () => {
    expect(rangeForDate("2026-06-01", now)).toBe("3m");
  });

  it("maps dates older than 6 months to 1y and older than 2y to 5y", () => {
    expect(rangeForDate(format(subMonths(now, 10), "yyyy-MM-dd"), now)).toBe("1y");
    expect(rangeForDate(format(subYears(now, 3), "yyyy-MM-dd"), now)).toBe("5y");
  });

  it("returns max for dates older than 5 years", () => {
    expect(rangeForDate(format(subYears(now, 7), "yyyy-MM-dd"), now)).toBe("max");
  });

  it("applies a 7 day buffer so the range starts before the purchase", () => {
    const boundary = format(addDays(subMonths(now, 3), -8), "yyyy-MM-dd");
    expect(rangeForDate(boundary, now)).toBe("6m");
  });
});

describe("combineValueSeries", () => {
  it("sums multiple holdings by day and sorts ascending", () => {
    const series = combineValueSeries([
      {
        symbol: "AAPL",
        points: [
          { date: "2026-01-01", value: 400 },
          { date: "2026-01-02", value: 220 },
        ],
      },
      { symbol: "BTC", points: [{ date: "2026-01-01", value: 50 }] },
    ]);
    expect(series).toEqual([
      { date: "2026-01-01", value: 450 },
      { date: "2026-01-02", value: 220 },
    ]);
  });
});
```

Update the existing test's import block to include the new names:

```ts
import {
  avgPrice,
  buildHoldingValueSeries,
  combineValueSeries,
  computeCostBasis,
  computeCurrentValue,
  computeHoldingCalculations,
  rangeForDate,
  sumCommissions,
  totalShares,
  type CalcTransaction,
  type DatedCalcTransaction,
} from "./math";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `buildHoldingValueSeries`, `rangeForDate` not defined; `combineValueSeries` arity/type errors.

- [ ] **Step 3: Implement the math helpers**

In `lib/portfolio/math.ts`, replace the `combineValueSeries` function (current lines 82-97):

```ts
export function combineValueSeries(
  seriesBySymbol: Array<{ symbol: string; points: HistoryPoint[] }>,
  sharesBySymbol: Record<string, number>
): ValuePoint[] {
  const byDate = new Map<string, number>();
  for (const { symbol, points } of seriesBySymbol) {
    const shares = sharesBySymbol[symbol] ?? 0;
    for (const point of points) {
      const day = point.date.slice(0, 10);
      byDate.set(day, (byDate.get(day) ?? 0) + point.close * shares);
    }
  }
  return Array.from(byDate.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
```

with:

```ts
export interface DatedCalcTransaction extends CalcTransaction {
  date: string;
}

export function buildHoldingValueSeries(
  transactions: DatedCalcTransaction[],
  history: HistoryPoint[]
): ValuePoint[] {
  const schedule = transactions
    .filter((t) => t.type === "buy" || t.type === "sell")
    .map((t) => ({
      day: t.date.slice(0, 10),
      shares: t.type === "buy" ? t.shares : -t.shares,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const points: ValuePoint[] = [];
  let txIndex = 0;
  let shares = 0;
  for (const point of history) {
    const day = point.date.slice(0, 10);
    while (txIndex < schedule.length && schedule[txIndex].day <= day) {
      shares += schedule[txIndex].shares;
      txIndex++;
    }
    if (shares > 0) {
      points.push({ date: day, value: shares * point.close });
    }
  }
  return points;
}

export function rangeForDate(date: string, now: Date = new Date()): HistoryRange {
  const target = format(addDays(parseISO(date.slice(0, 10)), -7), "yyyy-MM-dd");
  const boundaries: Array<[HistoryRange, string]> = [
    ["3m", format(subMonths(now, 3), "yyyy-MM-dd")],
    ["6m", format(subMonths(now, 6), "yyyy-MM-dd")],
    ["1y", format(subYears(now, 1), "yyyy-MM-dd")],
    ["2y", format(subYears(now, 2), "yyyy-MM-dd")],
    ["5y", format(subYears(now, 5), "yyyy-MM-dd")],
  ];
  for (const [range, boundary] of boundaries) {
    if (target >= boundary) return range;
  }
  return "max";
}

export function combineValueSeries(
  series: Array<{ symbol: string; points: ValuePoint[] }>
): ValuePoint[] {
  const byDate = new Map<string, number>();
  for (const { points } of series) {
    for (const point of points) {
      const day = point.date.slice(0, 10);
      byDate.set(day, (byDate.get(day) ?? 0) + point.value);
    }
  }
  return Array.from(byDate.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
```

Add the import at the top of `lib/portfolio/math.ts` (first line, before existing code):

```ts
import {
  addDays,
  format,
  parseISO,
  subMonths,
  subYears,
} from "date-fns";
import type { HistoryRange } from "@/lib/market-data/types";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add lib/portfolio/math.ts lib/portfolio/math.test.ts
git commit -m "feat: add transaction-aware value series and range selection math"
```

---

### Task 3: Wire transaction-aware series into use-portfolio

**Files:**
- Modify: `hooks/use-portfolio.ts`

**Interfaces:**
- Consumes: `buildHoldingValueSeries`, `combineValueSeries`, `rangeForDate`, `DatedCalcTransaction` from `lib/portfolio/math`; `HistoryRange` implicitly via `rangeForDate` return.
- Produces: `valueSeries: ValuePoint[]` (transaction-aware); `HoldingWithCalculations.chartHistory: MarketHistoryPoint[]`; per-symbol history fetched with a computed range. Later task relies on `chartHistory`.

- [ ] **Step 1: Update imports**

In `hooks/use-portfolio.ts`, replace the import from `@/lib/portfolio/math`:

```ts
import {
  combineValueSeries,
  computeHoldingCalculations,
  type CalcTransaction,
  type ValuePoint,
} from "@/lib/portfolio/math";
```

with:

```ts
import {
  buildHoldingValueSeries,
  combineValueSeries,
  computeHoldingCalculations,
  rangeForDate,
  type CalcTransaction,
  type DatedCalcTransaction,
  type ValuePoint,
} from "@/lib/portfolio/math";
```

- [ ] **Step 2: Add `chartHistory` to the holding interface**

In `hooks/use-portfolio.ts`, in `HoldingWithCalculations`, after the `holdingHistory` line:

```ts
  holdingHistory: MarketHistoryPoint[];
```

add:

```ts
  chartHistory: MarketHistoryPoint[];
```

- [ ] **Step 3: Add a dated-transaction converter**

After the existing `toCalcTransactions` function (around line 107), add:

```ts
function toDatedCalcTransactions(
  transactions: HoldingTransaction[]
): DatedCalcTransaction[] {
  return transactions.map((t) => ({
    type: t.type,
    shares: t.shares,
    pricePerShare: t.price_per_share,
    commission: t.commission,
    date: t.transacted_at,
  }));
}
```

- [ ] **Step 4: Compute per-symbol history range**

In `useHoldings()`, after the `symbols` useMemo, add:

```ts
  const rangeBySymbol = useMemo(() => {
    const data = dataQuery.data;
    const earliest = new Map<string, string>();
    if (!data) return earliest;
    const symbolById = new Map(
      data.holdings.map((h) => [h.id, h.symbol] as const)
    );
    for (const t of data.transactions) {
      const symbol = symbolById.get(t.holding_id);
      if (!symbol) continue;
      const day = t.transacted_at.slice(0, 10);
      const current = earliest.get(symbol);
      if (current === undefined || day < current) earliest.set(symbol, day);
    }
    return earliest;
  }, [dataQuery.data]);
```

- [ ] **Step 5: Fetch history with the computed range**

Replace the `histories` useQueries block:

```ts
  const histories = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["portfolio", "history", symbol],
      queryFn: () => fetchHistory(symbol, "1y"),
      enabled: symbols.length > 0,
      staleTime: 300_000,
      retry: 1,
    })),
  });
```

with:

```ts
  const histories = useQueries({
    queries: symbols.map((symbol) => {
      const earliest = rangeBySymbol.get(symbol);
      const range = earliest ? rangeForDate(earliest) : "1y";
      return {
        queryKey: ["portfolio", "history", symbol],
        queryFn: () => fetchHistory(symbol, range),
        enabled: symbols.length > 0,
        staleTime: 300_000,
        retry: 1,
      };
    }),
  });
```

- [ ] **Step 6: Populate `chartHistory` on each holding**

In `useHoldings()`, inside the `holdings` useMemo `.map` callback, replace:

```ts
      return {
        ...holding,
        transactions,
        ...calc,
        quote,
        holdingHistory: historyBySymbol.get(holding.symbol) ?? [],
      };
```

with:

```ts
      const holdingHistory = historyBySymbol.get(holding.symbol) ?? [];
      const firstTxDay = transactions.length
        ? transactions.map((t) => t.transacted_at.slice(0, 10)).sort()[0]
        : null;
      const chartHistory = firstTxDay
        ? holdingHistory.filter((p) => p.date.slice(0, 10) >= firstTxDay)
        : [];
      return {
        ...holding,
        transactions,
        ...calc,
        quote,
        holdingHistory,
        chartHistory,
      };
```

- [ ] **Step 7: Build the transaction-aware `valueSeries`**

Replace the `valueSeries` useMemo:

```ts
  const valueSeries = useMemo<ValuePoint[]>(() => {
    const sharesBySymbol: Record<string, number> = {};
    for (const h of holdings) sharesBySymbol[h.symbol] = h.totalShares;
    return combineValueSeries(
      holdings.map((h) => ({
        symbol: h.symbol,
        points: historyBySymbol.get(h.symbol) ?? [],
      })),
      sharesBySymbol
    );
  }, [holdings, historyBySymbol]);
```

with:

```ts
  const valueSeries = useMemo<ValuePoint[]>(() => {
    return combineValueSeries(
      holdings.map((h) => ({
        symbol: h.symbol,
        points: buildHoldingValueSeries(
          toDatedCalcTransactions(h.transactions),
          historyBySymbol.get(h.symbol) ?? []
        ),
      }))
    );
  }, [holdings, historyBySymbol]);
```

- [ ] **Step 8: Build and commit**

Run: `npm run build`
Expected: build succeeds (type-checks pass).

```bash
git add hooks/use-portfolio.ts
git commit -m "feat: make portfolio value series transaction-aware and slice holding history to first buy"
```

---

### Task 4: Point the holding detail chart at chartHistory

**Files:**
- Modify: `components/portfolio/holding-detail.tsx`

**Interfaces:**
- Consumes: `HoldingWithCalculations.chartHistory` from Task 3.
- Produces: `HoldingPriceChart` receives price history starting at the holding's first transaction.

- [ ] **Step 1: Use `chartHistory`**

In `components/portfolio/holding-detail.tsx`, change:

```ts
  const hasQuote = holding.quote !== null;
  const history = holding.holdingHistory ?? [];
```

to:

```ts
  const hasQuote = holding.quote !== null;
  const history = holding.chartHistory ?? [];
```

- [ ] **Step 2: Build and commit**

Run: `npm run build`
Expected: build succeeds.

```bash
git add components/portfolio/holding-detail.tsx
git commit -m "feat: show holding price history from first purchase date"
```

---

### Task 5: Docs and full verification

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update AGENTS.md feature state**

In `AGENTS.md`, under `## 6. Current Feature State`, add a Portfolio bullet describing the new behavior (e.g. after the existing portfolio bullets):

```markdown
- The Portfolio Performance chart and each holding's price chart are transaction-aware:
  value series reflect actual buy/sell dates (starting at the first purchase), holding
  charts start at that holding's first transaction, and price history is fetched at a
  per-symbol range (`3m`/`6m`/`1y`/`2y`/`5y`/`max`) derived from the earliest transaction.
```

- [ ] **Step 2: Full verification**

Run: `npm run build && npm test`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: note transaction-aware portfolio charts"
```
