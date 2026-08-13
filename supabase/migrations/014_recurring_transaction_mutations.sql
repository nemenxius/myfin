-- Atomic recurring rule creation/backfill and scoped future deletion.
CREATE OR REPLACE FUNCTION public.create_and_materialize_recurring_transaction(p_rule JSONB, p_through_month TEXT)
RETURNS public.recurring_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_rule public.recurring_transactions;
  v_account_id UUID;
  v_to_account_id UUID;
  v_category_id UUID;
  v_amount NUMERIC;
  v_transaction_type TEXT;
  v_recurrence_kind TEXT;
  v_recurrence_unit TEXT;
  v_recurrence_interval INTEGER;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Defense-in-depth: the UI only ever passes the current month. Reject
  -- malformed months or anything beyond next month so a buggy client cannot
  -- trigger an unbounded backfill.
  IF p_through_month !~ '^\d{4}-(0[1-9]|1[0-2])$'
     OR p_through_month > to_char(now() + interval '1 month', 'YYYY-MM') THEN
    RAISE EXCEPTION 'Invalid month';
  END IF;

  -- Parse the complete rule payload (same keys the client hook sends).
  v_account_id := (p_rule->>'account_id')::uuid;
  v_to_account_id := NULLIF(p_rule->>'to_account_id', '')::uuid;
  v_category_id := NULLIF(p_rule->>'category_id', '')::uuid;
  v_amount := (p_rule->>'amount')::numeric;
  v_transaction_type := p_rule->>'transaction_type';
  v_recurrence_kind := p_rule->>'recurrence_kind';
  v_recurrence_unit := NULLIF(p_rule->>'recurrence_unit', '');
  v_recurrence_interval := NULLIF(p_rule->>'recurrence_interval', '')::integer;

  -- Validate the payload with the same rules the table CHECKs enforce (mirrors
  -- apply_recurring_edit_from_occurrence) so failures raise clear messages
  -- before any write.
  IF v_account_id IS NULL THEN RAISE EXCEPTION 'Invalid account'; END IF;
  IF v_amount IS NULL OR v_amount = 0 OR v_amount IN ('Infinity'::numeric, '-Infinity'::numeric) THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;
  IF v_transaction_type IS NULL OR v_transaction_type NOT IN ('Income', 'Expense', 'Transfer') THEN
    RAISE EXCEPTION 'Invalid transaction type';
  END IF;
  IF (v_transaction_type = 'Transfer' AND v_to_account_id IS NULL)
     OR (v_transaction_type IN ('Income', 'Expense') AND v_to_account_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Invalid transfer destination';
  END IF;
  IF v_to_account_id IS NOT NULL AND v_to_account_id = v_account_id THEN
    RAISE EXCEPTION 'Transfer requires distinct accounts';
  END IF;
  IF NOT (
    (v_recurrence_kind = 'interval' AND (
      (v_recurrence_unit = 'day' AND v_recurrence_interval IN (1, 2))
      OR (v_recurrence_unit = 'week' AND v_recurrence_interval IN (1, 2, 3, 4))
      OR (v_recurrence_unit = 'month' AND v_recurrence_interval IN (1, 2, 3, 6))
      OR (v_recurrence_unit = 'year' AND v_recurrence_interval = 1)))
    OR (v_recurrence_kind IN ('never', 'workday') AND v_recurrence_unit IS NULL AND v_recurrence_interval IS NULL)
  ) THEN RAISE EXCEPTION 'Invalid recurrence configuration'; END IF;
  -- NULL-safe guards: comparisons like `v_recurrence_interval IN (1, 2)` yield
  -- NULL when the interval is NULL, so the CHECK-style condition above would let
  -- a structurally invalid cadence through. IS [NOT] NULL never short-circuits.
  IF (v_recurrence_kind = 'interval' AND (v_recurrence_unit IS NULL OR v_recurrence_interval IS NULL))
     OR (v_recurrence_kind IN ('never', 'workday') AND (v_recurrence_unit IS NOT NULL OR v_recurrence_interval IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invalid recurrence configuration';
  END IF;

  -- SECURITY DEFINER must re-check resolved account/category ownership.
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_account_id AND user_id = v_uid)
     OR (v_to_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_to_account_id AND user_id = v_uid))
     OR (v_category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories WHERE id = v_category_id AND (user_id IS NULL OR user_id = v_uid))) THEN
    RAISE EXCEPTION 'Invalid account/category ownership';
  END IF;

  INSERT INTO public.recurring_transactions (user_id, account_id, to_account_id, category_id, amount, transaction_type, description, start_date, end_date, recurrence_kind, recurrence_unit, recurrence_interval, is_active)
  VALUES (v_uid, v_account_id, v_to_account_id, v_category_id, v_amount, v_transaction_type, p_rule->>'description', (p_rule->>'start_date')::date, NULLIF(p_rule->>'end_date','')::date, v_recurrence_kind, v_recurrence_unit, v_recurrence_interval, COALESCE((p_rule->>'is_active')::boolean, true)) RETURNING * INTO v_rule;
  PERFORM public.materialize_recurring_transactions(to_char(m, 'YYYY-MM')) FROM generate_series(date_trunc('month', v_rule.start_date)::date, to_date(p_through_month || '-01','YYYY-MM-DD'), interval '1 month') m;
  RETURN v_rule;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_recurring_from_occurrence(p_recurring_transaction_id UUID, p_effective_date DATE)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_start date;
BEGIN
  SELECT start_date INTO v_start FROM public.recurring_transactions WHERE id = p_recurring_transaction_id AND user_id = auth.uid() FOR UPDATE;
  IF v_start IS NULL THEN RAISE EXCEPTION 'Recurring transaction not found'; END IF;
  DELETE FROM public.transactions WHERE recurring_transaction_id = p_recurring_transaction_id AND date::date >= p_effective_date;
  DELETE FROM public.recurring_transaction_occurrences WHERE recurring_transaction_id = p_recurring_transaction_id AND occurrence_date >= p_effective_date;
  IF p_effective_date <= v_start THEN DELETE FROM public.recurring_transactions WHERE id = p_recurring_transaction_id;
  ELSE UPDATE public.recurring_transactions SET end_date = p_effective_date - 1 WHERE id = p_recurring_transaction_id; END IF;
END; $$;

REVOKE EXECUTE ON FUNCTION public.create_and_materialize_recurring_transaction(JSONB, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_recurring_from_occurrence(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_and_materialize_recurring_transaction(JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_recurring_from_occurrence(UUID, DATE) TO authenticated;
