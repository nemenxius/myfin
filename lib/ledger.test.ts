import { describe, expect, it } from "vitest";
import { buildLedger } from "./ledger";

const tx = (id: string, date: string, amount: number) => ({
  id,
  date,
  amount,
  user_id: "u1",
  account_id: "a1",
  category_id: null,
  description: null,
  transaction_type: "expense",
  created_at: date,
});

describe("buildLedger", () => {
  const transactions = [
    tx("pre-1", "2026-05-10T00:00:00.000Z", 1000),
    tx("pre-2", "2026-06-25T00:00:00.000Z", -200),
    tx("month-1", "2026-07-05T00:00:00.000Z", -150),
    tx("month-2", "2026-07-20T00:00:00.000Z", 300),
    tx("future", "2026-08-05T00:00:00.000Z", 999),
  ];

  it("carries forward the pre-month seed and shows newest-first", () => {
    const rows = buildLedger(transactions, "2026-07");
    expect(rows.map((r) => r.id)).toEqual(["month-2", "month-1"]);
    expect(rows[1].balance).toBe(650);
    expect(rows[0].balance).toBe(950);
  });

  it("excludes future-dated transactions", () => {
    const rows = buildLedger(transactions, "2026-07");
    expect(rows.find((r) => r.id === "future")).toBeUndefined();
  });

  it("handles an empty month", () => {
    expect(buildLedger(transactions, "2027-01")).toEqual([]);
  });
});
