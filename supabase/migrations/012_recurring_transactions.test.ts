import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("./012_recurring_transactions.sql", import.meta.url), "utf8");

describe("recurring transaction migration contract", () => {
  it("keeps cadence on effective versions and resolves it in the RPC", () => {
    expect(migration).toMatch(/CREATE TABLE public\.recurring_transaction_versions[\s\S]*recurrence_kind TEXT NOT NULL/);
    expect(migration).toMatch(/CREATE TABLE public\.recurring_transaction_versions[\s\S]*recurrence_unit TEXT/);
    expect(migration).toMatch(/CREATE TABLE public\.recurring_transaction_versions[\s\S]*recurrence_interval INTEGER/);
    expect(migration).toMatch(/v_version\.recurrence_kind/);
    expect(migration).toMatch(/v_version\.recurrence_unit/);
    expect(migration).toMatch(/v_version\.recurrence_interval/);
  });

  it("guards amounts, transfer account identity, and resolved ownership", () => {
    expect(migration.match(/amount <> 0/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toMatch(/to_account_id IS NULL OR to_account_id <> account_id/);
    expect(migration).toMatch(/override_to_account_id IS NULL OR override_account_id IS NULL OR override_to_account_id <> override_account_id/);
    expect(migration).toMatch(/resolved account/i);
    expect(migration).toMatch(/category ownership/i);
  });

  it("bounds RPC iteration to the requested month", () => {
    expect(migration).toMatch(/GREATEST\(v_rule\.start_date, v_month\)/);
  });

  it("anchors each effective version at its own effective date", () => {
    expect(migration).toMatch(/v_version\.effective_date/);
    expect(migration).toMatch(/v_cadence_start/);
    expect(migration).toMatch(/v_cadence_kind/);
    expect(migration).toMatch(/v_cadence_kind = 'never'[\s\S]*v_date = v_cadence_start/);
    expect(migration).toMatch(/v_date >= v_cadence_start/);
  });

  it("restricts interval cadence to supported configurations", () => {
    expect(migration).toMatch(/recurrence_unit = 'day' AND recurrence_interval IN \(1, 2\)/);
    expect(migration).toMatch(/recurrence_unit = 'week' AND recurrence_interval IN \(1, 2, 3, 4\)/);
    expect(migration).toMatch(/recurrence_unit = 'month' AND recurrence_interval IN \(1, 2, 3, 6\)/);
    expect(migration).toMatch(/recurrence_unit = 'year' AND recurrence_interval = 1/);
  });

  it("validates occurrence transaction ownership and rule matching in RLS and RPC", () => {
    expect(migration).toMatch(/transaction_id IS NULL OR EXISTS \(SELECT 1 FROM public\.transactions t WHERE t\.id = transaction_id AND t\.user_id = auth\.uid\(\) AND t\.recurring_transaction_id = recurring_transaction_id\)/g);
    expect(migration).toMatch(/transaction_id = v_transaction\.id/);
    expect(migration).toMatch(/transaction_id IS NULL OR transaction_id = v_transaction\.id/);
  });

  it("does not pre-create skipped occurrence rows", () => {
    expect(migration).not.toMatch(/INSERT INTO public\.recurring_transaction_occurrences[^;]*'skipped'/);
    expect(migration).toMatch(/INSERT INTO public\.recurring_transaction_occurrences \(recurring_transaction_id, occurrence_date\)/);
  });
});
