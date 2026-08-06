# Symbol Search Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a live-search dropdown to the holding form's Symbol field so users can discover and select tickers (stocks, ETFs, crypto) while typing.

**Architecture:** Extend the existing auth-guarded `/api/market-data` route with an `action=search` branch that proxies Yahoo's `v1/finance/search` endpoint, caches per query for 60s, and returns normalized `MarketSymbolSuggestion[]`. The holding form replaces the plain Symbol `Input` with a Base UI `Autocomplete` (`mode="none"`, server-filtered) that debounces typing, shows up to 8 matches, and on select fills Symbol + Name and lets the existing quote effect autofill price/currency.

**Tech Stack:** Next.js 16 route handler, Yahoo Finance search API, Base UI `@base-ui/react/autocomplete` (already installed), TanStack-free client-side `fetch`, Vitest.

## Global Constraints

- **No new dependencies.** Use `@base-ui/react/autocomplete` (installed v1.6.0) and existing `lib/market-data/*`.
- **Yahoo search endpoint:** `https://query1.finance.yahoo.com/v1/finance/search?q=<encoded>&quotesCount=8&newsCount=0` with header `User-Agent: Mozilla/5.0` (same convention as `lib/market-data/providers/yahoo.ts`).
- **Search cache:** TTL 60s via `cacheKey("search", <lowercased query>)` in `lib/market-data/cache.ts`.
- **Route contract:** `GET /api/market-data?action=search&q=<2+ chars>` returns `MarketSymbolSuggestion[]` with `Cache-Control: public, max-age=60`. Auth guard stays. `quote`/`history` behavior unchanged.
- **Suggestion normalization:** `symbol` uppercased; `name` = `shortname` → `longname` fallback (else `null`); `exchange` = `exchDisp` → `exchange` fallback (else `null`); skip entries where `isYahooFinance === false`; skip entries with no usable symbol. Cap results at 8 (via `quotesCount`).
- **Best-effort, non-fatal:** search failures close the dropdown silently; manual typing still works.
- **Do not** run `npm run lint` (broken script, no ESLint config). Do not handwrite DB row aliases.

---

### Task 1: Suggestion type + pure response parser + tests

**Files:**
- Modify: `lib/market-data/types.ts`
- Create: `lib/market-data/search.ts`
- Create: `lib/market-data/search.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface MarketSymbolSuggestion { symbol: string; name: string | null; exchange: string | null }` in `lib/market-data/types.ts`
  - `function parseYahooSearchResponse(data: unknown): MarketSymbolSuggestion[]` in `lib/market-data/search.ts`

- [x] **Step 1: Write the failing test**

Create `lib/market-data/search.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseYahooSearchResponse } from "./search";

describe("parseYahooSearchResponse", () => {
  it("maps Yahoo quotes to symbol suggestions", () => {
    const data = {
      quotes: [
        { symbol: "AAPL", shortname: "Apple Inc.", exchDisp: "NASDAQ" },
        { symbol: "BTC-USD", shortname: "Bitcoin USD", exchDisp: "CCC" },
      ],
    };

    expect(parseYahooSearchResponse(data)).toEqual([
      { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
      { symbol: "BTC-USD", name: "Bitcoin USD", exchange: "CCC" },
    ]);
  });

  it("falls back to longname when shortname is missing", () => {
    const data = {
      quotes: [{ symbol: "MSFT", longname: "Microsoft Corporation" }],
    };

    const [first] = parseYahooSearchResponse(data);
    expect(first).toEqual({
      symbol: "MSFT",
      name: "Microsoft Corporation",
      exchange: null,
    });
  });

  it("skips non-Yahoo-finance and malformed quotes", () => {
    const data = {
      quotes: [
        { symbol: "SPY", isYahooFinance: false },
        { symbol: "" },
        { longname: "no symbol" },
        null,
      ],
    };

    expect(parseYahooSearchResponse(data)).toEqual([]);
  });

  it("returns an empty array for invalid payloads", () => {
    expect(parseYahooSearchResponse(null)).toEqual([]);
    expect(parseYahooSearchResponse({})).toEqual([]);
    expect(parseYahooSearchResponse({ quotes: "nope" })).toEqual([]);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/market-data/search.test.ts`
Expected: FAIL — `Failed to resolve import "./search"` (module does not exist yet).

- [x] **Step 3: Add the type**

Append to `lib/market-data/types.ts`:

```ts
export interface MarketSymbolSuggestion {
  symbol: string;
  name: string | null;
  exchange: string | null;
}
```

- [x] **Step 4: Write the minimal parser**

Create `lib/market-data/search.ts`:

```ts
import type { MarketSymbolSuggestion } from "./types";

export function parseYahooSearchResponse(
  data: unknown
): MarketSymbolSuggestion[] {
  if (!data || typeof data !== "object") return [];
  const quotes = (data as { quotes?: unknown }).quotes;
  if (!Array.isArray(quotes)) return [];

  const suggestions: MarketSymbolSuggestion[] = [];
  for (const entry of quotes) {
    if (!entry || typeof entry !== "object") continue;
    const quote = entry as Record<string, unknown>;
    if (quote.isYahooFinance === false) continue;

    const symbol =
      typeof quote.symbol === "string" ? quote.symbol.trim().toUpperCase() : "";
    if (!symbol) continue;

    const name =
      typeof quote.shortname === "string"
        ? quote.shortname
        : typeof quote.longname === "string"
          ? quote.longname
          : null;
    const exchange =
      typeof quote.exchDisp === "string"
        ? quote.exchDisp
        : typeof quote.exchange === "string"
          ? quote.exchange
          : null;

    suggestions.push({ symbol, name, exchange });
  }
  return suggestions;
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/market-data/search.test.ts`
Expected: PASS — 4 tests.

- [x] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 7: Commit**

```bash
git add lib/market-data/types.ts lib/market-data/search.ts lib/market-data/search.test.ts
git commit -m "feat: add symbol suggestion type and Yahoo search parser"
```

---

### Task 2: `getSymbolSuggestions` + cache kind + route `action=search`

**Files:**
- Modify: `lib/market-data/cache.ts`
- Modify: `lib/market-data/search.ts`
- Modify: `app/api/market-data/route.ts`

**Interfaces:**
- Consumes:
  - `parseYahooSearchResponse` (Task 1), `MarketSymbolSuggestion` (Task 1).
  - `cacheGet<T>(key: string): T | null`, `cacheSet<T>(key, value, ttlMs)`, `cacheKey(kind, symbol, range?)` from `lib/market-data/cache.ts`.
- Produces:
  - `async function getSymbolSuggestions(query: string): Promise<MarketSymbolSuggestion[]>` in `lib/market-data/search.ts` (cached, hits Yahoo).
  - `cacheKey` kind union widened to `"quote" | "history" | "search"`.
  - `GET /api/market-data?action=search&q=<query>` handler in `app/api/market-data/route.ts`.

- [x] **Step 1: Widen the cache kind**

In `lib/market-data/cache.ts`, change the `cacheKey` signature:

```ts
export function cacheKey(
  kind: "quote" | "history" | "search",
  symbol: string,
  range?: string
): string {
```

- [x] **Step 2: Add `getSymbolSuggestions`**

Replace the entire contents of `lib/market-data/search.ts` with:

```ts
import { cacheGet, cacheKey, cacheSet } from "./cache";
import type { MarketSymbolSuggestion } from "./types";

const SEARCH_TTL_MS = 60_000;
const SEARCH_QUOTES_COUNT = 8;

export function parseYahooSearchResponse(
  data: unknown
): MarketSymbolSuggestion[] {
  if (!data || typeof data !== "object") return [];
  const quotes = (data as { quotes?: unknown }).quotes;
  if (!Array.isArray(quotes)) return [];

  const suggestions: MarketSymbolSuggestion[] = [];
  for (const entry of quotes) {
    if (!entry || typeof entry !== "object") continue;
    const quote = entry as Record<string, unknown>;
    if (quote.isYahooFinance === false) continue;

    const symbol =
      typeof quote.symbol === "string" ? quote.symbol.trim().toUpperCase() : "";
    if (!symbol) continue;

    const name =
      typeof quote.shortname === "string"
        ? quote.shortname
        : typeof quote.longname === "string"
          ? quote.longname
          : null;
    const exchange =
      typeof quote.exchDisp === "string"
        ? quote.exchDisp
        : typeof quote.exchange === "string"
          ? quote.exchange
          : null;

    suggestions.push({ symbol, name, exchange });
  }
  return suggestions;
}

export async function getSymbolSuggestions(
  query: string
): Promise<MarketSymbolSuggestion[]> {
  const key = cacheKey("search", query.toLowerCase());
  const cached = cacheGet<MarketSymbolSuggestion[]>(key);
  if (cached) return cached;

  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    query
  )}&quotesCount=${SEARCH_QUOTES_COUNT}&newsCount=0`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Yahoo search returned ${res.status}`);

  const suggestions = parseYahooSearchResponse(await res.json());
  cacheSet(key, suggestions, SEARCH_TTL_MS);
  return suggestions;
}
```

- [x] **Step 3: Add the `search` action to the route**

Replace the body of `GET` in `app/api/market-data/route.ts` (lines 11–59) with:

```ts
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "quote";

  if (action === "search") {
    const query = url.searchParams.get("q")?.trim() ?? "";
    if (query.length < 2) {
      return NextResponse.json(
        { error: "q must be at least 2 characters" },
        { status: 400 }
      );
    }
    try {
      const suggestions = await getSymbolSuggestions(query);
      return NextResponse.json(suggestions, {
        headers: { "Cache-Control": "public, max-age=60" },
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Market data unavailable",
        },
        { status: 502 }
      );
    }
  }

  const symbol = url.searchParams.get("symbol")?.trim().toUpperCase() ?? "";
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

Update the import block at the top of `app/api/market-data/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getQuote } from "@/lib/market-data/quote";
import { getHistory } from "@/lib/market-data/history";
import { getSymbolSuggestions } from "@/lib/market-data/search";
import type { HistoryRange } from "@/lib/market-data/types";
```

- [x] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — 25 tests (21 existing + 4 new).

- [x] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 6: Commit**

```bash
git add lib/market-data/cache.ts lib/market-data/search.ts app/api/market-data/route.ts
git commit -m "feat: add symbol search action to market-data route"
```

---

### Task 3: Autocomplete combobox in the holding form

**Files:**
- Modify: `components/portfolio/holding-form.tsx`

**Interfaces:**
- Consumes:
  - `MarketSymbolSuggestion` from `@/lib/market-data/types`.
  - `Autocomplete` from `@base-ui/react/autocomplete`.
  - `GET /api/market-data?action=search&q=<query>` → `MarketSymbolSuggestion[]`.
- Produces: replaced Symbol field UI + selection handler. No new exports.

- [x] **Step 1: Update imports**

In `components/portfolio/holding-form.tsx`, change:

```ts
import { useEffect, useRef, useState } from "react";
```

to:

```ts
import { useEffect, useRef, useState } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
```

and change:

```ts
import type { MarketQuote } from "@/lib/market-data/types";
```

to:

```ts
import type { MarketQuote, MarketSymbolSuggestion } from "@/lib/market-data/types";
```

- [x] **Step 2: Add state and refs**

After the `detectedCurrency` state line (currently `components/portfolio/holding-form.tsx:93`):

```ts
const [suggestions, setSuggestions] = useState<MarketSymbolSuggestion[]>([]);
const [showEmpty, setShowEmpty] = useState(false);
const searchFetchRef = useRef(0);
const skipNextSearchRef = useRef(false);
```

- [x] **Step 3: Reset the dropdown state when the form opens**

In the existing reset `useEffect` (the one that runs `if (!open) return;`), add two lines next to `setDetectedCurrency(null);`:

```ts
setSuggestions([]);
setShowEmpty(false);
```

- [x] **Step 4: Add the debounced search effect**

Add this effect after the existing price-autofill effect (after the one keyed on `[symbol, isCreating, open]`):

```ts
useEffect(() => {
  if (!open || !isCreating) return;
  setSuggestions([]);
  setShowEmpty(false);
  const trimmed = symbol.trim();
  if (trimmed.length < 2) return;
  if (skipNextSearchRef.current) {
    skipNextSearchRef.current = false;
    return;
  }
  const requestId = ++searchFetchRef.current;
  const timer = setTimeout(async () => {
    try {
      const res = await fetch(
        `/api/market-data?action=search&q=${encodeURIComponent(trimmed)}`
      );
      if (!res.ok || requestId !== searchFetchRef.current) return;
      const data = (await res.json()) as MarketSymbolSuggestion[];
      if (requestId !== searchFetchRef.current) return;
      setSuggestions(data);
      if (data.length === 0) setShowEmpty(true);
    } catch {
      // search is best-effort; manual typing stays usable
    }
  }, 300);
  return () => clearTimeout(timer);
}, [symbol, isCreating, open]);
```

- [x] **Step 5: Add the selection handler**

Add this function just above `handleSubmit`:

```ts
const handleSelectSuggestion = (item: MarketSymbolSuggestion) => {
  skipNextSearchRef.current = true;
  setSymbol(item.symbol);
  setName(item.name ?? "");
  setSuggestions([]);
  setShowEmpty(false);
};
```

- [x] **Step 6: Replace the Symbol field JSX**

Replace the current Symbol `Input` block (the `isCreating` branch — currently `components/portfolio/holding-form.tsx:259-277`) with:

```tsx
<div className="grid gap-1.5">
  <Label htmlFor="symbol">Symbol</Label>
  <Autocomplete.Root
    items={suggestions}
    value={symbol}
    onValueChange={(next) => setSymbol(next.toUpperCase())}
    itemToStringValue={(item) => item.symbol}
    mode="none"
    autoHighlight
  >
    <Autocomplete.Input
      id="symbol"
      type="text"
      placeholder="AAPL"
      autoComplete="off"
      aria-invalid={!!errors.symbol}
      className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30"
    />
    <Autocomplete.Portal hidden={suggestions.length === 0 && !showEmpty}>
      <Autocomplete.Positioner
        sideOffset={4}
        align="start"
        className="isolate z-50"
      >
        <Autocomplete.Popup className="relative z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <Autocomplete.Empty>
            <div className="px-2 py-1.5 text-sm text-fog">No matches</div>
          </Autocomplete.Empty>
          <Autocomplete.List>
            {(item: MarketSymbolSuggestion) => (
              <Autocomplete.Item
                key={item.symbol}
                value={item}
                onClick={() => handleSelectSuggestion(item)}
                className="relative flex w-full cursor-default items-center gap-2 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground"
              >
                <span className="font-mono font-medium">{item.symbol}</span>
                <span className="truncate text-muted-foreground">
                  {item.name}
                </span>
                {item.exchange && (
                  <span className="ml-auto shrink-0 text-xs text-fog">
                    {item.exchange}
                  </span>
                )}
              </Autocomplete.Item>
            )}
          </Autocomplete.List>
        </Autocomplete.Popup>
      </Autocomplete.Positioner>
    </Autocomplete.Portal>
  </Autocomplete.Root>
  {errors.symbol && (
    <p className="text-xs text-destructive">{errors.symbol}</p>
  )}
  {!errors.symbol && (
    <p className="text-xs text-fog">
      Currency: {detectedCurrency ?? profileCurrency}
    </p>
  )}
</div>
```

Keep the error hint and the currency hint lines exactly as above (they were previously nested inside the `isCreating &&` block).

- [x] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 8: Build**

Run: `npm run build`
Expected: production build completes.

- [x] **Step 9: Manual smoke check**

Run: `npm run dev`, open the portfolio page, add a holding, type `app` in the Symbol field:
- A dropdown lists matches (e.g. `AAPL` / Apple Inc. / NASDAQ) after a short delay.
- Arrow keys + Enter, and click, both select; Symbol fills `AAPL`, Name fills `Apple Inc.`, and Price + Currency auto-fill.
- Hand-typed symbols with no dropdown interaction still work as before.
- The edit-transaction flow (Symbol field hidden) is unchanged.

- [x] **Step 10: Commit**

```bash
git add components/portfolio/holding-form.tsx
git commit -m "feat: symbol search dropdown in holding form"
```

---

### Task 4: AGENTS.md update + final verification

**Files:**
- Modify: `AGENTS.md`

- [x] **Step 1: Update AGENTS.md test count**

In the `Commands And Verification` section, change `currently 21 tests` to `currently 25 tests`.

- [x] **Step 2: Update AGENTS.md feature state**

Under `Current Feature State`, extend the portfolio bullet (the one about holdings auto-detecting trading currency) with:

> Adding a holding shows a live symbol-search dropdown (Yahoo lookup via `action=search`) that fills symbol, name, price, and currency on select; search failures degrade silently to manual typing.

- [x] **Step 3: Full verification**

Run: `npm test`
Expected: PASS — 25 tests.
Run: `npm run build`
Expected: production build completes.

- [x] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: note symbol search dropdown in AGENTS.md"
```
