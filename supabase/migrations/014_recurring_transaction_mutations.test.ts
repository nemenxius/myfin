import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("./014_recurring_transaction_mutations.sql", import.meta.url), "utf8");

describe("recurring transaction mutation RPC migration contract", () => {
  it("defines a SECURITY DEFINER create RPC with an empty search path", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.create_and_materialize_recurring_transaction\(p_rule JSONB, p_through_month TEXT\)[\s\S]*?RETURNS public\.recurring_transactions[\s\S]*?SECURITY DEFINER SET search_path = ''/);
  });

  it("authenticates the caller and parses the full rule payload into locals", () => {
    expect(migration).toMatch(/v_uid UUID := auth\.uid\(\)/);
    expect(migration).toMatch(/IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'/);
    expect(migration).toMatch(/v_account_id := \(p_rule->>'account_id'\)::uuid/);
    expect(migration).toMatch(/v_to_account_id := NULLIF\(p_rule->>'to_account_id', ''\)::uuid/);
    expect(migration).toMatch(/v_recurrence_unit := NULLIF\(p_rule->>'recurrence_unit', ''\)/);
    expect(migration).toMatch(/v_recurrence_interval := NULLIF\(p_rule->>'recurrence_interval', ''\)::integer/);
  });

  it("rejects invalid account, amount, transaction type, and transfer destinations", () => {
    expect(migration).toMatch(/IF v_account_id IS NULL THEN RAISE EXCEPTION 'Invalid account'/);
    expect(migration).toMatch(/v_amount IS NULL OR v_amount = 0 OR v_amount IN \('Infinity'::numeric, '-Infinity'::numeric\)/);
    expect(migration).toMatch(/v_transaction_type NOT IN \('Income', 'Expense', 'Transfer'\)/);
    expect(migration).toMatch(/v_transaction_type = 'Transfer' AND v_to_account_id IS NULL/);
    expect(migration).toMatch(/v_transaction_type IN \('Income', 'Expense'\) AND v_to_account_id IS NOT NULL/);
    expect(migration).toMatch(/v_to_account_id IS NOT NULL AND v_to_account_id = v_account_id/);
  });

  it("restricts interval cadence to supported configurations and rejects NULL cadence fields", () => {
    expect(migration).toMatch(/recurrence_unit = 'day' AND v_recurrence_interval IN \(1, 2\)/);
    expect(migration).toMatch(/recurrence_unit = 'week' AND v_recurrence_interval IN \(1, 2, 3, 4\)/);
    expect(migration).toMatch(/recurrence_unit = 'month' AND v_recurrence_interval IN \(1, 2, 3, 6\)/);
    expect(migration).toMatch(/recurrence_unit = 'year' AND v_recurrence_interval = 1/);
    expect(migration).toMatch(/v_recurrence_kind IN \('never', 'workday'\) AND v_recurrence_unit IS NULL AND v_recurrence_interval IS NULL/);
    expect(migration).toMatch(/IF \(v_recurrence_kind = 'interval' AND \(v_recurrence_unit IS NULL OR v_recurrence_interval IS NULL\)\)\s*OR \(v_recurrence_kind IN \('never', 'workday'\) AND \(v_recurrence_unit IS NOT NULL OR v_recurrence_interval IS NOT NULL\)\) THEN[\s\S]*RAISE EXCEPTION 'Invalid recurrence configuration'/);
    expect(migration).toMatch(/v_recurrence_unit IS NULL OR v_recurrence_interval IS NULL/);
    expect(migration).toMatch(/v_recurrence_unit IS NOT NULL OR v_recurrence_interval IS NOT NULL/);
  });

  it("re-checks resolved account/category ownership inside the definer function", () => {
    expect(migration).toMatch(/SELECT 1 FROM public\.accounts WHERE id = v_account_id AND user_id = v_uid/);
    expect(migration).toMatch(/SELECT 1 FROM public\.accounts WHERE id = v_to_account_id AND user_id = v_uid/);
    expect(migration).toMatch(/SELECT 1 FROM public\.categories WHERE id = v_category_id AND \(user_id IS NULL OR user_id = v_uid\)/);
    expect(migration).toMatch(/RAISE EXCEPTION 'Invalid account\/category ownership'/);
  });

  it("inserts the rule from validated locals and backfills through the requested month", () => {
    expect(migration).toMatch(/INSERT INTO public\.recurring_transactions \([\s\S]*VALUES \(v_uid, v_account_id, v_to_account_id, v_category_id, v_amount, v_transaction_type[\s\S]*v_recurrence_kind, v_recurrence_unit, v_recurrence_interval, COALESCE\(\(p_rule->>'is_active'\)::boolean, true\)\) RETURNING \* INTO v_rule/);
    expect(migration).toMatch(/PERFORM public\.materialize_recurring_transactions\(to_char\(m, 'YYYY-MM'\)\) FROM generate_series\(date_trunc\('month', v_rule\.start_date\)::date/);
  });

  it("preserves the scoped future-deletion RPC", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.delete_recurring_from_occurrence\(p_recurring_transaction_id UUID, p_effective_date DATE\)[\s\S]*SECURITY DEFINER SET search_path = ''/);
    expect(migration).toMatch(/IF p_effective_date <= v_start THEN DELETE FROM public\.recurring_transactions[\s\S]*ELSE UPDATE public\.recurring_transactions SET end_date = p_effective_date - 1/);
  });

  it("grants execution only to authenticated users", () => {
    expect(migration).toMatch(/REVOKE EXECUTE ON FUNCTION public\.create_and_materialize_recurring_transaction\(JSONB, TEXT\) FROM PUBLIC/);
    expect(migration).toMatch(/REVOKE EXECUTE ON FUNCTION public\.delete_recurring_from_occurrence\(UUID, DATE\) FROM PUBLIC/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_and_materialize_recurring_transaction\(JSONB, TEXT\) TO authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.delete_recurring_from_occurrence\(UUID, DATE\) TO authenticated/);
  });
});
