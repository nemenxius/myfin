import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ supabaseClient: {} }));
import { mergeOverEffectiveVersion, monthsThroughCurrent, type RecurringTransaction, type RecurringVersion } from "./use-recurring-transactions";

const monthlyRule: RecurringTransaction = {
  id: "rule-1",
  user_id: "user-1",
  account_id: "acc-1",
  to_account_id: null,
  category_id: "cat-1",
  amount: 100,
  transaction_type: "Expense",
  description: "Rent",
  start_date: "2026-01-01",
  end_date: null,
  recurrence_kind: "interval",
  recurrence_unit: "month",
  recurrence_interval: 1,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const weeklyVersion: RecurringVersion = {
  id: "version-1",
  recurring_transaction_id: "rule-1",
  effective_date: "2026-03-01",
  account_id: "acc-1",
  to_account_id: null,
  category_id: "cat-1",
  amount: 100,
  transaction_type: "Expense",
  description: "Rent",
  recurrence_kind: "interval",
  recurrence_unit: "week",
  recurrence_interval: 1,
  created_at: "2026-03-01T00:00:00Z",
};

describe("mergeOverEffectiveVersion", () => {
  it("keeps the effective version's cadence when updates omit recurrence fields", () => {
    const merged = mergeOverEffectiveVersion(monthlyRule, weeklyVersion, { amount: 120 });
    expect(merged.amount).toBe(120);
    expect(merged.recurrence_kind).toBe("interval");
    expect(merged.recurrence_unit).toBe("week");
    expect(merged.recurrence_interval).toBe(1);
    expect(merged.description).toBe("Rent");
  });

  it("falls back to the base rule when no version is effective yet", () => {
    const merged = mergeOverEffectiveVersion(monthlyRule, null, { amount: 120 });
    expect(merged.amount).toBe(120);
    expect(merged.recurrence_unit).toBe("month");
    expect(merged.recurrence_interval).toBe(1);
  });

  it("preserves null template fields from the effective version over rule values", () => {
    const versionWithoutCategory = { ...weeklyVersion, category_id: null };
    const merged = mergeOverEffectiveVersion(monthlyRule, versionWithoutCategory, { amount: 120 });
    expect(merged.category_id).toBeNull();
    expect(merged.amount).toBe(120);
  });

  it("applies explicit recurrence updates over the effective version", () => {
    const merged = mergeOverEffectiveVersion(monthlyRule, weeklyVersion, { recurrence_unit: "day", recurrence_interval: 1 });
    expect(merged.recurrence_unit).toBe("day");
    expect(merged.recurrence_interval).toBe(1);
  });
});

describe("monthsThroughCurrent", () => {
  it("returns every month from a past start through the current month", () => {
    expect(monthsThroughCurrent("2026-01", "2026-03")).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });

  it("does not backfill future months", () => {
    expect(monthsThroughCurrent("2026-05", "2026-03")).toEqual([]);
  });
});
