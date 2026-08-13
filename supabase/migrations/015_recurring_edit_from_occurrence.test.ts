import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("./015_recurring_edit_from_occurrence.sql", import.meta.url), "utf8");

describe("recurring edit-from-occurrence RPC migration contract", () => {
  it("defines a SECURITY DEFINER RPC with an empty search path", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.apply_recurring_edit_from_occurrence\([\s\S]*?RETURNS void[\s\S]*?SECURITY DEFINER SET search_path = ''/);
  });

  it("requires an authenticated owner and locks the rule row", () => {
    expect(migration).toMatch(/IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'/);
    expect(migration).toMatch(/WHERE id = p_recurring_transaction_id AND user_id = v_uid FOR UPDATE/);
    expect(migration).toMatch(/IF v_rule\.id IS NULL THEN RAISE EXCEPTION 'Recurring transaction not found'/);
  });

  it("anchors the edit at the effective date without rewriting history", () => {
    expect(migration).toMatch(/IF p_effective_date < v_rule\.start_date THEN[\s\S]*RAISE EXCEPTION 'Effective date precedes rule start date'/);
  });

  it("validates the version payload with the table's CHECK rules", () => {
    expect(migration).toMatch(/v_amount IS NULL OR v_amount = 0 OR v_amount IN \('Infinity'::numeric, '-Infinity'::numeric\)/);
    expect(migration).toMatch(/v_transaction_type NOT IN \('Income', 'Expense', 'Transfer'\)/);
    expect(migration).toMatch(/v_transaction_type = 'Transfer' AND v_to_account_id IS NULL/);
    expect(migration).toMatch(/v_transaction_type IN \('Income', 'Expense'\) AND v_to_account_id IS NOT NULL/);
    expect(migration).toMatch(/v_to_account_id IS NOT NULL AND v_to_account_id = v_account_id/);
    expect(migration).toMatch(/recurrence_unit = 'day' AND v_recurrence_interval IN \(1, 2\)/);
    expect(migration).toMatch(/recurrence_unit = 'week' AND v_recurrence_interval IN \(1, 2, 3, 4\)/);
    expect(migration).toMatch(/recurrence_unit = 'month' AND v_recurrence_interval IN \(1, 2, 3, 6\)/);
    expect(migration).toMatch(/recurrence_unit = 'year' AND v_recurrence_interval = 1/);
    expect(migration).toMatch(/v_recurrence_kind IN \('never', 'workday'\) AND v_recurrence_unit IS NULL AND v_recurrence_interval IS NULL/);
  });

  it("re-checks resolved account/category ownership inside the definer function", () => {
    expect(migration).toMatch(/SELECT 1 FROM public\.accounts WHERE id = v_account_id AND user_id = v_uid/);
    expect(migration).toMatch(/SELECT 1 FROM public\.accounts WHERE id = v_to_account_id AND user_id = v_uid/);
    expect(migration).toMatch(/SELECT 1 FROM public\.categories WHERE id = v_category_id AND \(user_id IS NULL OR user_id = v_uid\)/);
    expect(migration).toMatch(/RAISE EXCEPTION 'Invalid account\/category ownership'/);
  });

  it("inserts the effective-dated version before reconciling", () => {
    expect(migration).toMatch(/INSERT INTO public\.recurring_transaction_versions \([\s\S]*effective_date[\s\S]*\) VALUES \([\s\S]*p_effective_date/);
  });

  it("bounds the reconciliation span to current month end, max occurrence, and rule end date", () => {
    expect(migration).toMatch(/GREATEST\([\s\S]*date_trunc\('month', CURRENT_DATE\) \+\s*INTERVAL '1 month - 1 day'[\s\S]*MAX\(occurrence_date\)/);
    expect(migration).toMatch(/IF v_rule\.end_date IS NOT NULL THEN v_span_end := LEAST\(v_span_end, v_rule\.end_date\)/);
  });

  it("updates candidate materialized transactions to the version template and clears overrides", () => {
    expect(migration).toMatch(/UPDATE public\.transactions[\s\S]*SET account_id = v_account_id,[\s\S]*to_account_id = v_to_account_id,[\s\S]*category_id = v_category_id,[\s\S]*amount = v_amount,[\s\S]*transaction_type = v_transaction_type,[\s\S]*description = v_description[\s\S]*WHERE id = v_occurrence\.transaction_id AND recurring_transaction_id = p_recurring_transaction_id/);
    expect(migration).toMatch(/SET override_account_id = NULL, override_to_account_id = NULL, override_category_id = NULL,[\s\S]*override_amount = NULL, override_transaction_type = NULL, override_description = NULL/);
  });

  it("deletes non-candidate materialized transactions and marks occurrences skipped", () => {
    expect(migration).toMatch(/DELETE FROM public\.transactions[\s\S]*WHERE id = v_occurrence\.transaction_id AND recurring_transaction_id = p_recurring_transaction_id/);
    expect(migration).toMatch(/SET status = 'skipped', transaction_id = NULL/);
  });

  it("anchors cadence at the effective date using the materializer math", () => {
    expect(migration).toMatch(/EXTRACT\(ISODOW FROM v_date\) < 6/);
    expect(migration).toMatch(/\(v_date - p_effective_date\) % v_recurrence_interval = 0/);
    expect(migration).toMatch(/EXTRACT\(DAY FROM v_date\) = LEAST\(EXTRACT\(DAY FROM p_effective_date\)/);
    expect(migration).toMatch(/v_recurrence_kind = 'never' AND v_date = p_effective_date/);
  });

  it("always treats the effective date as a candidate so the selected occurrence is updated even if it does not fit the new cadence", () => {
    expect(migration).toMatch(/v_is_candidate := v_date = p_effective_date OR \(/);
  });

  it("never pre-materializes occurrences itself", () => {
    expect(migration).not.toMatch(/status = 'materialized'/);
  });

  it("grants execution only to authenticated users", () => {
    expect(migration).toMatch(/REVOKE EXECUTE ON FUNCTION public\.apply_recurring_edit_from_occurrence\(UUID, DATE, JSONB\) FROM PUBLIC/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.apply_recurring_edit_from_occurrence\(UUID, DATE, JSONB\) TO authenticated/);
  });
});
