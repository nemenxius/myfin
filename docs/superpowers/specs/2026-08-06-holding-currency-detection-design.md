# Holding Currency Auto-Detection — Design

Date: 2026-08-06

## Overview

When a user adds an investment holding (stock/ETF/crypto/fund), the app currently
hardcodes `currency: "USD"` on the holding row (`components/portfolio/holding-form.tsx:205`).
This is wrong for symbols that trade in another currency (e.g. `EUNL.DE` trades in EUR),
so every price, cost basis, and P&L figure for such holdings is mislabeled as USD.

This feature auto-detects the symbol's real trading currency from market data when the
holding is created, falls back to the user's profile display currency when the quote
cannot be fetched, and shows the detected currency in the form.

## Out of Scope

- FX conversion between a holding's currency and the profile display currency. Holdings
  keep their own trading currency; overview totals keep summing raw values labeled in
  primary currency (existing behavior, per portfolio design).
- Backfilling/correcting already-created holdings that were stored with the USD default.
  User explicitly chose "new holdings only".
- Changing the transaction form behavior for existing holdings (their currency is already
  stored on the holding row).
- Any DB schema, market-data layer, or math changes (all already currency-agnostic).

## Decisions

1. **Detect currency from the live quote.** Yahoo returns `currency` in the chart meta;
   the normalized `MarketQuote` already carries `currency`. Use it as the source of truth.
2. **Capture strategy: effect + submit-time safety fetch (Approach B).** The create-mode
   form already fetches the quote to autofill Price Per Share (500ms debounce). Reuse that
   fetch to capture `quote.currency` into local state. If the user submits before the
   debounce fires, the submit handler performs one quick quote fetch to detect the
   currency before saving.
3. **Fallback chain:** detected quote currency → submit-time quote fetch → profile
   display currency. Profile currency comes from `usePrimaryCurrency()`.
4. **New holdings only** — existing holdings are untouched.

## Behavior

### `components/portfolio/holding-form.tsx`

- Add `const { currency: profileCurrency } = usePrimaryCurrency();`.
- Add local state `detectedCurrency: string | null`.
- In the existing create-mode quote-fetch effect: on a successful quote, also
  `setDetectedCurrency(quote.currency)`.
- Reset `detectedCurrency` to `null` when the form opens (in the existing reset effect).
- In `handleSubmit`, create-holding branch, replace `currency: "USD"` with:

  ```ts
  currency: detectedCurrency ?? (await fetchDetectedCurrency(symbol)) ?? profileCurrency,
  ```

  where `fetchDetectedCurrency` fetches `/api/market-data?action=quote` and returns
  `quote.currency` (or `null` on failure). Implemented as a small module-level helper in
  the same file, mirroring the existing inline fetch in the autofill effect.
- Show a small hint under the Symbol field while creating, when a currency is known:
  `Currency: EUR` (or `Currency: USD` when only the profile fallback is known). Keep it a
  muted `text-fog` line, consistent with the form's existing helper text.

### `hooks/use-portfolio.ts`

- No changes. The optimistic temp holding already reads `holding.currency`
  (`hooks/use-portfolio.ts:244`), so it will carry the detected currency automatically.

### Table/detail formatting

- No changes needed. `holdings-table.tsx`, `portfolio-stats.tsx`, and
  `holding-detail.tsx` already format with `holding.currency` / `quote.currency`, so once
  the stored currency is EUR, every price, cost basis, and P&L figure for that holding
  renders in EUR.

## Error Handling

- Quote fetch failure at submit time is non-fatal: fall back to profile currency, the
  holding still saves. Matches the existing non-fatal market-data philosophy.
- No new error states in the UI beyond the existing `submitError` box.

## Testing

- This is a client-component change with no UI test infrastructure in this repo (parity
  with existing components). No new unit tests.
- No math/market-data changes, so existing 21 tests remain green.

## Verification

1. `npx tsc --noEmit`
2. `npm run build && npm test`
3. Manual smoke check: add `EUNL.DE`, confirm the form shows `Currency: EUR` and the
   saved holding + overview/detail figures render in EUR.
4. Update `AGENTS.md`: note that new holdings auto-detect currency, and add the
   "existing holdings still carry USD default" follow-up.

## References

- Portfolio design: `docs/superpowers/specs/2026-08-06-portfolio-tracking-design.md`
- Form: `components/portfolio/holding-form.tsx`
- Quote shape: `lib/market-data/types.ts` (`MarketQuote.currency`)
