import { describe, expect, it } from "vitest";
import {
  buildNetWorthSeries,
  collectValueDates,
  computeCategoryBreakdown,
  computeNetWorth,
  computeTotals,
  entryCurrentValue,
  monthDelta,
  UNCATEGORIZED_CATEGORY_ID,
  valueAsOf,
  type NetWorthEntryLike,
  type ValueRowLike,
} from "./math";

const value = (as_of: string, value: number): ValueRowLike => ({ as_of, value });

const entry = (
  id: string,
  entry_type: "asset" | "liability",
  values: ValueRowLike[],
  category_id?: string | null
): NetWorthEntryLike => ({ id, entry_type, values, category_id });

describe("entryCurrentValue", () => {
  it("returns null when the entry has no value rows", () => {
    expect(entryCurrentValue(entry("a", "asset", []))).toBeNull();
  });

  it("returns the latest dated value", () => {
    const e = entry("a", "asset", [
      value("2026-05-01", 20000),
      value("2026-06-01", 21000),
    ]);
    expect(entryCurrentValue(e)).toBe(21000);
  });
});

describe("valueAsOf", () => {
  it("returns the value at or before the date", () => {
    const e = entry("a", "asset", [
      value("2026-05-01", 20000),
      value("2026-06-01", 21000),
    ]);
    expect(valueAsOf(e, "2026-05-15")).toBe(20000);
    expect(valueAsOf(e, "2026-06-15")).toBe(21000);
  });

  it("returns null before the first dated value", () => {
    const e = entry("a", "asset", [value("2026-06-01", 21000)]);
    expect(valueAsOf(e, "2026-04-01")).toBeNull();
  });
});

describe("computeTotals", () => {
  it("returns zero totals for no entries", () => {
    expect(computeTotals([])).toEqual({ totalAssets: 0, totalLiabilities: 0 });
  });

  it("sums each entry's latest value at or before the given date", () => {
    const bank = entry("a", "asset", [
      value("2026-05-01", 20000),
      value("2026-06-01", 21000),
    ]);
    const loan = entry("l", "liability", [
      value("2026-05-01", 15000),
      value("2026-06-01", 16000),
    ]);
    expect(computeTotals([bank, loan], "2026-05-15")).toEqual({
      totalAssets: 20000,
      totalLiabilities: 15000,
    });
    expect(computeTotals([bank, loan], "2026-06-15")).toEqual({
      totalAssets: 21000,
      totalLiabilities: 16000,
    });
  });

  it("ignores entries with no applicable value as of the date", () => {
    const bank = entry("a", "asset", [value("2026-06-01", 21000)]);
    expect(computeTotals([bank], "2026-04-01")).toEqual({
      totalAssets: 0,
      totalLiabilities: 0,
    });
  });

  it("defaults to today when no asOf is given", () => {
    const bank = entry("a", "asset", [value("2024-01-01", 1000)]);
    expect(computeTotals([bank])).toEqual({
      totalAssets: 1000,
      totalLiabilities: 0,
    });
  });
});

describe("computeNetWorth", () => {
  it("computes assets minus liabilities as of a date", () => {
    const bank = entry("a", "asset", [value("2026-06-01", 21000)]);
    const loan = entry("l", "liability", [value("2026-06-01", 16000)]);
    expect(computeNetWorth([bank, loan], "2026-06-01")).toBe(5000);
  });
});

describe("collectValueDates", () => {
  it("returns sorted unique dates across all entries", () => {
    const bank = entry("a", "asset", [
      value("2026-06-01", 21000),
      value("2026-05-01", 20000),
    ]);
    const loan = entry("l", "liability", [
      value("2026-06-01", 16000),
      value("2026-04-01", 15000),
    ]);
    expect(collectValueDates([bank, loan])).toEqual([
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
    ]);
  });
});

describe("buildNetWorthSeries", () => {
  it("reconstructs net worth at each unique date", () => {
    const bank = entry("a", "asset", [
      value("2026-05-01", 20000),
      value("2026-06-01", 21000),
    ]);
    const loan = entry("l", "liability", [value("2026-06-01", 15000)]);
    expect(buildNetWorthSeries([bank, loan])).toEqual([
      { label: "May 2026", value: 20000, assets: 20000, liabilities: 0 },
      {
        label: "Jun 2026",
        value: 6000,
        assets: 21000,
        liabilities: 15000,
      },
    ]);
  });

  it("downsamples to at most MAX_POINTS+1 points and keeps the most recent date", () => {
    const rows: ValueRowLike[] = [];
    for (let i = 0; i < 400; i++) {
      const d = new Date("2026-01-01T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + i);
      rows.push({ as_of: d.toISOString().slice(0, 10), value: i + 1 });
    }
    const bank = entry("a", "asset", rows);
    const series = buildNetWorthSeries([bank]);
    expect(series.length).toBeLessThanOrEqual(367);
    expect(series[series.length - 1].value).toBe(400);
  });
});

describe("monthDelta", () => {
  const now = new Date("2026-08-07T12:00:00Z");

  it("returns null when no value date precedes the current month", () => {
    const bank = entry("a", "asset", [value("2026-08-01", 60000)]);
    expect(monthDelta([bank], now)).toBeNull();
  });

  it("computes the change from the last date before the current month", () => {
    const bank = entry("a", "asset", [
      value("2026-07-15", 50000),
      value("2026-08-01", 60000),
    ]);
    expect(monthDelta([bank], now)).toEqual({ amount: 10000, percent: 20 });
  });

  it("returns null percent when the baseline is zero", () => {
    const bank = entry("a", "asset", [
      value("2026-06-01", 0),
      value("2026-08-01", 500),
    ]);
    expect(monthDelta([bank], now)).toEqual({ amount: 500, percent: null });
  });
});

describe("computeCategoryBreakdown", () => {
  const catMap = new Map<string, { name: string; icon: string }>([
    ["c1", { name: "Money", icon: "Banknote" }],
    ["c2", { name: "Stock Exchange", icon: "CandlestickChart" }],
  ]);

  it("returns an empty array for no entries", () => {
    expect(computeCategoryBreakdown([], catMap)).toEqual([]);
  });

  it("groups assets by category and computes percentages", () => {
    const money = entry("a1", "asset", [value("2026-06-01", 30000)], "c1");
    const stock = entry("a2", "asset", [value("2026-06-01", 10000)], "c2");
    const rows = computeCategoryBreakdown([money, stock], catMap);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "c1",
      name: "Money",
      icon: "Banknote",
      amount: 30000,
    });
    expect(rows[0].percent).toBeCloseTo(75, 5);
    expect(rows[1]).toMatchObject({
      id: "c2",
      name: "Stock Exchange",
      icon: "CandlestickChart",
      amount: 10000,
    });
    expect(rows[1].percent).toBeCloseTo(25, 5);
  });

  it("buckets uncategorized assets", () => {
    const uncat = entry("a1", "asset", [value("2026-06-01", 5000)]);
    const rows = computeCategoryBreakdown([uncat], catMap);
    expect(rows).toEqual([
      {
        id: UNCATEGORIZED_CATEGORY_ID,
        name: "Uncategorized",
        icon: "Tag",
        amount: 5000,
        percent: 100,
      },
    ]);
  });

  it("sorts by amount descending", () => {
    const small = entry("a1", "asset", [value("2026-06-01", 1000)], "c1");
    const big = entry("a2", "asset", [value("2026-06-01", 9000)], "c2");
    const rows = computeCategoryBreakdown([small, big], catMap);
    expect(rows.map((r) => r.amount)).toEqual([9000, 1000]);
  });

  it("skips entries without values and liabilities", () => {
    const noValue = entry("a1", "asset", []);
    const liability = entry("l1", "liability", [value("2026-06-01", 5000)]);
    expect(computeCategoryBreakdown([noValue, liability], catMap)).toEqual([]);
  });

  it("breaks amount ties alphabetically by name", () => {
    const stock = entry("a1", "asset", [value("2026-06-01", 5000)], "c2");
    const money = entry("a2", "asset", [value("2026-06-01", 5000)], "c1");
    const rows = computeCategoryBreakdown([stock, money], catMap);
    expect(rows.map((r) => r.name)).toEqual(["Money", "Stock Exchange"]);
  });
});
