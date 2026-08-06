# Portfolio & Investment Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Portfolio module to MyFin: holdings, buy/sell/dividend transaction logs, live market data, and performance charts.

**Architecture:** Two new DB tables with RLS; a server Route Handler (`/api/market-data`) proxying Yahoo Finance (primary, no key) with Alpha Vantage / CoinGecko env-key fallbacks and an in-memory TTL cache; a TanStack Query hook (`use-portfolio.ts`) that joins holdings + transactions with market data and computes investment metrics; client components under `components/portfolio/` and routes under `app/dashboard/portfolio/`.

**Tech Stack:** Next.js 16 App Router, React 19, Base UI + shadcn-style primitives, TanStack Query v5, Recharts 3, Supabase (raw client, no ORM), Vitest.

## Global Constraints

- Never call Supabase directly from components — only through hooks in `hooks/`.
- Browser data uses `supabaseClient` from `lib/supabase/client.ts`; server code uses `createClient()` from `lib/supabase/server.ts`.
- Use `Tables<T>` / `TablesInsert<T>` from `types/database.ts`; do not handwrite row aliases.
- Mutations: `onMutate` snapshot/optimistic, `onError` rollback, `onSettled` invalidate.
- Migration number is `007` (005/006 already exist). Supabase CLI not installed → hand-edit `types/database.ts`.
- Do NOT run `npm run lint` (broken script). Verify with `npx tsc --noEmit`, `npm run build`, `npm test`.
- Brand colors: navy `#083458`, teal `#18848C`, ink `#0B1C28`, fog `#6C7A83`, leaf `#0E7C5B`, ember `#C0392B`. Money uses `font-mono tabular-nums`.
- Base UI quirks: `Button` uses `render` not `asChild`; `Select` `onValueChange` passes `string | null`; no date-picker primitive exists (use native `<Input type="date">` / `type="time">`).
- Tests live next to lib code (`lib/**/*.test.ts`) and run under Vitest; only pure logic is unit-tested in this repo.

---

### Task 1: Migration `007` + types

**Files:**
- Create: `supabase/migrations/007_portfolio_and_holdings.sql`
- Modify: `types/database.ts`

**Interfaces:**
- Produces: DB table names `portfolio_holdings` and `holding_transactions`; generated types consumed by Task 5.

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/007_portfolio_and_holdings.sql`:

```sql
-- supabase/migrations/007_portfolio_and_holdings.sql

-- 1. PORTFOLIO HOLDINGS
CREATE TABLE portfolio_holdings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT,
  asset_type TEXT CHECK (asset_type IN ('stock', 'etf', 'crypto', 'fund', 'other')) NOT NULL,
  currency TEXT DEFAULT 'USD' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE (user_id, symbol)
);

-- 2. HOLDING TRANSACTIONS
CREATE TABLE holding_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  holding_id UUID REFERENCES portfolio_holdings(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT CHECK (type IN ('buy', 'sell', 'dividend', 'transfer')) NOT NULL,
  shares NUMERIC(18,8) NOT NULL,
  price_per_share NUMERIC(14,4) NOT NULL,
  commission NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
  transacted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ENABLE RLS
ALTER TABLE portfolio_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE holding_transactions ENABLE ROW LEVEL SECURITY;

-- POLICIES
CREATE POLICY "Users can manage own holdings" ON portfolio_holdings
FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own holding transactions" ON holding_transactions
FOR ALL USING (auth.uid() = user_id);

-- holding_id must reference a holding owned by the same user
CREATE POLICY "Holding transactions must reference own holding" ON holding_transactions
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM portfolio_holdings
    WHERE portfolio_holdings.id = holding_id AND portfolio_holdings.user_id = auth.uid()
  )
);

CREATE POLICY "Holding transactions must reference own holding on update" ON holding_transactions
FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
  EXISTS (
    SELECT 1 FROM portfolio_holdings
    WHERE portfolio_holdings.id = holding_id AND portfolio_holdings.user_id = auth.uid()
  )
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER portfolio_holdings_set_updated_at
BEFORE UPDATE ON portfolio_holdings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- INDEXES
CREATE INDEX idx_portfolio_holdings_user_symbol ON portfolio_holdings(user_id, symbol);
CREATE INDEX idx_holding_transactions_holding_id ON holding_transactions(holding_id);
CREATE INDEX idx_holding_transactions_user_id ON holding_transactions(user_id);
```

- [ ] **Step 2: Add tables to `types/database.ts`**

Insert `portfolio_holdings` between the `profiles` and `transactions` blocks in the `public.Tables` map:

```ts
      portfolio_holdings: {
        Row: {
          asset_type: string
          created_at: string
          currency: string
          id: string
          name: string | null
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_type: string
          created_at?: string
          currency?: string
          id?: string
          name?: string | null
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_type?: string
          created_at?: string
          currency?: string
          id?: string
          name?: string | null
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_holdings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
```

Add `holding_transactions` after `portfolio_holdings`:

```ts
      holding_transactions: {
        Row: {
          commission: number
          created_at: string
          holding_id: string
          id: string
          notes: string | null
          price_per_share: number
          shares: number
          transacted_at: string
          type: string
          user_id: string
        }
        Insert: {
          commission?: number
          created_at?: string
          holding_id: string
          id?: string
          notes?: string | null
          price_per_share: number
          shares: number
          transacted_at?: string
          type: string
          user_id: string
        }
        Update: {
          commission?: number
          created_at?: string
          holding_id?: string
          id?: string
          notes?: string | null
          price_per_share?: number
          shares?: number
          transacted_at?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holding_transactions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "portfolio_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/007_portfolio_and_holdings.sql types/database.ts
git commit -m "feat: add portfolio holdings schema and types"
```

---

### Task 2: Portfolio math (TDD)

**Files:**
- Create: `lib/portfolio/math.ts`
- Create: `lib/portfolio/math.test.ts`

**Interfaces:**
- Produces (consumed by Task 5 hook and Task 6+ UI):
  - `interface CalcTransaction { type: string; shares: number; pricePerShare: number; commission: number }`
  - `interface HoldingCalculations { totalShares: number; avgPrice: number; costBasis: number; currentValue: number; totalChange: number; totalChangePercent: number | null; dailyChange: number; dailyChangePercent: number | null }`
  - `type HistoryPoint = { date: string; close: number }` and `type ValuePoint = { date: string; value: number }`
  - `totalShares(transactions: CalcTransaction[]): number`
  - `avgPrice(transactions: CalcTransaction[]): number`
  - `sumCommissions(transactions: CalcTransaction[]): number`
  - `computeCostBasis(shares: number, avg: number, commissions: number): number`
  - `computeCurrentValue(shares: number, currentPrice: number): number`
  - `computeHoldingCalculations(transactions: CalcTransaction[], currentPrice: number | null, previousClose: number | null): HoldingCalculations`
  - `combineValueSeries(seriesBySymbol: Array<{ symbol: string; points: HistoryPoint[] }>, sharesBySymbol: Record<string, number>): ValuePoint[]`

Formulas (from spec): `totalShares = sum(buys) - sum(sells)`; `avgPrice = weighted buy cost / total bought shares`; `costBasis = totalShares * avgPrice + sum(commissions)`; `currentValue = totalShares * currentPrice`; `totalChange = currentValue - costBasis`; `dailyChange = (currentPrice - previousClose) * totalShares`. Percents are null when the denominator is 0. `combineValueSeries` groups by `date.slice(0, 10)` and returns ascending-sorted points.

- [ ] **Step 1: Write the failing test**

Create `lib/portfolio/math.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  avgPrice,
  combineValueSeries,
  computeCostBasis,
  computeCurrentValue,
  computeHoldingCalculations,
  sumCommissions,
  totalShares,
  type CalcTransaction,
} from "./math";

const buy = (shares: number, price: number, commission = 0): CalcTransaction => ({
  type: "buy",
  shares,
  pricePerShare: price,
  commission,
});
const sell = (shares: number, price: number, commission = 0): CalcTransaction => ({
  type: "sell",
  shares,
  pricePerShare: price,
  commission,
});

describe("totalShares", () => {
  it("returns 0 for empty transactions", () => {
    expect(totalShares([])).toBe(0);
  });

  it("sums buys minus sells, ignoring dividends and transfers", () => {
    const txs = [buy(10, 100), buy(5, 120), sell(3, 130)];
    expect(totalShares(txs)).toBe(12);
  });
});

describe("avgPrice", () => {
  it("returns 0 when there are no buys", () => {
    expect(avgPrice([sell(1, 50)])).toBe(0);
  });

  it("computes weighted average buy price", () => {
    const txs = [buy(10, 100), buy(5, 120)];
    expect(avgPrice(txs)).toBeCloseTo(106.6667, 3);
  });
});

describe("sumCommissions", () => {
  it("sums all commissions", () => {
    expect(sumCommissions([buy(1, 10, 2), sell(1, 10, 3)])).toBe(5);
  });
});

describe("computeCostBasis", () => {
  it("computes shares * avg + commissions", () => {
    expect(computeCostBasis(10, 100, 25)).toBe(1025);
  });
});

describe("computeCurrentValue", () => {
  it("multiplies shares by current price", () => {
    expect(computeCurrentValue(10, 150)).toBe(1500);
  });
});

describe("computeHoldingCalculations", () => {
  it("computes the full set of metrics", () => {
    const txs = [buy(10, 100), buy(10, 120), sell(5, 130, 5)];
    const calc = computeHoldingCalculations(txs, 140, 135);
    expect(calc.totalShares).toBe(15);
    expect(calc.avgPrice).toBeCloseTo(110, 3);
    expect(calc.costBasis).toBeCloseTo(15 * 110 + 5, 3);
    expect(calc.currentValue).toBe(15 * 140);
    expect(calc.totalChange).toBeCloseTo(15 * 140 - (15 * 110 + 5), 3);
    expect(calc.dailyChange).toBe((140 - 135) * 15);
  });

  it("returns null percents when basis or value is zero", () => {
    const calc = computeHoldingCalculations([], null, null);
    expect(calc.totalShares).toBe(0);
    expect(calc.totalChangePercent).toBeNull();
    expect(calc.dailyChangePercent).toBeNull();
  });
});

describe("combineValueSeries", () => {
  it("sums multiple holdings by day and sorts ascending", () => {
    const series = combineValueSeries(
      [
        {
          symbol: "AAPL",
          points: [
            { date: "2026-01-01T00:00:00Z", close: 100 },
            { date: "2026-01-02T00:00:00Z", close: 110 },
          ],
        },
        { symbol: "BTC", points: [{ date: "2026-01-01T00:00:00Z", close: 50 }] },
      ],
      { AAPL: 2, BTC: 4 }
    );
    expect(series).toEqual([
      { date: "2026-01-01", value: 400 },
      { date: "2026-01-02", value: 220 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — "Cannot find module './math'".

- [ ] **Step 3: Write minimal implementation**

Create `lib/portfolio/math.ts`:

```ts
export interface CalcTransaction {
  type: string;
  shares: number;
  pricePerShare: number;
  commission: number;
}

export interface HoldingCalculations {
  totalShares: number;
  avgPrice: number;
  costBasis: number;
  currentValue: number;
  totalChange: number;
  totalChangePercent: number | null;
  dailyChange: number;
  dailyChangePercent: number | null;
}

export type HistoryPoint = { date: string; close: number };
export type ValuePoint = { date: string; value: number };

export function totalShares(transactions: CalcTransaction[]): number {
  return transactions.reduce((sum, t) => {
    if (t.type === "buy") return sum + t.shares;
    if (t.type === "sell") return sum - t.shares;
    return sum;
  }, 0);
}

export function avgPrice(transactions: CalcTransaction[]): number {
  const buys = transactions.filter((t) => t.type === "buy");
  const boughtShares = buys.reduce((sum, t) => sum + t.shares, 0);
  if (boughtShares <= 0) return 0;
  const weightedCost = buys.reduce((sum, t) => sum + t.shares * t.pricePerShare, 0);
  return weightedCost / boughtShares;
}

export function sumCommissions(transactions: CalcTransaction[]): number {
  return transactions.reduce((sum, t) => sum + t.commission, 0);
}

export function computeCostBasis(
  shares: number,
  avg: number,
  commissions: number
): number {
  return shares * avg + commissions;
}

export function computeCurrentValue(shares: number, currentPrice: number): number {
  return shares * currentPrice;
}

export function computeHoldingCalculations(
  transactions: CalcTransaction[],
  currentPrice: number | null,
  previousClose: number | null
): HoldingCalculations {
  const shares = totalShares(transactions);
  const avg = avgPrice(transactions);
  const commissions = sumCommissions(transactions);
  const costBasis = computeCostBasis(shares, avg, commissions);
  const value = currentPrice == null ? 0 : computeCurrentValue(shares, currentPrice);
  const totalChange = value - costBasis;
  const dailyChange =
    currentPrice != null && previousClose != null
      ? (currentPrice - previousClose) * shares
      : 0;

  return {
    totalShares: shares,
    avgPrice: avg,
    costBasis,
    currentValue: value,
    totalChange,
    totalChangePercent: costBasis !== 0 ? (totalChange / costBasis) * 100 : null,
    dailyChange,
    dailyChangePercent: value !== 0 ? (dailyChange / value) * 100 : null,
  };
}

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — existing 11 tests + ~10 new math tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/portfolio/math.ts lib/portfolio/math.test.ts
git commit -m "feat: portfolio calculation helpers with tests"
```

---

### Task 3: Market data abstraction layer

**Files:**
- Create: `lib/market-data/types.ts`
- Create: `lib/market-data/cache.ts`
- Create: `lib/market-data/providers/yahoo.ts`
- Create: `lib/market-data/providers/alphavantage.ts`
- Create: `lib/market-data/providers/coingecko.ts`
- Create: `lib/market-data/quote.ts`
- Create: `lib/market-data/history.ts`

**Interfaces:**
- Consumes: none.
- Produces (consumed by Task 4 route and Task 5 hook):
  - `interface MarketQuote { symbol: string; currentPrice: number; change24h: number; changePercent24h: number; currency: string; previousClose: number }`
  - `interface MarketHistoryPoint { date: string; close: number }`
  - `type HistoryRange = "3m" | "6m" | "1y"`
  - `getQuote(symbol: string): Promise<MarketQuote>`
  - `getHistory(symbol: string, range?: HistoryRange): Promise<MarketHistoryPoint[]>`

- [ ] **Step 1: Create `lib/market-data/types.ts`**

```ts
export interface MarketQuote {
  symbol: string;
  currentPrice: number;
  change24h: number;
  changePercent24h: number;
  currency: string;
  previousClose: number;
}

export interface MarketHistoryPoint {
  date: string;
  close: number;
}

export type HistoryRange = "3m" | "6m" | "1y";
```

- [ ] **Step 2: Create `lib/market-data/cache.ts`**

```ts
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheKey(
  kind: "quote" | "history",
  symbol: string,
  range?: string
): string {
  return `${kind}:${symbol}${range ? `:${range}` : ""}`;
}
```

- [ ] **Step 3: Create `lib/market-data/providers/yahoo.ts`**

```ts
import type { MarketHistoryPoint, MarketQuote } from "../types";

interface YahooChartResponse {
  chart: {
    result?: Array<{
      meta: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        currency?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{ close?: Array<number | null> }>;
      };
    }>;
    error?: unknown;
  };
}

async function fetchYahooChart(
  symbol: string,
  range: string,
  interval: string
): Promise<YahooChartResponse> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Yahoo returned ${res.status}`);
  return (await res.json()) as YahooChartResponse;
}

export async function getYahooQuote(symbol: string): Promise<MarketQuote> {
  const data = await fetchYahooChart(symbol, "1d", "1d");
  const result = data.chart?.result?.[0];
  const meta = result?.meta;
  if (!result || !meta) throw new Error("Yahoo quote not found");
  const currentPrice = meta.regularMarketPrice;
  const previousClose = meta.chartPreviousClose ?? meta.previousClose;
  if (currentPrice == null || previousClose == null) {
    throw new Error("Yahoo quote incomplete");
  }
  const change24h = currentPrice - previousClose;
  return {
    symbol,
    currentPrice,
    change24h,
    changePercent24h: previousClose !== 0 ? (change24h / previousClose) * 100 : 0,
    currency: meta.currency ?? "USD",
    previousClose,
  };
}

export async function getYahooHistory(
  symbol: string,
  range: "3m" | "6m" | "1y"
): Promise<MarketHistoryPoint[]> {
  const data = await fetchYahooChart(symbol, range, "1d");
  const result = data.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!timestamps || !closes) throw new Error("Yahoo history not found");
  const points: MarketHistoryPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close == null) continue;
    points.push({ date: new Date(timestamps[i] * 1000).toISOString(), close });
  }
  return points;
}
```

- [ ] **Step 4: Create `lib/market-data/providers/alphavantage.ts`**

```ts
import type { MarketHistoryPoint, MarketQuote } from "../types";

function apiKey(): string {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) throw new Error("ALPHA_VANTAGE_API_KEY not set");
  return key;
}

interface AlphaVantageQuoteResponse {
  "Global Quote"?: {
    "05. price"?: string;
    "08. previous close"?: string;
    "04. currency"?: string;
  };
}

interface AlphaVantageHistoryResponse {
  "Time Series (Daily)"?: Record<string, { "4. close": string }>;
}

export async function getAlphaVantageQuote(symbol: string): Promise<MarketQuote> {
  const key = apiKey();
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage returned ${res.status}`);
  const json = (await res.json()) as AlphaVantageQuoteResponse;
  const quote = json["Global Quote"];
  const price = quote ? Number(quote["05. price"]) : NaN;
  const previousClose = quote ? Number(quote["08. previous close"]) : NaN;
  if (!quote || Number.isNaN(price) || Number.isNaN(previousClose)) {
    throw new Error("Alpha Vantage quote not found");
  }
  const change24h = price - previousClose;
  return {
    symbol,
    currentPrice: price,
    change24h,
    changePercent24h: previousClose !== 0 ? (change24h / previousClose) * 100 : 0,
    currency: quote["04. currency"] ?? "USD",
    previousClose,
  };
}

export async function getAlphaVantageHistory(
  symbol: string
): Promise<MarketHistoryPoint[]> {
  const key = apiKey();
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage returned ${res.status}`);
  const json = (await res.json()) as AlphaVantageHistoryResponse;
  const series = json["Time Series (Daily)"];
  if (!series) throw new Error("Alpha Vantage history not found");
  return Object.entries(series)
    .map(([date, entry]) => ({ date, close: Number(entry["4. close"]) }))
    .filter((point) => !Number.isNaN(point.close))
    .sort((a, b) => a.date.localeCompare(b.date));
}
```

- [ ] **Step 5: Create `lib/market-data/providers/coingecko.ts`**

```ts
import type { MarketHistoryPoint, MarketQuote } from "../types";

const COINGECKO_ID_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  DOGE: "dogecoin",
  XRP: "ripple",
  ADA: "cardano",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  DOT: "polkadot",
  LTC: "litecoin",
};

function coinId(symbol: string): string {
  return COINGECKO_ID_MAP[symbol.toUpperCase()] ?? symbol.toLowerCase();
}

function apiKey(): string {
  const key = process.env.COINGECKO_API_KEY;
  if (!key) throw new Error("COINGECKO_API_KEY not set");
  return key;
}

export async function getCoinGeckoQuote(symbol: string): Promise<MarketQuote> {
  const key = apiKey();
  const id = coinId(symbol);
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`;
  const res = await fetch(url, {
    headers: { accept: "application/json", "x-cg-demo-api-key": key },
  });
  if (!res.ok) throw new Error(`CoinGecko returned ${res.status}`);
  const json = (await res.json()) as Record<
    string,
    { usd?: number; usd_24h_change?: number }
  >;
  const coin = json[id];
  const price = coin?.usd;
  const changePercent = coin?.usd_24h_change;
  if (price == null) throw new Error("CoinGecko quote not found");
  const previousClose =
    changePercent != null ? price / (1 + changePercent / 100) : price;
  return {
    symbol,
    currentPrice: price,
    change24h: price - previousClose,
    changePercent24h: changePercent ?? 0,
    currency: "USD",
    previousClose,
  };
}

export async function getCoinGeckoHistory(
  symbol: string,
  range: "3m" | "6m" | "1y"
): Promise<MarketHistoryPoint[]> {
  const key = apiKey();
  const id = coinId(symbol);
  const days = range === "3m" ? 90 : range === "6m" ? 182 : 365;
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
  const res = await fetch(url, {
    headers: { accept: "application/json", "x-cg-demo-api-key": key },
  });
  if (!res.ok) throw new Error(`CoinGecko returned ${res.status}`);
  const json = (await res.json()) as { prices?: Array<[number, number]> };
  const prices = json.prices;
  if (!prices) throw new Error("CoinGecko history not found");
  return prices
    .filter(([, close]) => close != null)
    .map(([ts, close]) => ({ date: new Date(ts).toISOString(), close }));
}
```

- [ ] **Step 6: Create `lib/market-data/quote.ts`**

```ts
import { cacheGet, cacheKey, cacheSet } from "./cache";
import type { MarketQuote } from "./types";
import { getYahooQuote } from "./providers/yahoo";
import { getAlphaVantageQuote } from "./providers/alphavantage";
import { getCoinGeckoQuote } from "./providers/coingecko";

const QUOTE_TTL_MS = 60_000;

export async function getQuote(symbol: string): Promise<MarketQuote> {
  const key = cacheKey("quote", symbol);
  const cached = cacheGet<MarketQuote>(key);
  if (cached) return cached;

  const providers = [getYahooQuote, getAlphaVantageQuote, getCoinGeckoQuote];

  let lastError: unknown = null;
  for (const provider of providers) {
    try {
      const quote = await provider(symbol);
      cacheSet(key, quote, QUOTE_TTL_MS);
      return quote;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`No quote provider available for ${symbol}`);
}
```

- [ ] **Step 7: Create `lib/market-data/history.ts`**

```ts
import { cacheGet, cacheKey, cacheSet } from "./cache";
import type { HistoryRange, MarketHistoryPoint } from "./types";
import { getYahooHistory } from "./providers/yahoo";
import { getAlphaVantageHistory } from "./providers/alphavantage";
import { getCoinGeckoHistory } from "./providers/coingecko";

const HISTORY_TTL_MS = 300_000;
const MAX_POINTS = 366;

export async function getHistory(
  symbol: string,
  range: HistoryRange = "1y"
): Promise<MarketHistoryPoint[]> {
  const key = cacheKey("history", symbol, range);
  const cached = cacheGet<MarketHistoryPoint[]>(key);
  if (cached) return cached;

  const providers = [
    () => getYahooHistory(symbol, range),
    () => getAlphaVantageHistory(symbol),
    () => getCoinGeckoHistory(symbol, range),
  ];

  let lastError: unknown = null;
  for (const provider of providers) {
    try {
      let points = await provider();
      if (points.length > MAX_POINTS) {
        const step = Math.ceil(points.length / MAX_POINTS);
        points = points.filter((_, i) => i % step === 0);
      }
      cacheSet(key, points, HISTORY_TTL_MS);
      return points;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`No history provider available for ${symbol}`);
}
```

- [ ] **Step 8: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 9: Commit**

```bash
git add lib/market-data/
git commit -m "feat: market data abstraction with yahoo/alphavantage/coingecko providers"
```

---

### Task 4: Market data API route

**Files:**
- Create: `app/api/market-data/route.ts`

**Interfaces:**
- Consumes: `getQuote`, `getHistory`, `HistoryRange` from Task 3.
- Produces: `GET /api/market-data?symbol=AAPL&action=quote` → `MarketQuote`; `GET /api/market-data?symbol=AAPL&action=history&range=1y` → `MarketHistoryPoint[]`. Consumed by Task 5 hook.

- [ ] **Step 1: Create the route handler**

Create `app/api/market-data/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getQuote } from "@/lib/market-data/quote";
import { getHistory } from "@/lib/market-data/history";
import type { HistoryRange } from "@/lib/market-data/types";

const RANGES: HistoryRange[] = ["3m", "6m", "1y"];
const QUOTE_MAX_AGE = 60;
const HISTORY_MAX_AGE = 300;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol")?.trim().toUpperCase() ?? "";
  const action = url.searchParams.get("action") ?? "quote";
  const rangeParam = url.searchParams.get("range") ?? "1y";

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }
  if (action !== "quote" && action !== "history") {
    return NextResponse.json(
      { error: "action must be quote or history" },
      { status: 400 }
    );
  }
  if (!RANGES.includes(rangeParam as HistoryRange)) {
    return NextResponse.json(
      { error: `range must be one of ${RANGES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    if (action === "quote") {
      const quote = await getQuote(symbol);
      return NextResponse.json(quote, {
        headers: { "Cache-Control": `public, max-age=${QUOTE_MAX_AGE}` },
      });
    }
    const history = await getHistory(symbol, rangeParam as HistoryRange);
    return NextResponse.json(history, {
      headers: { "Cache-Control": `public, max-age=${HISTORY_MAX_AGE}` },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Market data unavailable",
      },
      { status: 502 }
    );
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add app/api/market-data/route.ts
git commit -m "feat: market-data proxy route with auth and caching"
```

---

### Task 5: Portfolio hooks

**Files:**
- Create: `hooks/use-portfolio.ts`

**Interfaces:**
- Consumes: `Tables`/`TablesInsert` from Task 1; math helpers from Task 2; `MarketQuote`/`MarketHistoryPoint` from Task 3.
- Produces (consumed by Tasks 6, 7, 8 components):
  - `interface HoldingWithCalculations extends Tables<"portfolio_holdings"> { transactions: Tables<"holding_transactions">[]; totalShares: number; avgPrice: number; costBasis: number; currentValue: number; totalChange: number; totalChangePercent: number | null; dailyChange: number; dailyChangePercent: number | null; quote: MarketQuote | null }`
  - `interface PortfolioTotals { totalValue: number; totalCostBasis: number; totalChange: number; totalChangePercent: number | null; dailyChange: number; dailyChangePercent: number | null }`
  - `useHoldings()` returning `{ holdings, totals, valueSeries, historyBySymbol, createHoldingWithTransaction, addHoldingTransaction, updateHoldingTransaction, deleteHoldingTransaction, deleteHolding, ...query }`
  - `useHolding(id?: string)` returning `{ holding, ...rest }`

- [ ] **Step 1: Create `hooks/use-portfolio.ts`**

```ts
"use client";

import { useMemo } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert } from "@/types/database";
import {
  combineValueSeries,
  computeHoldingCalculations,
  type CalcTransaction,
  type ValuePoint,
} from "@/lib/portfolio/math";
import type { MarketHistoryPoint, MarketQuote } from "@/lib/market-data/types";

type Holding = Tables<"portfolio_holdings">;
type HoldingInsert = TablesInsert<"portfolio_holdings">;
type HoldingTransaction = Tables<"holding_transactions">;
type HoldingTransactionInsert = TablesInsert<"holding_transactions">;

export interface HoldingWithCalculations extends Holding {
  transactions: HoldingTransaction[];
  totalShares: number;
  avgPrice: number;
  costBasis: number;
  currentValue: number;
  totalChange: number;
  totalChangePercent: number | null;
  dailyChange: number;
  dailyChangePercent: number | null;
  quote: MarketQuote | null;
}

export interface PortfolioTotals {
  totalValue: number;
  totalCostBasis: number;
  totalChange: number;
  totalChangePercent: number | null;
  dailyChange: number;
  dailyChangePercent: number | null;
}

interface PortfolioData {
  holdings: Holding[];
  transactions: HoldingTransaction[];
}

const dataKey = ["portfolio", "data"] as const;

const fetchPortfolioData = async (): Promise<PortfolioData> => {
  const [holdingsRes, transactionsRes] = await Promise.all([
    supabaseClient
      .from("portfolio_holdings")
      .select("*")
      .order("symbol", { ascending: true }),
    supabaseClient
      .from("holding_transactions")
      .select("*")
      .order("transacted_at", { ascending: false }),
  ]);
  if (holdingsRes.error) throw holdingsRes.error;
  if (transactionsRes.error) throw transactionsRes.error;
  return { holdings: holdingsRes.data, transactions: transactionsRes.data };
};

const getCurrentUserId = async (): Promise<string> => {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
};

async function fetchQuote(symbol: string): Promise<MarketQuote | null> {
  const res = await fetch(
    `/api/market-data?symbol=${encodeURIComponent(symbol)}&action=quote`
  );
  if (!res.ok) return null;
  return (await res.json()) as MarketQuote;
}

async function fetchHistory(
  symbol: string,
  range: string
): Promise<MarketHistoryPoint[]> {
  const res = await fetch(
    `/api/market-data?symbol=${encodeURIComponent(symbol)}&action=history&range=${range}`
  );
  if (!res.ok) return [];
  return (await res.json()) as MarketHistoryPoint[];
}

function toCalcTransactions(
  transactions: HoldingTransaction[]
): CalcTransaction[] {
  return transactions.map((t) => ({
    type: t.type,
    shares: t.shares,
    pricePerShare: t.price_per_share,
    commission: t.commission,
  }));
}

export function useHoldings() {
  const queryClient = useQueryClient();
  const dataQuery = useQuery({ queryKey: dataKey, queryFn: fetchPortfolioData });

  const symbols = useMemo(
    () => Array.from(new Set((dataQuery.data?.holdings ?? []).map((h) => h.symbol))),
    [dataQuery.data?.holdings]
  );

  const quotes = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["portfolio", "quote", symbol],
      queryFn: () => fetchQuote(symbol),
      enabled: symbols.length > 0,
      staleTime: 60_000,
      retry: 1,
    })),
  });

  const histories = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["portfolio", "history", symbol],
      queryFn: () => fetchHistory(symbol, "1y"),
      enabled: symbols.length > 0,
      staleTime: 300_000,
      retry: 1,
    })),
  });

  const quoteBySymbol = useMemo(() => {
    const map = new Map<string, MarketQuote | null>();
    symbols.forEach((symbol, i) => map.set(symbol, quotes[i]?.data ?? null));
    return map;
  }, [symbols, quotes]);

  const historyBySymbol = useMemo(() => {
    const map = new Map<string, MarketHistoryPoint[]>();
    symbols.forEach((symbol, i) => map.set(symbol, histories[i]?.data ?? []));
    return map;
  }, [symbols, histories]);

  const holdings = useMemo<HoldingWithCalculations[]>(() => {
    const data = dataQuery.data;
    if (!data) return [];
    return data.holdings.map((holding) => {
      const transactions = data.transactions.filter(
        (t) => t.holding_id === holding.id
      );
      const quote = quoteBySymbol.get(holding.symbol) ?? null;
      const calc = computeHoldingCalculations(
        toCalcTransactions(transactions),
        quote?.currentPrice ?? null,
        quote?.previousClose ?? null
      );
      return { ...holding, transactions, ...calc, quote };
    });
  }, [dataQuery.data, quoteBySymbol]);

  const totals = useMemo<PortfolioTotals>(() => {
    const totalValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
    const totalCostBasis = holdings.reduce((sum, h) => sum + h.costBasis, 0);
    const dailyChange = holdings.reduce((sum, h) => sum + h.dailyChange, 0);
    const totalChange = totalValue - totalCostBasis;
    return {
      totalValue,
      totalCostBasis,
      totalChange,
      totalChangePercent:
        totalCostBasis !== 0 ? (totalChange / totalCostBasis) * 100 : null,
      dailyChange,
      dailyChangePercent:
        totalValue !== 0 ? (dailyChange / totalValue) * 100 : null,
    };
  }, [holdings]);

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

  const createHoldingWithTransaction = useMutation({
    mutationFn: async ({
      holding,
      transaction,
    }: {
      holding: Omit<HoldingInsert, "user_id">;
      transaction: Omit<HoldingTransactionInsert, "user_id" | "holding_id">;
    }): Promise<Holding> => {
      const user_id = await getCurrentUserId();
      const { data: existing } = await supabaseClient
        .from("portfolio_holdings")
        .select("*")
        .eq("user_id", user_id)
        .eq("symbol", holding.symbol)
        .maybeSingle();
      const target =
        existing ??
        (
          await supabaseClient
            .from("portfolio_holdings")
            .insert({ ...holding, user_id })
            .select()
            .single()
        ).data;
      if (!target) throw new Error("Failed to create holding");
      const { error } = await supabaseClient
        .from("holding_transactions")
        .insert({ ...transaction, holding_id: target.id, user_id });
      if (error) throw error;
      return target;
    },
    onMutate: async ({ holding, transaction }) => {
      await queryClient.cancelQueries({ queryKey: dataKey });
      const previous = queryClient.getQueryData<PortfolioData>(dataKey);
      const user_id = await getCurrentUserId();
      const now = new Date().toISOString();
      const temp: Holding = {
        id: `temp-${Date.now()}`,
        user_id,
        symbol: holding.symbol,
        name: holding.name ?? null,
        asset_type: holding.asset_type,
        currency: holding.currency ?? "USD",
        created_at: now,
        updated_at: now,
      };
      const tempTx: HoldingTransaction = {
        id: `temp-tx-${Date.now()}`,
        holding_id: temp.id,
        user_id,
        type: transaction.type,
        shares: transaction.shares,
        price_per_share: transaction.price_per_share,
        commission: transaction.commission ?? 0,
        transacted_at: transaction.transacted_at ?? now,
        notes: transaction.notes ?? null,
        created_at: now,
      };
      queryClient.setQueryData<PortfolioData>(dataKey, (old) => ({
        holdings: [temp, ...(old?.holdings ?? [])],
        transactions: [tempTx, ...(old?.transactions ?? [])],
      }));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(dataKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dataKey }),
  });

  const addHoldingTransaction = useMutation({
    mutationFn: async ({
      holdingId,
      transaction,
    }: {
      holdingId: string;
      transaction: Omit<HoldingTransactionInsert, "user_id" | "holding_id">;
    }): Promise<void> => {
      const user_id = await getCurrentUserId();
      const { error } = await supabaseClient
        .from("holding_transactions")
        .insert({ ...transaction, holding_id: holdingId, user_id });
      if (error) throw error;
    },
    onMutate: async ({ holdingId, transaction }) => {
      await queryClient.cancelQueries({ queryKey: dataKey });
      const previous = queryClient.getQueryData<PortfolioData>(dataKey);
      const user_id = await getCurrentUserId();
      const now = new Date().toISOString();
      const tempTx: HoldingTransaction = {
        id: `temp-tx-${Date.now()}`,
        holding_id: holdingId,
        user_id,
        type: transaction.type,
        shares: transaction.shares,
        price_per_share: transaction.price_per_share,
        commission: transaction.commission ?? 0,
        transacted_at: transaction.transacted_at ?? now,
        notes: transaction.notes ?? null,
        created_at: now,
      };
      queryClient.setQueryData<PortfolioData>(dataKey, (old) => ({
        holdings: old?.holdings ?? [],
        transactions: [tempTx, ...(old?.transactions ?? [])],
      }));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(dataKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dataKey }),
  });

  const updateHoldingTransaction = useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: { id: string } & Partial<HoldingTransactionInsert>): Promise<void> => {
      const { error } = await supabaseClient
        .from("holding_transactions")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: dataKey });
      const previous = queryClient.getQueryData<PortfolioData>(dataKey);
      queryClient.setQueryData<PortfolioData>(dataKey, (old) => ({
        holdings: old?.holdings ?? [],
        transactions: (old?.transactions ?? []).map((t) =>
          t.id === id ? { ...t, ...updates } : t
        ),
      }));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(dataKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dataKey }),
  });

  const deleteHoldingTransaction = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabaseClient
        .from("holding_transactions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: dataKey });
      const previous = queryClient.getQueryData<PortfolioData>(dataKey);
      queryClient.setQueryData<PortfolioData>(dataKey, (old) => ({
        holdings: old?.holdings ?? [],
        transactions: (old?.transactions ?? []).filter((t) => t.id !== id),
      }));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(dataKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dataKey }),
  });

  const deleteHolding = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabaseClient
        .from("portfolio_holdings")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: dataKey });
      const previous = queryClient.getQueryData<PortfolioData>(dataKey);
      queryClient.setQueryData<PortfolioData>(dataKey, (old) => {
        const holdings = old?.holdings ?? [];
        const transactions = old?.transactions ?? [];
        return {
          holdings: holdings.filter((h) => h.id !== id),
          transactions: transactions.filter((t) => t.holding_id !== id),
        };
      });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(dataKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dataKey }),
  });

  return {
    ...dataQuery,
    holdings,
    totals,
    valueSeries,
    historyBySymbol,
    createHoldingWithTransaction,
    addHoldingTransaction,
    updateHoldingTransaction,
    deleteHoldingTransaction,
    deleteHolding,
  };
}

export function useHolding(id?: string) {
  const { holdings, ...rest } = useHoldings();
  const holding = holdings.find((h) => h.id === id) ?? null;
  return { holding, ...rest };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exits 0. (If `useQueries` overload errors, add `as const` to the `queries` array.)

- [ ] **Step 3: Commit**

```bash
git add hooks/use-portfolio.ts
git commit -m "feat: portfolio hooks with optimistic mutations"
```

---

### Task 6: Constants + holding form

**Files:**
- Create: `components/portfolio/portfolio-types.ts`
- Create: `components/portfolio/holding-form.tsx`

**Interfaces:**
- Consumes: `useHoldings` mutations + `HoldingWithCalculations` from Task 5; `Tables` from Task 1; `dateInputToISO`/`isoToDateInput`/`isoToTimeInput` from `lib/date`; `MarketQuote` from Task 3.
- Produces: `ASSET_TYPES`, `ASSET_TYPE_LABELS`, `HOLDING_TRANSACTION_TYPES`, `HOLDING_TRANSACTION_TYPE_LABELS` (consumed by Tasks 7, 8); `<HoldingForm>` component (consumed by Tasks 7, 8).

- [ ] **Step 1: Create `components/portfolio/portfolio-types.ts`**

```ts
export const ASSET_TYPES = [
  { value: "stock", label: "Stock" },
  { value: "etf", label: "ETF" },
  { value: "crypto", label: "Crypto" },
  { value: "fund", label: "Fund" },
  { value: "other", label: "Other" },
] as const;

export const ASSET_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ASSET_TYPES.map((t) => [t.value, t.label])
);

export const HOLDING_TRANSACTION_TYPES = [
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
  { value: "dividend", label: "Dividend" },
  { value: "transfer", label: "Transfer" },
] as const;

export const HOLDING_TRANSACTION_TYPE_LABELS: Record<string, string> =
  Object.fromEntries(HOLDING_TRANSACTION_TYPES.map((t) => [t.value, t.label]));
```

- [ ] **Step 2: Create `components/portfolio/holding-form.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import {
  useHoldings,
  type HoldingWithCalculations,
} from "@/hooks/use-portfolio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ASSET_TYPES, HOLDING_TRANSACTION_TYPES } from "./portfolio-types";
import { dateInputToISO, isoToDateInput, isoToTimeInput } from "@/lib/date";
import type { Tables } from "@/types/database";
import type { MarketQuote } from "@/lib/market-data/types";

type HoldingTransaction = Tables<"holding_transactions">;

interface HoldingFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holding?: HoldingWithCalculations | null;
  editingTransaction?: HoldingTransaction | null;
  defaultSymbol?: string;
}

interface FormErrors {
  symbol?: string;
  shares?: string;
  price?: string;
  date?: string;
}

const nowParts = () => {
  const iso = new Date().toISOString();
  return { date: isoToDateInput(iso), time: isoToTimeInput(iso) };
};

export function HoldingForm({
  open,
  onOpenChange,
  holding,
  editingTransaction,
  defaultSymbol,
}: HoldingFormProps) {
  const { createHoldingWithTransaction, addHoldingTransaction, updateHoldingTransaction } =
    useHoldings();

  const isCreating = !holding;
  const isEditingTx = Boolean(editingTransaction);

  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState("stock");
  const [type, setType] = useState("buy");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [commission, setCommission] = useState("0");
  const [date, setDate] = useState(nowParts().date);
  const [time, setTime] = useState(nowParts().time);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const priceFetchRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSubmitError(null);
    setType("buy");
    setCommission("0");
    const parts = nowParts();
    setDate(parts.date);
    setTime(parts.time);

    if (isEditingTx && editingTransaction) {
      setSymbol(holding?.symbol ?? "");
      setName(holding?.name ?? "");
      setAssetType(holding?.asset_type ?? "stock");
      setType(editingTransaction.type);
      setShares(String(editingTransaction.shares));
      setPrice(String(editingTransaction.price_per_share));
      setCommission(String(editingTransaction.commission));
      setDate(isoToDateInput(editingTransaction.transacted_at));
      setTime(isoToTimeInput(editingTransaction.transacted_at));
    } else if (holding) {
      setSymbol(holding.symbol);
      setName(holding.name ?? "");
      setAssetType(holding.asset_type);
      setShares("");
      setPrice(
        holding.quote?.currentPrice != null
          ? String(holding.quote.currentPrice)
          : ""
      );
    } else {
      setSymbol(defaultSymbol ?? "");
      setName("");
      setAssetType("stock");
      setShares("");
      setPrice("");
    }
  }, [open, holding, editingTransaction, defaultSymbol, isEditingTx]);

  useEffect(() => {
    if (!open || !isCreating) return;
    const trimmed = symbol.trim().toUpperCase();
    if (!trimmed) return;
    const requestId = ++priceFetchRef.current;
    const timer = setTimeout(async () => {
      setPriceLoading(true);
      try {
        const res = await fetch(
          `/api/market-data?symbol=${encodeURIComponent(trimmed)}&action=quote`
        );
        if (res.ok && requestId === priceFetchRef.current) {
          const quote = (await res.json()) as MarketQuote;
          if (quote.currentPrice != null) setPrice(String(quote.currentPrice));
        }
      } catch {
        // live price is best-effort; keep the user-entered price
      } finally {
        if (requestId === priceFetchRef.current) setPriceLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [symbol, isCreating, open]);

  const validate = (): boolean => {
    const next: FormErrors = {};
    const numericShares = Number(shares);
    const numericPrice = Number(price);

    if (isCreating && !symbol.trim()) {
      next.symbol = "Please enter a symbol.";
    }
    if (!shares || Number.isNaN(numericShares) || numericShares <= 0) {
      next.shares = "Shares must be greater than 0.";
    }
    if (
      type !== "dividend" &&
      type !== "transfer" &&
      (Number.isNaN(numericPrice) || numericPrice <= 0)
    ) {
      next.price = "Price must be greater than 0.";
    }
    if (!date) {
      next.date = "Please select a date.";
    }
    if (type === "sell" && holding && (numericShares || 0) > holding.totalShares) {
      next.shares = `You only own ${holding.totalShares} shares.`;
    }
    if (type === "sell" && isCreating) {
      next.shares = "You cannot sell a holding you have not bought yet.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitError(null);
    const payload = {
      type,
      shares: Number(shares),
      price_per_share: Number(price) || 0,
      commission: Number(commission) || 0,
      transacted_at: dateInputToISO(date, time),
      notes: null,
    };

    try {
      if (isEditingTx && editingTransaction) {
        await updateHoldingTransaction.mutateAsync({
          id: editingTransaction.id,
          ...payload,
        });
      } else if (holding) {
        await addHoldingTransaction.mutateAsync({
          holdingId: holding.id,
          transaction: payload,
        });
      } else {
        await createHoldingWithTransaction.mutateAsync({
          holding: {
            symbol: symbol.trim().toUpperCase(),
            name: name.trim() || null,
            asset_type: assetType,
            currency: "USD",
          },
          transaction: payload,
        });
      }
      onOpenChange(false);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditingTx
              ? "Edit Transaction"
              : isCreating
                ? "Add Holding"
                : `Add ${holding.symbol} Transaction`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          {isCreating && (
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="symbol">Symbol</Label>
                <Input
                  id="symbol"
                  type="text"
                  placeholder="AAPL"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  aria-invalid={!!errors.symbol}
                />
                {errors.symbol && (
                  <p className="text-xs text-destructive">{errors.symbol}</p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="name">Name (optional)</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Apple Inc."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="type">Transaction type</Label>
              <Select
                value={type}
                onValueChange={(value) => value !== null && setType(value)}
                items={HOLDING_TRANSACTION_TYPES.map((t) => ({
                  value: t.value,
                  label: t.label,
                }))}
              >
                <SelectTrigger id="type" className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {HOLDING_TRANSACTION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isCreating && (
              <div className="grid gap-1.5">
                <Label htmlFor="asset-type">Asset type</Label>
                <Select
                  value={assetType}
                  onValueChange={(value) =>
                    value !== null && setAssetType(value)
                  }
                  items={ASSET_TYPES.map((t) => ({
                    value: t.value,
                    label: t.label,
                  }))}
                >
                  <SelectTrigger id="asset-type" className="w-full">
                    <SelectValue placeholder="Select asset type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="shares">Shares</Label>
              <Input
                id="shares"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                placeholder="10.5"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                aria-invalid={!!errors.shares}
              />
              {errors.shares && (
                <p className="text-xs text-destructive">{errors.shares}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="price">Price / share</Label>
              <Input
                id="price"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                placeholder={priceLoading ? "Fetching…" : "0.00"}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                aria-invalid={!!errors.price}
              />
              {errors.price && (
                <p className="text-xs text-destructive">{errors.price}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="commission">Commission</Label>
              <Input
                id="commission"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                placeholder="0.00"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={!!errors.date}
              />
              {errors.date && (
                <p className="text-xs text-destructive">{errors.date}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="time">Time</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {type === "sell" && holding && (
            <p className="text-xs text-fog">
              You currently own {holding.totalShares} shares.
            </p>
          )}

          {submitError && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {submitError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">
              {isEditingTx
                ? "Save Changes"
                : isCreating
                  ? "Add Holding"
                  : "Add Transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add components/portfolio/portfolio-types.ts components/portfolio/holding-form.tsx
git commit -m "feat: portfolio transaction form"
```

---

### Task 7: Overview page (stats, chart, holdings table, nav)

**Files:**
- Create: `components/portfolio/portfolio-stats.tsx`
- Create: `components/portfolio/portfolio-chart.tsx`
- Create: `components/portfolio/holdings-table.tsx`
- Create: `components/portfolio/portfolio-overview.tsx`
- Create: `app/dashboard/portfolio/page.tsx`
- Modify: `components/dashboard/header.tsx:9-12`

**Interfaces:**
- Consumes: `useHoldings` from Task 5; `HoldingForm` from Task 6; `StatCard` from `components/dashboard/stat-card`; `usePrimaryCurrency` from `hooks/use-primary-currency`.
- Produces: `<PortfolioOverview>` (used by page); `<HoldingsTable>` used internally; page route `/dashboard/portfolio`.

- [ ] **Step 1: Create `components/portfolio/portfolio-stats.tsx`**

```tsx
"use client";

import { Briefcase, Coins, TrendingDown, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { useHoldings } from "@/hooks/use-portfolio";
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
import { formatCurrency } from "@/lib/format";

function signedPercent(value: number | null): string | undefined {
  if (value == null) return undefined;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function PortfolioStats() {
  const { totals } = useHoldings();
  const { currency } = usePrimaryCurrency();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Portfolio value"
        value={formatCurrency(totals.totalValue, currency)}
        icon={Briefcase}
      />
      <StatCard
        label="Cost basis"
        value={formatCurrency(totals.totalCostBasis, currency)}
        icon={Coins}
      />
      <StatCard
        label="Total return"
        value={formatCurrency(totals.totalChange, currency)}
        icon={totals.totalChange >= 0 ? TrendingUp : TrendingDown}
        delta={signedPercent(totals.totalChangePercent)}
        deltaTone={totals.totalChange >= 0 ? "positive" : "negative"}
      />
      <StatCard
        label="24h change"
        value={formatCurrency(totals.dailyChange, currency)}
        icon={totals.dailyChange >= 0 ? TrendingUp : TrendingDown}
        delta={signedPercent(totals.dailyChangePercent)}
        deltaTone={totals.dailyChange >= 0 ? "positive" : "negative"}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create `components/portfolio/portfolio-chart.tsx`**

```tsx
"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHoldings } from "@/hooks/use-portfolio";
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
import { formatCurrency, getCurrencySymbol } from "@/lib/format";

function ChartTooltip({
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

export function PortfolioChart() {
  const { valueSeries, isLoading } = useHoldings();
  const { currency } = usePrimaryCurrency();

  const data = valueSeries.map((point) => ({
    label: new Date(`${point.date}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    }),
    value: point.value,
  }));

  return (
    <Card className="border-border/50 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="font-display text-base font-medium text-ink">
          Portfolio performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            No performance history yet
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="portfolioFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#18848c" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#083458" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e6eaee"
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#6c7a83" }}
                  dy={6}
                  minTickGap={40}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{
                    fontSize: 12,
                    fill: "#6c7a83",
                    fontFamily: "var(--font-mono)",
                  }}
                  tickFormatter={(value: number) =>
                    `${getCurrencySymbol(currency)}${value}`
                  }
                  width={56}
                />
                <Tooltip
                  content={<ChartTooltip currency={currency} />}
                  cursor={{ stroke: "#18848c", strokeDasharray: "4 4" }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#083458"
                  strokeWidth={2.5}
                  fill="url(#portfolioFill)"
                  activeDot={{ r: 5, fill: "#18848c", strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create `components/portfolio/holdings-table.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus, Trash2, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useHoldings,
  type HoldingWithCalculations,
} from "@/hooks/use-portfolio";
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HoldingForm } from "./holding-form";
import { ASSET_TYPE_LABELS } from "./portfolio-types";

function signedPercent(value: number | null): string {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function changeClass(value: number): string {
  if (value > 0) return "text-leaf";
  if (value < 0) return "text-ember";
  return "text-fog";
}

export function HoldingsTable({ onAddHolding }: { onAddHolding: () => void }) {
  const router = useRouter();
  const { holdings, isLoading, deleteHolding } = useHoldings();
  const { currency } = usePrimaryCurrency();

  const [formOpen, setFormOpen] = useState(false);
  const [quickHolding, setQuickHolding] =
    useState<HoldingWithCalculations | null>(null);
  const [deleting, setDeleting] = useState<HoldingWithCalculations | null>(null);

  const totals = useMemo(
    () => holdings.reduce((sum, h) => sum + h.currentValue, 0),
    [holdings]
  );

  const openQuickAdd = (holding: HoldingWithCalculations) => {
    setQuickHolding(holding);
    setFormOpen(true);
  };

  const confirmDelete = () => {
    if (deleting) deleteHolding.mutate(deleting.id);
    setDeleting(null);
  };

  return (
    <Card className="border-border/50 bg-white shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="font-display text-xl font-medium text-ink">
            Holdings
          </CardTitle>
          <p className="mt-0.5 text-xs text-fog">
            {isLoading
              ? "Loading…"
              : `${holdings.length} holding${holdings.length === 1 ? "" : "s"} · ${formatCurrency(totals, currency)} total`}
          </p>
        </div>
        <Button onClick={onAddHolding}>
          <Plus />
          Add Holding
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : holdings.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#18848c]/10">
              <TrendingUp className="h-6 w-6 text-[#18848c]" />
            </span>
            <div>
              <p className="text-sm font-medium text-ink">
                No holdings added yet. Track your first investment.
              </p>
              <p className="mt-1 text-sm text-fog">
                Add a stock, ETF, or crypto holding to get started.
              </p>
            </div>
            <Button onClick={onAddHolding}>
              <Plus />
              Add Holding
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Holding</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Avg price
                </TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Current
                </TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Cost basis</TableHead>
                <TableHead className="text-right">Daily</TableHead>
                <TableHead className="text-right">Total return</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdings.map((holding) => {
                const hasQuote = holding.quote !== null;
                return (
                  <TableRow
                    key={holding.id}
                    className="cursor-pointer transition-colors hover:bg-muted/40"
                    onClick={() =>
                      router.push(`/dashboard/portfolio/${holding.id}`)
                    }
                  >
                    <TableCell>
                      <div className="font-medium text-ink">
                        {holding.symbol}
                      </div>
                      {holding.name && (
                        <div className="text-xs text-fog">{holding.name}</div>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge
                        variant="outline"
                        className="bg-[#eaf2f5] text-[#083458]"
                      >
                        {ASSET_TYPE_LABELS[holding.asset_type] ??
                          holding.asset_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-ink">
                      {holding.totalShares.toFixed(
                        holding.totalShares % 1 === 0 ? 0 : 4
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums text-fog sm:table-cell">
                      {formatCurrency(holding.avgPrice, holding.currency)}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">
                      {hasQuote
                        ? formatCurrency(
                            holding.quote!.currentPrice,
                            holding.quote!.currency
                          )
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-ink">
                      {formatCurrency(holding.currentValue, holding.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-fog">
                      {formatCurrency(holding.costBasis, holding.currency)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono tabular-nums",
                        changeClass(holding.dailyChange)
                      )}
                    >
                      {hasQuote
                        ? `${holding.dailyChange >= 0 ? "+" : ""}${formatCurrency(holding.dailyChange, holding.currency)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "font-mono tabular-nums",
                          changeClass(holding.totalChange)
                        )}
                      >
                        {signedPercent(holding.totalChangePercent)}
                      </span>
                      <span
                        className={cn(
                          "ml-1.5 font-mono text-xs tabular-nums",
                          changeClass(holding.totalChange)
                        )}
                      >
                        {holding.totalChange >= 0 ? "+" : ""}
                        {formatCurrency(holding.totalChange, holding.currency)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div
                        className="flex items-center justify-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openQuickAdd(holding)}
                          aria-label={`Add transaction for ${holding.symbol}`}
                        >
                          <Plus />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={<Button variant="ghost" size="icon-sm" />}
                            aria-label="Holding actions"
                          >
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem
                              onClick={() => router.push(`/dashboard/portfolio/${holding.id}`)}
                            >
                              View details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeleting(holding)}
                            >
                              <Trash2 />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <HoldingForm
        open={formOpen}
        onOpenChange={setFormOpen}
        holding={quickHolding}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleting?.symbol}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the holding and all of its
              transactions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
```

- [ ] **Step 4: Create `components/portfolio/portfolio-overview.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { HoldingForm } from "./holding-form";
import { HoldingsTable } from "./holdings-table";
import { PortfolioChart } from "./portfolio-chart";
import { PortfolioStats } from "./portfolio-stats";

export function PortfolioOverview() {
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">
            Portfolio
          </h1>
          <p className="mt-0.5 text-sm text-fog">
            Track your investments.
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus />
          Add Holding
        </Button>
      </div>

      <PortfolioStats />
      <PortfolioChart />
      <HoldingsTable onAddHolding={() => setFormOpen(true)} />
      <HoldingForm open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
```

- [ ] **Step 5: Create `app/dashboard/portfolio/page.tsx`**

```tsx
import { PortfolioOverview } from "@/components/portfolio/portfolio-overview";

export default function PortfolioPage() {
  return (
    <div className="animate-fade-in-up">
      <PortfolioOverview />
    </div>
  );
}
```

- [ ] **Step 6: Add Portfolio nav item**

In `components/dashboard/header.tsx`, change the `navItems` array (lines 9-12):

```ts
const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/accounts", label: "Accounts" },
  { href: "/dashboard/portfolio", label: "Portfolio" },
];
```

- [ ] **Step 7: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add components/portfolio/ app/dashboard/portfolio/page.tsx components/dashboard/header.tsx
git commit -m "feat: portfolio overview page with stats, chart, and holdings table"
```

---

### Task 8: Holding detail page

**Files:**
- Create: `components/portfolio/holding-price-chart.tsx`
- Create: `components/portfolio/holding-transactions-table.tsx`
- Create: `components/portfolio/holding-detail.tsx`
- Create: `app/dashboard/portfolio/[id]/page.tsx`

**Interfaces:**
- Consumes: `useHolding` from Task 5; `HoldingForm` from Task 6; `HOLDING_TRANSACTION_TYPE_LABELS` from Task 6; `Tables` from Task 1.
- Produces: page route `/dashboard/portfolio/[id]`.

- [ ] **Step 1: Create `components/portfolio/holding-price-chart.tsx`**

```tsx
"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, getCurrencySymbol } from "@/lib/format";

function ChartTooltip({
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

export function HoldingPriceChart({
  symbol,
  points,
  currency,
}: {
  symbol: string;
  points: Array<{ date: string; close: number }>;
  currency: string;
}) {
  const data = points.map((point) => ({
    label: new Date(`${point.date.slice(0, 10)}T00:00:00`).toLocaleDateString(
      "en-US",
      { month: "short", day: "numeric" }
    ),
    close: point.close,
  }));

  return (
    <Card className="border-border/50 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="font-display text-base font-medium text-ink">
          {symbol} price history
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            No price history yet
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id={`priceFill-${symbol}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#18848c" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#083458" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e6eaee"
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#6c7a83" }}
                  dy={6}
                  minTickGap={40}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{
                    fontSize: 12,
                    fill: "#6c7a83",
                    fontFamily: "var(--font-mono)",
                  }}
                  tickFormatter={(value: number) =>
                    `${getCurrencySymbol(currency)}${value}`
                  }
                  width={56}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  content={<ChartTooltip currency={currency} />}
                  cursor={{ stroke: "#18848c", strokeDasharray: "4 4" }}
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke="#083458"
                  strokeWidth={2.5}
                  fill={`url(#priceFill-${symbol})`}
                  activeDot={{ r: 5, fill: "#18848c", strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create `components/portfolio/holding-transactions-table.tsx`**

```tsx
"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useHoldings,
  type HoldingWithCalculations,
} from "@/hooks/use-portfolio";
import { formatCurrency } from "@/lib/format";
import { HoldingForm } from "./holding-form";
import { HOLDING_TRANSACTION_TYPE_LABELS } from "./portfolio-types";
import type { Tables } from "@/types/database";

type HoldingTransaction = Tables<"holding_transactions">;

const TYPE_BADGE_STYLES: Record<string, string> = {
  buy: "bg-[#eaf2f5] text-[#083458]",
  sell: "bg-[#fdf0ec] text-[#c0392b]",
  dividend: "bg-[#e8f3ee] text-[#0e7c5b]",
  transfer: "bg-[#f2f2f0] text-[#6c7a83]",
};

export function HoldingTransactionsTable({
  holding,
}: {
  holding: HoldingWithCalculations;
}) {
  const { deleteHoldingTransaction } = useHoldings();

  const [formOpen, setFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<HoldingTransaction | null>(null);
  const [deleting, setDeleting] = useState<HoldingTransaction | null>(null);

  const openAdd = () => {
    setEditingTransaction(null);
    setFormOpen(true);
  };

  const openEdit = (transaction: HoldingTransaction) => {
    setEditingTransaction(transaction);
    setFormOpen(true);
  };

  const confirmDelete = () => {
    if (deleting) deleteHoldingTransaction.mutate(deleting.id);
    setDeleting(null);
  };

  return (
    <Card className="border-border/50 bg-white shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-display text-xl font-medium text-ink">
          Transactions
        </CardTitle>
        <Button onClick={openAdd}>
          <Plus />
          Add Transaction
        </Button>
      </CardHeader>
      <CardContent>
        {holding.transactions.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
            <div>
              <p className="text-sm font-medium text-ink">
                No transactions yet
              </p>
              <p className="mt-1 text-sm text-fog">
                Log your first buy to start tracking this holding.
              </p>
            </div>
            <Button onClick={openAdd}>
              <Plus />
              Add Transaction
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Price / share
                </TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  Commission
                </TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {holding.transactions.map((transaction) => {
                const total =
                  transaction.shares * transaction.price_per_share;
                const isSell = transaction.type === "sell";
                return (
                  <TableRow
                    key={transaction.id}
                    className="transition-colors hover:bg-muted/40"
                  >
                    <TableCell className="text-muted-foreground">
                      {new Date(
                        transaction.transacted_at
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge
                        variant="outline"
                        className={
                          TYPE_BADGE_STYLES[transaction.type] ??
                          "bg-[#f2f2f0] text-[#6c7a83]"
                        }
                      >
                        {HOLDING_TRANSACTION_TYPE_LABELS[transaction.type] ??
                          transaction.type}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono tabular-nums ${isSell ? "text-ember" : "text-ink"}`}
                    >
                      {isSell ? "-" : "+"}
                      {transaction.shares.toFixed(
                        transaction.shares % 1 === 0 ? 0 : 4
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums text-fog sm:table-cell">
                      {formatCurrency(
                        transaction.price_per_share,
                        holding.currency
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-ink">
                      {formatCurrency(total, holding.currency)}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums text-fog md:table-cell">
                      {formatCurrency(transaction.commission, holding.currency)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon-sm" />}
                          aria-label="Transaction actions"
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            onClick={() => openEdit(transaction)}
                          >
                            <Pencil />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleting(transaction)}
                          >
                            <Trash2 />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <HoldingForm
        open={formOpen}
        onOpenChange={setFormOpen}
        holding={holding}
        editingTransaction={editingTransaction}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this transaction from the holding.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
```

- [ ] **Step 3: Create `components/portfolio/holding-detail.tsx`**

```tsx
"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useHolding } from "@/hooks/use-portfolio";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HoldingPriceChart } from "./holding-price-chart";
import { HoldingTransactionsTable } from "./holding-transactions-table";
import { ASSET_TYPE_LABELS } from "./portfolio-types";

function changeClass(value: number): string {
  if (value > 0) return "text-leaf";
  if (value < 0) return "text-ember";
  return "text-fog";
}

export function HoldingDetail({ holdingId }: { holdingId: string }) {
  const { holding, isLoading } = useHolding(holdingId);

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!holding) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm font-medium text-ink">Holding not found</p>
        <Link
          href="/dashboard/portfolio"
          className="text-sm text-[#18848c] hover:underline"
        >
          Back to portfolio
        </Link>
      </div>
    );
  }

  const hasQuote = holding.quote !== null;
  const history = holding.holdingHistory ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/portfolio"
          className="inline-flex items-center gap-1.5 text-sm text-fog transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Portfolio
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-medium text-ink">
              {holding.symbol}
            </h1>
            <Badge variant="outline" className="bg-[#eaf2f5] text-[#083458]">
              {ASSET_TYPE_LABELS[holding.asset_type] ?? holding.asset_type}
            </Badge>
          </div>
          {holding.name && (
            <p className="mt-1 text-sm text-fog">{holding.name}</p>
          )}
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-medium tabular-nums text-ink">
            {hasQuote
              ? formatCurrency(
                  holding.quote!.currentPrice,
                  holding.quote!.currency
                )
              : "—"}
          </p>
          {hasQuote && (
            <p
              className={cn(
                "mt-0.5 text-xs",
                changeClass(holding.quote!.change24h)
              )}
            >
              {holding.quote!.change24h >= 0 ? "+" : ""}
              {formatCurrency(holding.quote!.change24h, holding.quote!.currency)}
              {" · "}
              {holding.quote!.changePercent24h >= 0 ? "+" : ""}
              {holding.quote!.changePercent24h.toFixed(2)}%
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
            Shares
          </p>
          <p className="mt-1 font-mono text-xl font-medium tabular-nums text-ink">
            {holding.totalShares.toFixed(
              holding.totalShares % 1 === 0 ? 0 : 4
            )}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
            Avg cost
          </p>
          <p className="mt-1 font-mono text-xl font-medium tabular-nums text-ink">
            {formatCurrency(holding.avgPrice, holding.currency)}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
            Current value
          </p>
          <p className="mt-1 font-mono text-xl font-medium tabular-nums text-ink">
            {formatCurrency(holding.currentValue, holding.currency)}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
            Total return
          </p>
          <p
            className={cn(
              "mt-1 font-mono text-xl font-medium tabular-nums",
              changeClass(holding.totalChange)
            )}
          >
            {holding.totalChange >= 0 ? "+" : ""}
            {formatCurrency(holding.totalChange, holding.currency)}
          </p>
        </div>
      </div>

      <HoldingPriceChart
        symbol={holding.symbol}
        points={history}
        currency={holding.currency}
      />

      <HoldingTransactionsTable holding={holding} />
    </div>
  );
}
```

- [ ] **Step 4: Expose per-symbol history in the hook**

The detail page needs this holding's history points. Add the following to `hooks/use-portfolio.ts`:

1. In `useHolding`, expose `historyBySymbol` (it already is via `...rest`).
2. Update `HoldingWithCalculations` to include an `holdingHistory` convenience field. Modify the holdings `useMemo` map callback in `useHoldings`:

```ts
      return {
        ...holding,
        transactions,
        ...calc,
        quote,
        holdingHistory: historyBySymbol.get(holding.symbol) ?? [],
      };
```

3. Update the interface:

```ts
export interface HoldingWithCalculations extends Holding {
  transactions: HoldingTransaction[];
  holdingHistory: MarketHistoryPoint[];
  totalShares: number;
  ...
}
```

Note: `holding-detail.tsx` above reads `holding.holdingHistory`, so make this change before or with Step 3.

- [ ] **Step 5: Create `app/dashboard/portfolio/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { HoldingDetail } from "@/components/portfolio/holding-detail";

export default async function HoldingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id) notFound();
  return (
    <div className="animate-fade-in-up">
      <HoldingDetail holdingId={id} />
    </div>
  );
}
```

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add components/portfolio/ app/dashboard/portfolio/
git commit -m "feat: holding detail page with price chart and transactions table"
```

---

### Task 9: Full verification + AGENTS.md update

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Run full verification**

Run: `npx tsc --noEmit`
Expected: exits 0.

Run: `npm run build`
Expected: build succeeds (type-checks + prerenders). Note: if prerender of `/dashboard/portfolio` fails, that's expected if any server component reads cookies without dynamic rendering — it should be fine because all data is client-fetched.

Run: `npm test`
Expected: all tests pass (11 existing + ~10 math).

- [ ] **Step 2: Update AGENTS.md**

In Section 2 (Architecture Map):
- Add `portfolio/` under `app/dashboard/` entries: `portfolio/  # Portfolio overview + holding detail routes`.
- Add `api/` under `app/`: `api/market-data  # Market data proxy route (quotes/history)`.
- Add `portfolio/` under `components/`: `portfolio/  # Holding form, holdings table, charts`.
- Add `hooks/use-portfolio.ts  # Portfolio holdings/transactions CRUD + computed metrics`.
- Add `lib/market-data/  # Yahoo/AlphaVantage/CoinGecko providers + TTL cache`.
- Add `lib/portfolio/  # Pure portfolio math helpers + tests`.

In Section 5 (Supabase And Environment, migration state):
- Add: `- 007_portfolio_and_holdings.sql: portfolio_holdings + holding_transactions tables, RLS, indexes. Not yet run remotely; apply via Supabase dashboard SQL editor.`

In Section 7 (Known Follow-Ups):
- Add: `- Portfolio: holdings are deleted when a user deletes the holding (cascades transactions); consider warning before deletion (UI already confirms).`
- Add: `- Market data: Yahoo rate limits; in-memory cache is per server instance. If multi-instance, consider a shared cache.`

Update test count in Section 4 if it mentions "currently 11 tests": set to the new count.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update architecture and migration state for portfolio module"
```
