# Holding Currency Auto-Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user adds a new investment holding, auto-detect the symbol's real trading currency from the live quote and store it on the holding, falling back to the user's profile display currency when the quote can't be fetched.

**Architecture:** A single client-component change in `components/portfolio/holding-form.tsx`. The create-mode form already fetches the quote to autofill Price Per Share; the change captures `quote.currency` from that fetch into local state, adds a submit-time safety fetch when the debounce hasn't fired yet, and replaces the hardcoded `currency: "USD"` with the detected (or fallback) currency. No DB, market-data, math, or hook changes — the tables already format with `holding.currency`.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query, Base UI form primitives, Yahoo Finance quotes via `/api/market-data`.

## Global Constraints

- `npx tsc --noEmit` must exit 0 after every code task.
- Do NOT run `npm run lint` (broken in this repo — old `next lint` script, no ESLint config).
- Only `components/portfolio/holding-form.tsx` and `AGENTS.md` may be modified. Do not touch `hooks/use-portfolio.ts`, the market-data layer, DB types, or the math helpers.
- Use `usePrimaryCurrency()` from `@/hooks/use-primary-currency` for the profile fallback currency.
- Base UI Select quirk reminder: `onValueChange` passes `string | null`. (Not modified here, but relevant if editing the form.)
- The repo has no UI component test infrastructure; verification for this feature is type-check + build + manual smoke test. Existing `npm test` (21 tests) must stay green.

---

### Task 1: Detect and store the holding's trading currency

**Files:**
- Modify: `components/portfolio/holding-form.tsx`

**Interfaces:**
- Consumes: `usePrimaryCurrency()` → `{ currency: string }` from `@/hooks/use-primary-currency`; `MarketQuote` from `@/lib/market-data/types` (already imported); `/api/market-data?symbol=X&action=quote` → raw `MarketQuote` body with `currency: string` (already the shape the form's autofill fetch consumes).
- Produces: new module-level helper `fetchDetectedCurrency(symbol: string): Promise<string | null>`; local state `detectedCurrency: string | null`. No other file depends on these.

- [ ] **Step 1: Add the `usePrimaryCurrency` import**

In `components/portfolio/holding-form.tsx`, add this import after the existing `useHoldings` import (line 4-7):

```ts
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
```

- [ ] **Step 2: Add the `fetchDetectedCurrency` module-level helper**

In `components/portfolio/holding-form.tsx`, after the `nowParts` function (ends at line 50), add:

```ts
async function fetchDetectedCurrency(symbol: string): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/market-data?symbol=${encodeURIComponent(symbol)}&action=quote`
    );
    if (!res.ok) return null;
    const quote = (await res.json()) as MarketQuote;
    return quote.currency ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Add `profileCurrency` and the `detectedCurrency` state**

In the `HoldingForm` component body, change the first line (currently `const { createHoldingWithTransaction, addHoldingTransaction, updateHoldingTransaction } = useHoldings();` at line 59) to add the profile currency below it:

```ts
  const { createHoldingWithTransaction, addHoldingTransaction, updateHoldingTransaction } =
    useHoldings();
  const { currency: profileCurrency } = usePrimaryCurrency();
```

Add the new state after the `priceFetchRef` ref line (line 77):

```ts
  const priceFetchRef = useRef(0);
  const [detectedCurrency, setDetectedCurrency] = useState<string | null>(null);
```

- [ ] **Step 4: Reset `detectedCurrency` when the form opens**

In the reset `useEffect` (starts line 79, the one that runs `if (!open) return;`), add a reset next to the other resets:

```ts
    setErrors({});
    setSubmitError(null);
    setDetectedCurrency(null);
    setType("buy");
```

- [ ] **Step 5: Capture the currency in the autofill quote fetch**

In the autofill `useEffect` (starts line 118), inside the `if (res.ok && requestId === priceFetchRef.current)` block (currently sets `setPrice(String(quote.currentPrice))`), add the currency capture:

```ts
        if (res.ok && requestId === priceFetchRef.current) {
          const quote = (await res.json()) as MarketQuote;
          if (quote.currentPrice != null) setPrice(String(quote.currentPrice));
          if (quote.currency) setDetectedCurrency(quote.currency);
        }
```

- [ ] **Step 6: Use the fallback chain in `handleSubmit`**

In `handleSubmit`, replace the create-holding branch (currently lines 200-208):

```ts
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
```

with:

```ts
      } else {
        const symbolTrimmed = symbol.trim().toUpperCase();
        await createHoldingWithTransaction.mutateAsync({
          holding: {
            symbol: symbolTrimmed,
            name: name.trim() || null,
            asset_type: assetType,
            currency:
              detectedCurrency ??
              (await fetchDetectedCurrency(symbolTrimmed)) ??
              profileCurrency,
          },
          transaction: payload,
        });
      }
```

- [ ] **Step 7: Show the currency hint in the form**

In the create-mode symbol field block (the `grid grid-cols-2 gap-4` block under `{isCreating && (`, around lines 246-248), after the symbol error `<p>`:

```tsx
                {errors.symbol && (
                  <p className="text-xs text-destructive">{errors.symbol}</p>
                )}
```

add a muted currency line directly after it:

```tsx
                {!errors.symbol && (
                  <p className="text-xs text-fog">
                    Currency: {detectedCurrency ?? profileCurrency}
                  </p>
                )}
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 9: Manual smoke test (optional but recommended)**

Run `npm run dev`, sign in, go to Portfolio → Add Holding, type `EUNL.DE` in the Symbol field, wait for the price autofill. Confirm:
1. The hint under Symbol reads `Currency: EUR`.
2. Save the holding; the holdings table shows avg price / cost basis / current value in EUR.
3. Open `/dashboard/portfolio/<id>`; the price, stat cards, and transaction table render in EUR.

- [ ] **Step 10: Commit**

```bash
git add components/portfolio/holding-form.tsx
git commit -m "feat: auto-detect holding currency from market quote"
```

---

### Task 2: Update AGENTS.md and run full verification

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Task 1's completed change in `components/portfolio/holding-form.tsx`.
- Produces: none.

- [ ] **Step 1: Add a feature-state line in AGENTS.md**

In `AGENTS.md`, in **Section 6 (Current Feature State)**, add a portfolio currency bullet after the existing portfolio-related bullets (after line 160, before the "Currency formatting is currency-aware..." bullet at line 161):

```markdown
- Portfolio holdings auto-detect their trading currency from the live quote when added (e.g. `EUNL.DE` → EUR), falling back to the profile display currency if the quote can't be fetched. Existing holdings created before this change may still carry the `USD` default.
```

- [ ] **Step 2: Add a known follow-up in AGENTS.md**

In `AGENTS.md`, in **Section 7 (Known Follow-Ups)**, add after the two portfolio bullets (after line 174):

```markdown
- Portfolio: holdings created before currency auto-detection may have the wrong stored `currency` (USD default); no backfill was built. Consider a per-holding currency edit action.
```

- [ ] **Step 3: Run full verification**

Run: `npx tsc --noEmit` → exits 0.
Run: `npm run build` → succeeds.
Run: `npm test` → all 21 tests pass.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: note holding currency auto-detection"
```
