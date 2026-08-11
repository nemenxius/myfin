# Demo Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let visitors explore MyFin without registering: a "Try demo" CTA signs them into a private, pre-seeded anonymous sandbox that is permanently purged on sign-out and swept after 24h of inactivity.

**Architecture:** DB-native. Migration `011_demo_account.sql` adds three hardened `SECURITY DEFINER` SQL functions — `seed_demo_data()` (idempotent, anonymous-only, seeds a full EUR dataset), `purge_demo_user()` (anonymous-only, deletes own auth user, FK cascade wipes data), `purge_stale_demo_users()` (cron sweep by 24h session inactivity) — plus an hourly `pg_cron` job. The client uses Supabase anonymous sign-in, calls the seed RPC before navigating, shows a demo banner, and purges on anonymous sign-out.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (auth + Postgres), TanStack Query v5, Tailwind v4, `pg_cron`.

**Spec:** `docs/superpowers/specs/2026-08-11-demo-account-design.md`

## Global Constraints

- **Do not touch** the user's uncommitted work: `components/accounts/account-list.tsx`, `components/categories/category-list.tsx`, `components/net-worth/net-worth-category-list.tsx`, `ideias.md`.
- Migration 011 must **not** change tables/columns/types — functions + cron job only. No `types/database.ts` regeneration.
- All `SECURITY DEFINER` functions: `SET search_path = ''` and **fully-qualified identifiers** (`public.accounts`, `auth.uid()`, `auth.jwt()`, `cron.schedule`).
- `REVOKE EXECUTE ... FROM PUBLIC` on all three functions. `GRANT EXECUTE TO authenticated` on `seed_demo_data()` and `purge_demo_user()` only; `purge_stale_demo_users()` gets **no grant** (owner-only, run by cron).
- Fail-closed anonymous guard in `seed_demo_data()`/`purge_demo_user()`: raise unless `auth.uid()` non-null AND JWT is anonymous (`is_anonymous` top-level or in `app_metadata`).
- `purge_demo_user()` deletes **only** `auth.users WHERE id = auth.uid()`.
- `seed_demo_data()` idempotent via existing-accounts check — no marker column.
- Sweep: `auth.users.raw_app_meta_data ->> 'is_anonymous' = 'true'` AND no `auth.sessions` row with `updated_at > now() - interval '24 hours'`.
- Cron: jobname `purge-stale-demo-users`, hourly, unschedule-then-schedule for idempotent application.
- Seed dataset: all EUR; accounts/transactions/portfolio/net worth per spec tables (3 accounts, ~30-33 transactions, 3 holdings + 5 holding transactions, 5 net worth entries × 6 monthly value rows); `profiles.display_currency = 'EUR'` set before client navigates; `default_account_id`/`default_category_id` set **only if the columns exist** (migration 006 may not be applied remotely).
- Transfers are single rows: **positive** amount, `to_account_id` set, `category_id` NULL, `transaction_type = 'Transfer'` (matches `transaction-form.tsx` + `stat-cards.tsx` handling).
- Client: never call `signInAnonymously()` when a session exists (defensive guard in the handler, not just hidden buttons). Seed before navigation. Best-effort cleanup on seed failure, surface the **original seed error**. Demo banner copy exactly: "You're exploring a temporary MyFin demo. Changes you make here won't be saved permanently."
- Verification: `npm run build` and `npm test` (fresh claims). Do **not** run `npm run lint` (broken `next lint` script, no ESLint config).
- Supabase-js 2.112.0 installed: `signInAnonymously()` and `User.is_anonymous` are available.
- No psql/Supabase CLI/docker locally: SQL is verified by careful review, then applied manually via the Supabase dashboard SQL editor (documented per task).

---

### Task 1: Migration `011_demo_account.sql`

**Files:**
- Create: `supabase/migrations/011_demo_account.sql`

**Interfaces:**
- Consumes: existing schema from migrations 001-010 (tables `public.accounts`, `public.transactions`, `public.categories`, `public.portfolio_holdings`, `public.holding_transactions`, `public.net_worth_entries`, `public.net_worth_entry_values`, `public.profiles`; global category rows from `seed.sql`; `auth.users`, `auth.sessions`, `auth.jwt()`, `cron.*`).
- Produces: RPC functions `public.seed_demo_data()`, `public.purge_demo_user()`, `public.purge_stale_demo_users()` (all `RETURNS void`) and the `pg_cron` job `purge-stale-demo-users`. Tasks 2-4 call `supabaseClient.rpc("seed_demo_data")` / `rpc("purge_demo_user")`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/011_demo_account.sql
-- Demo account: hardened SECURITY DEFINER functions + hourly inactivity sweep.
--
-- One-time setup required before this works (documented in the design spec):
--   1. Supabase Dashboard -> Authentication -> Providers -> Anonymous sign-ins: ENABLE
--   2. pg_cron extension (dashboard Database -> Extensions, or the
--      CREATE EXTENSION below succeeds from the SQL editor)
-- Apply via the Supabase dashboard SQL editor (same as previous migrations).

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =====================================================================
-- public.seed_demo_data()
-- Seeds a full EUR demo dataset for the current anonymous user.
-- Fail-closed: raises unless the session is anonymous.
-- Idempotent: no-op when the user already has any account.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.seed_demo_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_checking_id uuid;
  v_savings_id uuid;
  v_cash_id uuid;
  v_food_id uuid;
  v_rent_id uuid;
  v_utilities_id uuid;
  v_salary_id uuid;
  v_investment_income_id uuid;
  v_eunl_id uuid;
  v_vwce_id uuid;
  v_btc_id uuid;
  v_emergency_id uuid;
  v_investments_id uuid;
  v_ppr_id uuid;
  v_credit_id uuid;
  v_loan_id uuid;
  v_m int;
  v_month_end date;
  v_has_default_account_col boolean;
BEGIN
  -- ---- Fail-closed guards -------------------------------------------
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF COALESCE(auth.jwt() ->> 'is_anonymous', 'false') <> 'true'
     AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'is_anonymous', 'false') <> 'true'
  THEN
    RAISE EXCEPTION 'seed_demo_data is only available to anonymous demo sessions';
  END IF;

  -- ---- Idempotency: already seeded? ---------------------------------
  IF EXISTS (SELECT 1 FROM public.accounts WHERE user_id = v_uid) THEN
    RETURN;
  END IF;

  -- ---- Accounts (all EUR) -------------------------------------------
  INSERT INTO public.accounts (user_id, name, account_type, currency, initial_balance)
  VALUES (v_uid, 'Main Checking', 'checking', 'EUR', 2500.00)
  RETURNING id INTO v_checking_id;

  INSERT INTO public.accounts (user_id, name, account_type, currency, initial_balance)
  VALUES (v_uid, 'Savings', 'savings', 'EUR', 8000.00)
  RETURNING id INTO v_savings_id;

  INSERT INTO public.accounts (user_id, name, account_type, currency, initial_balance)
  VALUES (v_uid, 'Cash', 'cash', 'EUR', 150.00)
  RETURNING id INTO v_cash_id;

  -- ---- Global categories (best-effort; NULL when a row is missing) --
  SELECT id INTO v_food_id FROM public.categories WHERE user_id IS NULL AND name = 'Food' LIMIT 1;
  SELECT id INTO v_rent_id FROM public.categories WHERE user_id IS NULL AND name = 'Rent' LIMIT 1;
  SELECT id INTO v_utilities_id FROM public.categories WHERE user_id IS NULL AND name = 'Utilities' LIMIT 1;
  SELECT id INTO v_salary_id FROM public.categories WHERE user_id IS NULL AND name = 'Salary' LIMIT 1;
  SELECT id INTO v_investment_income_id FROM public.categories WHERE user_id IS NULL AND name = 'Investment Income' LIMIT 1;

  -- ---- Transactions: monthly rhythm over the past 6 months ----------
  FOR v_m IN 1..6 LOOP
    -- Salary on the 25th
    INSERT INTO public.transactions
      (user_id, account_id, category_id, amount, transaction_type, date, description)
    VALUES
      (v_uid, v_checking_id, v_salary_id, 2600.00, 'Income',
       (date_trunc('month', CURRENT_DATE) - (v_m || ' months')::interval + interval '24 days')::timestamptz,
       'Monthly salary');

    -- Rent on the 1st
    INSERT INTO public.transactions
      (user_id, account_id, category_id, amount, transaction_type, date, description)
    VALUES
      (v_uid, v_checking_id, v_rent_id, -950.00, 'Expense',
       (date_trunc('month', CURRENT_DATE) - (v_m || ' months')::interval)::timestamptz,
       'Monthly rent');

    -- Utilities around the 9th (varies 70-110)
    INSERT INTO public.transactions
      (user_id, account_id, category_id, amount, transaction_type, date, description)
    VALUES
      (v_uid, v_checking_id, v_utilities_id, -(70.00 + v_m * 5.0 + (v_m % 2) * 10.0), 'Expense',
       (date_trunc('month', CURRENT_DATE) - (v_m || ' months')::interval + interval '8 days')::timestamptz,
       'Utilities bill');
  END LOOP;

  -- Food / restaurants spread across the window
  INSERT INTO public.transactions
    (user_id, account_id, category_id, amount, transaction_type, date, description)
  VALUES
    (v_uid, v_checking_id, v_food_id, -64.80, 'Expense', (CURRENT_DATE - interval '170 days')::timestamptz, 'Groceries'),
    (v_uid, v_checking_id, v_food_id, -112.40, 'Expense', (CURRENT_DATE - interval '150 days')::timestamptz, 'Restaurant'),
    (v_uid, v_checking_id, v_food_id, -78.15, 'Expense', (CURRENT_DATE - interval '120 days')::timestamptz, 'Groceries'),
    (v_uid, v_checking_id, v_food_id, -95.60, 'Expense', (CURRENT_DATE - interval '95 days')::timestamptz, 'Restaurant'),
    (v_uid, v_checking_id, v_food_id, -143.20, 'Expense', (CURRENT_DATE - interval '75 days')::timestamptz, 'Groceries'),
    (v_uid, v_checking_id, v_food_id, -58.90, 'Expense', (CURRENT_DATE - interval '55 days')::timestamptz, 'Coffee and lunch'),
    (v_uid, v_checking_id, v_food_id, -87.35, 'Expense', (CURRENT_DATE - interval '35 days')::timestamptz, 'Groceries'),
    (v_uid, v_checking_id, v_food_id, -124.70, 'Expense', (CURRENT_DATE - interval '18 days')::timestamptz, 'Restaurant'),
    (v_uid, v_checking_id, v_food_id, -69.25, 'Expense', (CURRENT_DATE - interval '6 days')::timestamptz, 'Groceries');

  -- Investment income
  INSERT INTO public.transactions
    (user_id, account_id, category_id, amount, transaction_type, date, description)
  VALUES
    (v_uid, v_checking_id, v_investment_income_id, 42.50, 'Income', (CURRENT_DATE - interval '130 days')::timestamptz, 'Dividend'),
    (v_uid, v_checking_id, v_investment_income_id, 58.30, 'Income', (CURRENT_DATE - interval '40 days')::timestamptz, 'Dividend');

  -- Transfers (single row, positive amount, to_account_id set)
  INSERT INTO public.transactions
    (user_id, account_id, to_account_id, category_id, amount, transaction_type, date, description)
  VALUES
    (v_uid, v_checking_id, v_savings_id, NULL, 500.00, 'Transfer', (CURRENT_DATE - interval '140 days')::timestamptz, 'Transfer to savings'),
    (v_uid, v_checking_id, v_savings_id, NULL, 500.00, 'Transfer', (CURRENT_DATE - interval '60 days')::timestamptz, 'Transfer to savings');

  -- ---- Portfolio holdings (EUR) -------------------------------------
  INSERT INTO public.portfolio_holdings (user_id, symbol, name, asset_type, currency)
  VALUES (v_uid, 'EUNL.DE', 'iShares Core MSCI World UCITS ETF', 'etf', 'EUR')
  RETURNING id INTO v_eunl_id;

  INSERT INTO public.portfolio_holdings (user_id, symbol, name, asset_type, currency)
  VALUES (v_uid, 'VWCE.DE', 'Vanguard FTSE All-World UCITS ETF', 'etf', 'EUR')
  RETURNING id INTO v_vwce_id;

  INSERT INTO public.portfolio_holdings (user_id, symbol, name, asset_type, currency)
  VALUES (v_uid, 'BTC', 'Bitcoin', 'crypto', 'EUR')
  RETURNING id INTO v_btc_id;

  -- Holding transactions (dividend is display-only; portfolio math ignores it)
  INSERT INTO public.holding_transactions
    (holding_id, user_id, type, shares, price_per_share, commission, transacted_at, notes)
  VALUES
    (v_eunl_id, v_uid, 'buy', 10, 98.50, 1.50, (CURRENT_DATE - interval '150 days')::timestamptz, 'Initial buy'),
    (v_eunl_id, v_uid, 'buy', 10, 102.30, 1.50, (CURRENT_DATE - interval '90 days')::timestamptz, 'Top-up'),
    (v_eunl_id, v_uid, 'buy', 5, 107.10, 1.50, (CURRENT_DATE - interval '30 days')::timestamptz, 'Top-up'),
    (v_eunl_id, v_uid, 'dividend', 0, 1.85, 0.00, (CURRENT_DATE - interval '60 days')::timestamptz, 'Quarterly dividend'),
    (v_vwce_id, v_uid, 'buy', 8, 121.40, 1.50, (CURRENT_DATE - interval '120 days')::timestamptz, 'Initial buy'),
    (v_vwce_id, v_uid, 'buy', 6, 129.75, 1.50, (CURRENT_DATE - interval '45 days')::timestamptz, 'Top-up'),
    (v_btc_id, v_uid, 'buy', 0.05, 60000.00, 2.00, (CURRENT_DATE - interval '110 days')::timestamptz, 'Initial buy'),
    (v_btc_id, v_uid, 'buy', 0.02, 72000.00, 2.00, (CURRENT_DATE - interval '25 days')::timestamptz, 'Top-up');

  -- ---- Net worth entries (EUR) + 6 monthly value rows each ----------
  INSERT INTO public.net_worth_entries (user_id, entry_type, name, description, currency)
  VALUES (v_uid, 'asset', 'Emergency fund', 'Liquid savings buffer', 'EUR')
  RETURNING id INTO v_emergency_id;

  INSERT INTO public.net_worth_entries (user_id, entry_type, name, description, currency)
  VALUES (v_uid, 'asset', 'Investments', 'Index funds and crypto', 'EUR')
  RETURNING id INTO v_investments_id;

  INSERT INTO public.net_worth_entries (user_id, entry_type, name, description, currency)
  VALUES (v_uid, 'asset', 'PPR', 'Retirement savings plan', 'EUR')
  RETURNING id INTO v_ppr_id;

  INSERT INTO public.net_worth_entries (user_id, entry_type, name, description, currency)
  VALUES (v_uid, 'liability', 'Credit card', 'Revolving balance', 'EUR')
  RETURNING id INTO v_credit_id;

  INSERT INTO public.net_worth_entries (user_id, entry_type, name, description, currency)
  VALUES (v_uid, 'liability', 'Personal loan', 'Car loan', 'EUR')
  RETURNING id INTO v_loan_id;

  -- Assets: Emergency fund 9000 -> 10500; Investments 14000 -> 16200; PPR 4000 -> 4400
  -- Liabilities: Credit card 1200 -> 400; Personal loan 18000 -> 17600
  FOR v_m IN 1..6 LOOP
    v_month_end := (date_trunc('month', CURRENT_DATE) - (v_m || ' months')::interval + interval '1 month - 1 day')::date;

    INSERT INTO public.net_worth_entry_values (entry_id, as_of, value)
    VALUES (v_emergency_id, v_month_end, 9000 + (6 - v_m) * 300);

    INSERT INTO public.net_worth_entry_values (entry_id, as_of, value)
    VALUES (v_investments_id, v_month_end, 14000 + (6 - v_m) * 440);

    INSERT INTO public.net_worth_entry_values (entry_id, as_of, value)
    VALUES (v_ppr_id, v_month_end, 4000 + (6 - v_m) * 80);

    INSERT INTO public.net_worth_entry_values (entry_id, as_of, value)
    VALUES (v_credit_id, v_month_end, 1200 - (6 - v_m) * 160);

    INSERT INTO public.net_worth_entry_values (entry_id, as_of, value)
    VALUES (v_loan_id, v_month_end, 18000 - (6 - v_m) * 80);
  END LOOP;

  -- ---- Profile: display currency + optional defaults -----------------
  -- display_currency is required for OnboardingGate to pass.
  -- default_account_id / default_category_id only exist after migration
  -- 006; set them defensively if the columns are present.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'default_account_id'
  ) INTO v_has_default_account_col;

  IF v_has_default_account_col THEN
    UPDATE public.profiles
    SET display_currency = 'EUR',
        default_account_id = v_checking_id,
        default_category_id = v_food_id,
        updated_at = now()
    WHERE id = v_uid;
  ELSE
    UPDATE public.profiles
    SET display_currency = 'EUR',
        updated_at = now()
    WHERE id = v_uid;
  END IF;
END;
$$;

-- =====================================================================
-- public.purge_demo_user()
-- Permanently deletes the current anonymous demo user; FK cascade
-- removes all of their application data. Refuses non-anonymous sessions.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.purge_demo_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF COALESCE(auth.jwt() ->> 'is_anonymous', 'false') <> 'true'
     AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'is_anonymous', 'false') <> 'true'
  THEN
    RAISE EXCEPTION 'purge_demo_user is only available to anonymous demo sessions';
  END IF;

  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

-- =====================================================================
-- public.purge_stale_demo_users()
-- Sweep: deletes anonymous users with no session activity in 24h.
-- Invoked hourly by pg_cron as the function owner (postgres).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.purge_stale_demo_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM auth.users u
  WHERE u.raw_app_meta_data ->> 'is_anonymous' = 'true'
    AND NOT EXISTS (
      SELECT 1 FROM auth.sessions s
      WHERE s.user_id = u.id AND s.updated_at > now() - interval '24 hours'
    );
END;
$$;

-- =====================================================================
-- Grants: explicit, fail-closed. No grant on the sweep function
-- (owner-only; the cron job runs as postgres).
-- =====================================================================
REVOKE EXECUTE ON FUNCTION public.seed_demo_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_demo_data() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.purge_demo_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_demo_user() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.purge_stale_demo_users() FROM PUBLIC;

-- =====================================================================
-- pg_cron job: hourly sweep (idempotent application)
-- =====================================================================
SELECT cron.unschedule('purge-stale-demo-users')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-stale-demo-users');

SELECT cron.schedule('purge-stale-demo-users', '0 * * * *',
                     $$SELECT public.purge_stale_demo_users()$$);
```

- [ ] **Step 2: Self-review the SQL for correctness**

Walk the file line by line and verify each item — do not skip:

1. Every identifier is schema-qualified (`public.*`, `auth.*`, `cron.*`) — the empty `search_path` makes unqualified names fail.
2. `SECURITY DEFINER` + `SET search_path = ''` on all three functions.
3. Guards raise for unauthenticated and for non-anonymous sessions (top-level `is_anonymous` OR `app_metadata.is_anonymous`), and `purge_demo_user()` deletes only `auth.uid()`.
4. Idempotency check `IF EXISTS (SELECT 1 FROM public.accounts WHERE user_id = v_uid) THEN RETURN;` is the first statement after the guards.
5. Transfers: positive `amount`, `to_account_id` set, `category_id` NULL, `transaction_type = 'Transfer'` (matches `components/transactions/transaction-form.tsx` and `components/dashboard/stat-cards.tsx`).
6. Holding transaction types are exactly `buy`/`dividend` (the `holding_transactions.type` CHECK constraint allows `buy`, `sell`, `dividend`, `transfer`).
7. `net_worth_entry_values` respects `UNIQUE (entry_id, as_of)` — one row per entry per month-end date.
8. Value formulas: Emergency fund `9000 + (6-v_m)*300` → 9000..10500; Investments `14000 + (6-v_m)*440` → 14000..16200; PPR `4000 + (6-v_m)*80` → 4000..4400; Credit card `1200 - (6-v_m)*160` → 1200..400; Personal loan `18000 - (6-v_m)*80` → 18000..17600. Net worth ≈ +13.1k (matches spec).
9. Grants: sweep function has no `GRANT`; seed/purge granted to `authenticated` only.
10. Cron: unschedule-then-schedule with jobname `purge-stale-demo-users`.

- [ ] **Step 3: Commit the migration**

```bash
git add supabase/migrations/011_demo_account.sql
git commit -m "feat: demo account SQL functions (seed, purge, 24h sweep)"
```

- [ ] **Step 4: Document the one-time manual apply (dashboard)**

Record for the executor (do not run — requires the user's Supabase dashboard):

```text
1. Dashboard -> Authentication -> Providers -> Anonymous sign-ins -> ENABLE
2. Dashboard -> Database -> Extensions -> enable pg_cron (if CREATE EXTENSION
   in the migration fails, enable it here, then re-run the migration body)
3. Dashboard -> SQL editor -> paste supabase/migrations/011_demo_account.sql -> Run
4. Smoke test: SELECT public.seed_demo_data() as anonymous -> must raise
   "seed_demo_data is only available to anonymous demo sessions" (no anon session)
5. Verify: SELECT proname FROM pg_proc WHERE proname IN
   ('seed_demo_data','purge_demo_user','purge_stale_demo_users');
   and SELECT jobname FROM cron.job;
```

---

### Task 2: Anonymous-aware sign-out + demo user menu label

**Files:**
- Modify: `hooks/use-auth.tsx` (`signOut` callback, lines 53-55)
- Modify: `components/auth/user-menu.tsx` (label, line 39)

**Interfaces:**
- Consumes: `supabaseClient` (`lib/supabase/client.ts`), `useAuth()` shape (`user: User | null`, `isLoading: boolean`, `signOut: () => Promise<void>`), RPC `purge_demo_user` from Task 1.
- Produces: `signOut()` that permanently purges anonymous demo sessions before signing out; `UserMenu` showing "Demo account" for anonymous users. Tasks 3-4 rely on this behavior for "Exit demo".

- [ ] **Step 1: Modify `signOut` in `hooks/use-auth.tsx`**

Replace the `signOut` callback (current lines 53-55) so anonymous users purge their sandbox first:

```tsx
  const signOut = useCallback(async () => {
    if (user?.is_anonymous) {
      // Demo sandbox: purge permanently; never surface cleanup errors.
      await supabaseClient.rpc("purge_demo_user").catch(() => undefined);
    }
    await supabaseClient.auth.signOut();
  }, [user]);
```

The `useCallback` dependency changes from `[]` to `[user]` — required so the callback closes over the current user.

- [ ] **Step 2: Modify the user menu label in `components/auth/user-menu.tsx`**

Replace the label expression (line 39):

```tsx
          <DropdownMenuLabel className="max-w-48 truncate">
            {user?.is_anonymous
              ? "Demo account"
              : user?.email ?? "Account"}
          </DropdownMenuLabel>
```

- [ ] **Step 3: Type-check and build**

Run: `npm run build`
Expected: build succeeds (type-checks the `signOut`/label changes and prerenders).

- [ ] **Step 4: Run the test suite**

Run: `npm test`
Expected: all existing tests pass (no behavior change to shared logic).

- [ ] **Step 5: Commit**

```bash
git add hooks/use-auth.tsx components/auth/user-menu.tsx
git commit -m "feat: purge anonymous demo sandbox on sign-out, demo user menu label"
```

---

### Task 3: `TryDemoButton` + landing and auth entry points

**Files:**
- Create: `components/demo/try-demo-button.tsx`
- Modify: `components/landing/hero.tsx` (add demo button to the CTA group)
- Modify: `components/landing/header.tsx` (add demo button)
- Modify: `components/auth/auth-form.tsx` (add demo link below the card)

**Interfaces:**
- Consumes: `supabaseClient` (`lib/supabase/client.ts`), `useAuth()` (defensive session guard), `Button` from `components/ui/button`, `useRouter` from `next/navigation`, RPC `seed_demo_data` + `purge_demo_user` from Task 1.
- Produces: `<TryDemoButton variant="outline" />` component — hidden when a session exists; calls `signInAnonymously()` → `rpc("seed_demo_data")` → navigates to `/dashboard`; best-effort cleanup + original seed error on failure.

- [ ] **Step 1: Create `components/demo/try-demo-button.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function TryDemoButton({
  variant = "outline",
  className,
}: {
  variant?: "outline" | "ghost" | "default";
  className?: string;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setError(null);

    // Defensive guard: never start an anonymous session over a real one.
    if (user) return;

    setLoading(true);

    const { error: signInError } = await supabaseClient.auth.signInAnonymously();
    if (signInError) {
      setLoading(false);
      setError(signInError.message);
      return;
    }

    const { error: seedError } = await supabaseClient.rpc("seed_demo_data");
    if (seedError) {
      // Best-effort cleanup: don't strand an empty sandbox. Errors here are
      // swallowed; the visitor sees the ORIGINAL seed error.
      await supabaseClient.rpc("purge_demo_user").catch(() => undefined);
      await supabaseClient.auth.signOut().catch(() => undefined);
      setLoading(false);
      setError(seedError.message);
      return;
    }

    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  };

  if (user) return null;

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        onClick={handleClick}
        disabled={loading}
        className={className}
      >
        {loading ? "Setting up demo…" : "Try demo"}
      </Button>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
```

Note: `Button` uses Base UI's `render` prop for link-wrapped CTAs, but here it is a plain button with `onClick` — no `render` prop needed.

- [ ] **Step 2: Add the demo CTA to the landing hero (`components/landing/hero.tsx`)**

Import and render inside the existing CTA `div` (after the "Sign in" button, lines 28-35):

```tsx
import { TryDemoButton } from "@/components/demo/try-demo-button";
```

```tsx
          <TryDemoButton
            className="h-12 rounded-xl border-border bg-background px-6 shadow-sm hover:bg-muted"
          />
```

- [ ] **Step 3: Add the demo CTA to the landing header (`components/landing/header.tsx`)**

Import and render between "Create Account" and "Sign In" buttons (inside the header CTA `div`):

```tsx
import { TryDemoButton } from "@/components/demo/try-demo-button";
```

```tsx
        <TryDemoButton
          className="rounded-full border-border bg-background px-4 text-foreground hover:bg-muted sm:px-5"
        />
```

- [ ] **Step 4: Add the demo link to the auth page (`components/auth/auth-form.tsx`)**

Import and render below the card's closing `</div>` (after line 283, still inside the outer `space-y-6` container):

```tsx
import { TryDemoButton } from "@/components/demo/try-demo-button";
```

```tsx
        <div className="flex justify-center">
          <TryDemoButton variant="ghost" className="text-sm" />
        </div>
```

- [ ] **Step 5: Type-check and build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Run the test suite**

Run: `npm test`
Expected: all existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add components/demo/try-demo-button.tsx components/landing/hero.tsx components/landing/header.tsx components/auth/auth-form.tsx
git commit -m "feat: try demo CTA on landing hero, header, and auth page"
```

---

### Task 4: `DemoBanner` + dashboard layout integration + mount-time re-seed

**Files:**
- Create: `components/demo/demo-banner.tsx`
- Modify: `app/dashboard/layout.tsx` (mount the banner inside `OnboardingGate`)

**Interfaces:**
- Consumes: `useAuth()` (`user`, `signOut` — purge-aware from Task 2), `useQueryClient` from `@tanstack/react-query`, `supabaseClient` RPC `seed_demo_data` (Task 1), `Button` from `components/ui/button`, `useRouter`.
- Produces: `<DemoBanner />` — visible only for anonymous users; exact copy from the spec; "Exit demo" button (purge + sign-out via `signOut()`, then redirect to `/`); mount-time idempotent re-seed + query invalidation so hard reloads never show an empty dashboard.

- [ ] **Step 1: Create `components/demo/demo-banner.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function DemoBanner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, signOut } = useAuth();

  // Safety net: after a hard reload the anonymous session may exist without
  // seeded data. seed_demo_data is idempotent, so re-calling it is harmless.
  useEffect(() => {
    if (!user?.is_anonymous) return;
    let active = true;

    void supabaseClient
      .rpc("seed_demo_data")
      .then(() => {
        if (active) void queryClient.invalidateQueries();
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [user?.is_anonymous, queryClient]);

  if (!user?.is_anonymous) return null;

  const handleExit = async () => {
    await signOut(); // anonymous: purges the sandbox permanently
    router.push("/");
    router.refresh();
  };

  return (
    <div className="border-b border-border bg-secondary/60 px-4 py-2">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
        <p className="text-xs text-muted-foreground">
          You&apos;re exploring a temporary MyFin demo. Changes you make here
          won&apos;t be saved permanently.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExit}
          className="shrink-0"
        >
          Exit demo
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount the banner in `app/dashboard/layout.tsx`**

Add the import and render `<DemoBanner />` inside `OnboardingGate`, directly above `<DashboardHeader />`:

```tsx
import { DemoBanner } from "@/components/demo/demo-banner";
```

```tsx
      <OnboardingGate>
        <DemoBanner />
        <DashboardHeader />
```

- [ ] **Step 3: Type-check and build**

Run: `npm run build`
Expected: build succeeds (prerenders `/dashboard` layout).

- [ ] **Step 4: Run the test suite**

Run: `npm test`
Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/demo/demo-banner.tsx app/dashboard/layout.tsx
git commit -m "feat: demo banner with exit action and reload re-seed safety net"
```

---

### Task 5: AGENTS.md updates

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: the durable facts established in Tasks 1-4 (migration number/name, functions, cron job, demo feature behavior, setup steps).

- [ ] **Step 1: Update `AGENTS.md`**

Make these durable edits (do not append a changelog):

1. **Architecture map** — add under `components/`:
   ```text
   components/
     demo/                     # Try-demo CTA + demo banner (anonymous sandbox)
   ```

2. **Migration state** — append to the numbered list:
   ```text
   - `011_demo_account.sql`: hardened SECURITY DEFINER functions
     `seed_demo_data()` / `purge_demo_user()` / `purge_stale_demo_users()`
     + hourly `pg_cron` sweep (`purge-stale-demo-users`). No table changes.
     Requires anonymous sign-ins enabled in the dashboard and the `pg_cron`
     extension. Run remotely via dashboard SQL editor.
   ```

3. **Feature state** — append a bullet:
   ```text
   - Demo account: anonymous visitors can explore the app without registering.
     "Try demo" (landing hero/header + auth page) signs into a private
     anonymous sandbox seeded with a coherent all-EUR dataset spanning ~6
     months across accounts, transactions, portfolio, and net worth.
     Anonymous sign-out PERMANENTLY purges the sandbox (FK cascade); a
     pg_cron job sweeps abandoned sessions after 24h of inactivity.
   ```

- [ ] **Step 2: Verify the diff is documentation-only**

Run: `git diff AGENTS.md`
Expected: only the three durable additions above; no code files in the diff.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: demo account feature state, migration 011, setup notes"
```

---

## Post-Plan: One-time Supabase setup + QA (executor note)

The migration **must be applied by the user** via the Supabase dashboard after
enabling anonymous sign-ins and `pg_cron` (Task 1, Step 4). Until then, the
client CTAs will show an inline error ("Anonymous sign-ins disabled" or
similar) — expected behavior, handled gracefully.

The full QA checklist lives in the spec:
`docs/superpowers/specs/2026-08-11-demo-account-design.md` (Verification
section) — it covers all five data areas, ledger coherence, idempotency,
purge-on-sign-out, the real-user/demo CTA scenario, market-data-outage
resilience, and the manual sweep check.
