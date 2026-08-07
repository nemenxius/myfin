import { describe, expect, it } from "vitest";
import {
  buildNetWorthSeries,
  collectValueDates,
  computeNetWorth,
  computeTotals,
  entryCurrentValue,
  monthDelta,
  valueAsOf,
  type NetWorthEntryLike,
  type ValueRowLike,
} from "./math";

const value = (as_of: string, value: number): ValueRowLike => ({ as_of, value });

const entry = (
  id: string,
  entry_type: "asset" | "liability",
  values: ValueRowLike[]
): NetWorthEntryLike => ({ id, entry_type, values });

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
