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
      (v_uid, v_checking_id, v_utilities_id, -(70.00 + v_m * 8.0 + (v_m % 2) * 12.0), 'Expense',
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
