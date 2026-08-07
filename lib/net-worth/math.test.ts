import { describe, expect, it } from "vitest";
import {
  buildNetWorthSeries,
  computeNetWorth,
  computeTotals,
  monthDelta,
  shouldRecordSnapshot,
  sortSnapshotsChronologically,
  type NetWorthEntryLike,
  type NetWorthSnapshotLike,
} from "./math";

const entry = (
  entry_type: "asset" | "liability",
  value: number
): NetWorthEntryLike => ({ entry_type, value });

const snapshot = (
  recorded_at: string,
  total_assets: number,
  total_liabilities: number,
  net_worth: number
): NetWorthSnapshotLike => ({ recorded_at, total_assets, total_liabilities, net_worth });

describe("computeTotals", () => {
  it("returns zero totals for no entries", () => {
    expect(computeTotals([])).toEqual({ totalAssets: 0, totalLiabilities: 0 });
  });

  it("sums assets and liabilities separately", () => {
    const entries = [
      entry("asset", 200000),
      entry("asset", 15000),
      entry("liability", 150000),
      entry("liability", 12550),
    ];
    expect(computeTotals(entries)).toEqual({
      totalAssets: 215000,
      totalLiabilities: 162550,
    });
  });
});

describe("computeNetWorth", () => {
  it("computes assets minus liabilities", () => {
    const entries = [entry("asset", 215000), entry("liability", 142550)];
    expect(computeNetWorth(entries)).toBe(72450);
  });

  it("is positive with zero liabilities", () => {
    expect(computeNetWorth([entry("asset", 100)])).toBe(100);
  });

  it("is negative with zero assets", () => {
    expect(computeNetWorth([entry("liability", 100)])).toBe(-100);
  });

  it("handles multiple assets and liabilities", () => {
    const entries = [
      entry("asset", 200000),
      entry("asset", 15000),
      entry("asset", 10000),
      entry("liability", 150000),
      entry("liability", 12000),
    ];
    expect(computeNetWorth(entries)).toBe(63000);
  });
});

describe("shouldRecordSnapshot", () => {
  it("always records when there is no latest snapshot", () => {
    expect(shouldRecordSnapshot(null, 100, 50)).toBe(true);
  });

  it("records when net worth changes", () => {
    expect(shouldRecordSnapshot({ net_worth: 50 }, 110, 50)).toBe(true);
  });

  it("skips when net worth is unchanged", () => {
    expect(shouldRecordSnapshot({ net_worth: 60 }, 110, 50)).toBe(false);
  });
});

describe("sortSnapshotsChronologically", () => {
  it("sorts ascending by recorded_at with id tie-break", () => {
    const snapshots = [
      { id: "b", recorded_at: "2026-09-01T00:00:00Z", net_worth: 65 },
      { id: "a", recorded_at: "2026-08-01T00:00:00Z", net_worth: 57 },
      { id: "c", recorded_at: "2026-09-01T00:00:00Z", net_worth: 64 },
    ];
    expect(sortSnapshotsChronologically(snapshots).map((s) => s.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("buildNetWorthSeries", () => {
  it("maps snapshots to chart points sorted ascending", () => {
    const snapshots = [
      snapshot("2026-08-01T10:00:00Z", 200000, 150000, 50000),
      snapshot("2026-07-01T10:00:00Z", 195000, 150000, 45000),
    ];
    expect(buildNetWorthSeries(snapshots)).toEqual([
      { label: "Jul 2026", value: 45000, assets: 195000, liabilities: 150000 },
      { label: "Aug 2026", value: 50000, assets: 200000, liabilities: 150000 },
    ]);
  });
});

describe("monthDelta", () => {
  const now = new Date("2026-08-07T12:00:00Z");
  const snapshots = [
    snapshot("2026-08-01T10:00:00Z", 0, 0, 60000),
    snapshot("2026-07-15T10:00:00Z", 0, 0, 50000),
  ];

  it("returns null when there is no baseline before the month", () => {
    const augustOnly = snapshots.filter((s) => s.recorded_at.startsWith("2026-08"));
    expect(monthDelta(60000, augustOnly, now)).toBeNull();
  });

  it("computes the change from the last snapshot before the current month", () => {
    expect(monthDelta(60000, snapshots, now)).toEqual({ amount: 10000, percent: 20 });
  });

  it("returns null percent when the baseline is zero", () => {
    const zeroBaseline = [snapshot("2026-06-01T10:00:00Z", 0, 0, 0)];
    expect(monthDelta(500, zeroBaseline, now)).toEqual({ amount: 500, percent: null });
  });
});
