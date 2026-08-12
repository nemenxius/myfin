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
});
