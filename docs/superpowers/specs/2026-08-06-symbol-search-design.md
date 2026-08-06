# Symbol Search Autocomplete — Design

Date: 2026-08-06

## Overview

When a user adds an investment holding, they type a symbol into a plain text input
(`components/portfolio/holding-form.tsx:261`). There is no discovery mechanism — the user
must already know the exact ticker (e.g. `AAPL`, `EUNL.DE`, `BTC-USD`).

This feature adds a live-search dropdown to the Symbol field while creating a holding:
as the user types, matching instruments appear (symbol + name + exchange), and picking one
fills the symbol, auto-fills the optional Name field, and triggers the existing quote
fetch so price and currency are filled in.

## Out of Scope

- Search on the edit-transaction flow — the Symbol input is only rendered when creating a
  holding (`isCreating`), so nothing changes there.
- FX conversion, DB schema, portfolio math, or quote/history provider changes.
- Backfilling symbols/names of existing holdings.
- Client-side filtering — suggestions always come from the live search endpoint.

## Decisions

1. **Source: Yahoo `v1/finance/search`.** Yahoo is already the primary quote provider and
   needs no API key. `quotesCount=8`, `newsCount=0` keeps the response small. The same
   `User-Agent` header trick used for charts applies.
2. **Extend the existing market-data route (Approach A).** Add an `action=search` branch to
   `app/api/market-data/route.ts` rather than creating a new route file, matching how
   `quote` and `history` are structured today.
3. **TTL-cached server-side (60s).** Add a `"search"` kind to `lib/market-data/cache.ts`
   and cache per query, mirroring the quote cache.
4. **`mode="none"` combobox.** Base UI `Autocomplete` runs in `mode="none"` so items are
   static (server-filtered) — the input value is not rewritten by the highlighted item and
   the list only changes when a new search lands.
5. **Best-effort, non-fatal.** Search failures close the dropdown silently; manual typing
   remains fully functional. Same philosophy as the existing best-effort price fetch.
6. **Include everything.** No filtering of result types — stocks, ETFs, funds, and crypto
   (e.g. `BTC-USD`) all appear, since crypto is a supported asset type.

## Behavior

### Backend

#### `lib/market-data/types.ts`

Add:

```ts
export interface MarketSymbolSuggestion {
  symbol: string;
  name: string | null;
  exchange: string | null;
}
```

#### `lib/market-data/search.ts` (new)

`getSymbolSuggestions(query: string): Promise<MarketSymbolSuggestion[]>`:

- Fetch
  `https://query1.finance.yahoo.com/v1/finance/search?q=<encoded>&quotesCount=8&newsCount=0`
  with `User-Agent: Mozilla/5.0` (same as `providers/yahoo.ts`).
- Throw on non-OK responses.
- Map `quotes[]` → `MarketSymbolSuggestion` using `symbol` (uppercased), `shortname` /
  `longname` fallback for name, and `exchDisp`/`exchange` for the exchange label. Skip
  entries with `isYahooFinance === false`.

#### `lib/market-data/cache.ts`

Add `"search"` to the `cacheKey` union; key form `search:<query>` with a 60s TTL.

#### `app/api/market-data/route.ts`

- Add `action=search` handling. Reads `q` (min 2 chars) instead of `symbol`; the existing
  `symbol` requirement applies only to `quote`/`history`.
- Returns `MarketSymbolSuggestion[]` with `Cache-Control: public, max-age=60`.
- Keep the auth guard and the existing error-wrapping `try/catch`.

### Frontend — `components/portfolio/holding-form.tsx`

- Replace the Symbol `Input` (create-mode only) with Base UI `Autocomplete`:
  - Root: `value={symbol}`, `onValueChange` updates `symbol`, `mode="none"`,
    `items={suggestions}`.
  - `Autocomplete.Input` renders the text field; a debounced (~300ms) effect fires
    `fetch("/api/market-data?action=search&q=...")` when the trimmed query has ≥ 2 chars,
    guarded by a request-id ref so stale responses are ignored (reuse the existing
    `priceFetchRef` pattern).
  - `Autocomplete.Popup`/`List` renders up to 8 `Autocomplete.Item`s; each shows the symbol
    bolded (`font-mono`) and the name + exchange muted (`text-fog`).
  - Empty state ("No matches") when a search returns zero results.
  - `onOpenChange`/blur closes the list.
- **On select** (item `onClick`, which Enter also fires): set `symbol` (uppercased), set
  `name` to the suggestion name, and let the existing symbol-driven quote effect autofill
  price + currency. Selecting the already-selected symbol is a no-op.
- **Reset:** keep the existing reset effect; `suggestions` clears when the form opens or
  the query returns empty.
- The Name input remains editable after auto-fill.

## Error Handling

- Search request failure → close the list, keep manual typing. No user-facing error.
- Empty query / < 2 chars / no results → list closed or "No matches".
- Stale responses dropped via request-id guard (same pattern as the price autofill).
- No changes to quote/history error handling.

## Testing

- Client-component change; the repo has no UI test infrastructure (parity with existing
  components). No new unit tests for the form.
- `getSymbolSuggestions` mapping is small; no math changes, so the existing 21 tests stay
  green. No new unit tests.

## Verification

1. `npx tsc --noEmit`
2. `npm run build && npm test`
3. Manual smoke check in the dev server: typing `app` shows Apple matches; selecting fills
   Symbol, Name, and auto-fetched price/currency; hand-typed symbols still work; edit-
   transaction flow unchanged.
4. Update `AGENTS.md`: note the symbol search dropdown under the portfolio feature state.

## References

- Form: `components/portfolio/holding-form.tsx`
- Market-data route: `app/api/market-data/route.ts`
- Quote provider pattern: `lib/market-data/providers/yahoo.ts`
- Cache: `lib/market-data/cache.ts`
- Base UI Autocomplete: `@base-ui/react/autocomplete` (installed)
