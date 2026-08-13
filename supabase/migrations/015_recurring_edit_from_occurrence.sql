-- "This and future" / entire-series edit from a selected occurrence date.
-- Inserts an effective-dated version (anchoring the cadence at that date) and
-- reconciles already-materialized rows from the effective date onward so the
-- edited occurrence changes immediately and previously materialized future
-- rows match the new template. Dates that are no longer occurrence dates under
-- the new cadence are removed for good (occurrence marked skipped).

CREATE OR REPLACE FUNCTION public.apply_recurring_edit_from_occurrence(
  p_recurring_transaction_id UUID,
  p_effective_date DATE,
  p_version JSONB
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_rule public.recurring_transactions;
  v_account_id UUID;
  v_to_account_id UUID;
  v_category_id UUID;
  v_amount NUMERIC;
  v_transaction_type TEXT;
  v_description TEXT;
  v_recurrence_kind TEXT;
  v_recurrence_unit TEXT;
  v_recurrence_interval INTEGER;
  v_span_end DATE;
  v_date DATE;
  v_is_candidate BOOLEAN;
  v_occurrence public.recurring_transaction_occurrences;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_effective_date IS NULL THEN RAISE EXCEPTION 'Invalid effective date'; END IF;

  -- Serialize with materialization: the materializer locks rule rows FOR UPDATE.
  SELECT * INTO v_rule FROM public.recurring_transactions
    WHERE id = p_recurring_transaction_id AND user_id = v_uid FOR UPDATE;
  IF v_rule.id IS NULL THEN RAISE EXCEPTION 'Recurring transaction not found'; END IF;
  IF p_effective_date < v_rule.start_date THEN
    RAISE EXCEPTION 'Effective date precedes rule start date';
  END IF;

  -- Parse the complete version template payload (same keys the hook sends).
  v_account_id := (p_version->>'account_id')::uuid;
  v_to_account_id := NULLIF(p_version->>'to_account_id', '')::uuid;
  v_category_id := NULLIF(p_version->>'category_id', '')::uuid;
  v_amount := (p_version->>'amount')::numeric;
  v_transaction_type := p_version->>'transaction_type';
  v_description := p_version->>'description';
  v_recurrence_kind := p_version->>'recurrence_kind';
  v_recurrence_unit := NULLIF(p_version->>'recurrence_unit', '');
  v_recurrence_interval := NULLIF(p_version->>'recurrence_interval', '')::integer;

  -- Validate the version payload with the same rules the table CHECKs enforce
  -- so failures raise clear messages before any write.
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

  -- Upsert on (recurring_transaction_id, effective_date): re-editing an
  -- occurrence that already has a version on the same date (e.g. applying a
  -- "this and future"/"entire series" edit to the same occurrence twice) must
  -- overwrite that version's template fields instead of violating the unique
  -- constraint. created_at is left untouched (original version creation time).
  INSERT INTO public.recurring_transaction_versions (
    recurring_transaction_id, effective_date, account_id, to_account_id, category_id,
    amount, transaction_type, description, recurrence_kind, recurrence_unit, recurrence_interval
  ) VALUES (
    p_recurring_transaction_id, p_effective_date, v_account_id, v_to_account_id, v_category_id,
    v_amount, v_transaction_type, v_description, v_recurrence_kind, v_recurrence_unit, v_recurrence_interval
  )
  ON CONFLICT (recurring_transaction_id, effective_date) DO UPDATE SET
    account_id = EXCLUDED.account_id,
    to_account_id = EXCLUDED.to_account_id,
    category_id = EXCLUDED.category_id,
    amount = EXCLUDED.amount,
    transaction_type = EXCLUDED.transaction_type,
    description = EXCLUDED.description,
    recurrence_kind = EXCLUDED.recurrence_kind,
    recurrence_unit = EXCLUDED.recurrence_unit,
    recurrence_interval = EXCLUDED.recurrence_interval;

  -- Reconcile the span from the effective date through the later of the current
  -- month end or the latest existing occurrence, never past the rule end date.
  v_span_end := GREATEST(
    (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date,
    COALESCE((SELECT MAX(occurrence_date) FROM public.recurring_transaction_occurrences WHERE recurring_transaction_id = p_recurring_transaction_id),
             (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date)
  );
  IF v_rule.end_date IS NOT NULL THEN v_span_end := LEAST(v_span_end, v_rule.end_date); END IF;

  v_date := p_effective_date;
  WHILE v_date <= v_span_end LOOP
    -- Occurrence candidate under the new version, cadence anchored at the
    -- effective date (same math as materialize_recurring_transactions). The
    -- effective date itself is ALWAYS a candidate: the selected occurrence is
    -- the anchor of the edit and must be updated to the new version template
    -- even when it does not fit the new cadence.
    v_is_candidate := v_date = p_effective_date OR (
      v_date >= p_effective_date
      AND (v_recurrence_kind = 'never' AND v_date = p_effective_date
        OR v_recurrence_kind = 'workday' AND EXTRACT(ISODOW FROM v_date) < 6
        OR v_recurrence_kind = 'interval' AND (
          (v_recurrence_unit = 'day' AND (v_date - p_effective_date) % v_recurrence_interval = 0)
          OR (v_recurrence_unit = 'week' AND (v_date - p_effective_date) % (v_recurrence_interval * 7) = 0)
          OR (v_recurrence_unit = 'month' AND
            EXTRACT(DAY FROM v_date) = LEAST(EXTRACT(DAY FROM p_effective_date), EXTRACT(DAY FROM (date_trunc('month', v_date) + INTERVAL '1 month - 1 day')::date)) AND
            ((EXTRACT(YEAR FROM v_date)::integer * 12 + EXTRACT(MONTH FROM v_date)::integer) - (EXTRACT(YEAR FROM p_effective_date)::integer * 12 + EXTRACT(MONTH FROM p_effective_date)::integer)) % v_recurrence_interval = 0)
          OR (v_recurrence_unit = 'year' AND
            EXTRACT(MONTH FROM v_date) = EXTRACT(MONTH FROM p_effective_date) AND
            EXTRACT(DAY FROM v_date) = LEAST(EXTRACT(DAY FROM p_effective_date), EXTRACT(DAY FROM (date_trunc('month', v_date) + INTERVAL '1 month - 1 day')::date)) AND
            (EXTRACT(YEAR FROM v_date)::integer - EXTRACT(YEAR FROM p_effective_date)::integer) % v_recurrence_interval = 0)
        )));

    SELECT * INTO v_occurrence FROM public.recurring_transaction_occurrences
      WHERE recurring_transaction_id = p_recurring_transaction_id AND occurrence_date = v_date
      FOR UPDATE;

    IF v_is_candidate THEN
      IF v_occurrence.transaction_id IS NOT NULL THEN
        -- Reconcile the already-materialized row to the version template.
        UPDATE public.transactions
          SET account_id = v_account_id,
              to_account_id = v_to_account_id,
              category_id = v_category_id,
              amount = v_amount,
              transaction_type = v_transaction_type,
              description = v_description
          WHERE id = v_occurrence.transaction_id AND recurring_transaction_id = p_recurring_transaction_id;
        -- The version is authoritative from the effective date on.
        UPDATE public.recurring_transaction_occurrences
          SET override_account_id = NULL, override_to_account_id = NULL, override_category_id = NULL,
              override_amount = NULL, override_transaction_type = NULL, override_description = NULL
          WHERE id = v_occurrence.id;
      END IF;
      -- Pending occurrences and dates without an occurrence row stay untouched:
      -- lazy materialization applies the new version when the month is requested.
    ELSIF v_occurrence.id IS NOT NULL THEN
      IF v_occurrence.transaction_id IS NOT NULL THEN
        DELETE FROM public.transactions
          WHERE id = v_occurrence.transaction_id AND recurring_transaction_id = p_recurring_transaction_id;
      END IF;
      -- Durable no-reappear guarantee: the materializer only claims pending rows.
      UPDATE public.recurring_transaction_occurrences
        SET status = 'skipped', transaction_id = NULL
        WHERE id = v_occurrence.id;
    END IF;

    v_date := v_date + 1;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_recurring_edit_from_occurrence(UUID, DATE, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_recurring_edit_from_occurrence(UUID, DATE, JSONB) TO authenticated;
