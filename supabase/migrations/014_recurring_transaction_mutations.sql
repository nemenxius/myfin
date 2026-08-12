-- Atomic recurring rule creation/backfill and scoped future deletion.
CREATE OR REPLACE FUNCTION public.create_and_materialize_recurring_transaction(p_rule JSONB, p_through_month TEXT)
RETURNS public.recurring_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_rule public.recurring_transactions;
BEGIN
  INSERT INTO public.recurring_transactions (user_id, account_id, to_account_id, category_id, amount, transaction_type, description, start_date, end_date, recurrence_kind, recurrence_unit, recurrence_interval, is_active)
  VALUES (auth.uid(), (p_rule->>'account_id')::uuid, NULLIF(p_rule->>'to_account_id','')::uuid, NULLIF(p_rule->>'category_id','')::uuid, (p_rule->>'amount')::numeric, p_rule->>'transaction_type', p_rule->>'description', (p_rule->>'start_date')::date, NULLIF(p_rule->>'end_date','')::date, p_rule->>'recurrence_kind', NULLIF(p_rule->>'recurrence_unit',''), NULLIF(p_rule->>'recurrence_interval','')::integer, COALESCE((p_rule->>'is_active')::boolean, true)) RETURNING * INTO v_rule;
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
