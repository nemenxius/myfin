import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("./013_transaction_recurring_rls.sql", import.meta.url), "utf8");

describe("transaction recurring-reference RLS migration contract", () => {
  it("neutralizes the permissive legacy transaction write policies", () => {
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Users can manage own transactions" ON public\.transactions/);
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Transactions must reference own account" ON public\.transactions/);
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Transactions must reference own to_account" ON public\.transactions/);
    expect(migration).not.toMatch(/CREATE POLICY "Users can manage own transactions"/);
  });

  it("enforces recurring rule ownership on both transaction write paths", () => {
    const recurringCheck = /recurring_transaction_id IS NULL OR EXISTS \(\s*SELECT 1 FROM public\.recurring_transactions r\s*WHERE r\.id = recurring_transaction_id\s*AND r\.user_id = auth\.uid\(\)\s*AND r\.user_id = user_id\s*\)/g;
    expect(migration.match(recurringCheck)?.length).toBe(2);
    expect(migration).toMatch(/CREATE POLICY "Users can insert own transactions"[\s\S]*WITH CHECK \([\s\S]*recurring_transaction_id IS NULL/);
    expect(migration).toMatch(/CREATE POLICY "Users can update own transactions"[\s\S]*WITH CHECK \([\s\S]*recurring_transaction_id IS NULL/);
  });

  it("keeps account, destination-account, and category ownership in INSERT and UPDATE checks", () => {
    const writePolicies = migration.match(/CREATE POLICY "Users can (?:insert|update) own transactions"[\s\S]*?(?=CREATE POLICY|$)/g) ?? [];
    expect(writePolicies).toHaveLength(2);
    for (const policy of writePolicies) {
      expect(policy).toMatch(/a\.id = account_id AND a\.user_id = auth\.uid\(\)/);
      expect(policy).toMatch(/a\.id = to_account_id AND a\.user_id = auth\.uid\(\)/);
      expect(policy).toMatch(/c\.id = category_id AND \(c\.user_id IS NULL OR c\.user_id = auth\.uid\(\)\)/);
    }
  });

  it("preserves own-row SELECT and DELETE behavior", () => {
    expect(migration).toMatch(/CREATE POLICY "Users can view own transactions" ON public\.transactions\s+FOR SELECT USING \(auth\.uid\(\) = user_id\)/);
    expect(migration).toMatch(/CREATE POLICY "Users can delete own transactions" ON public\.transactions\s+FOR DELETE USING \(auth\.uid\(\) = user_id\)/);
  });
});
