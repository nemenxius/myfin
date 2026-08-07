import { format, startOfMonth } from "date-fns";

export interface NetWorthEntryLike {
  entry_type: string;
  value: number;
}

export interface NetWorthTotals {
  totalAssets: number;
  totalLiabilities: number;
}

export interface NetWorthSnapshotLike {
  recorded_at: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
}

export interface NetWorthSeriesPoint {
  label: string;
  value: number;
  assets: number;
  liabilities: number;
}

export interface MonthDelta {
  amount: number;
  percent: number | null;
}

const MAX_POINTS = 366;

export function computeTotals(entries: NetWorthEntryLike[]): NetWorthTotals {
  let totalAssets = 0;
  let totalLiabilities = 0;
  for (const entry of entries) {
    if (entry.entry_type === "asset") totalAssets += entry.value;
    else if (entry.entry_type === "liability") totalLiabilities += entry.value;
  }
  return { totalAssets, totalLiabilities };
}

export function computeNetWorth(entries: NetWorthEntryLike[]): number {
  const { totalAssets, totalLiabilities } = computeTotals(entries);
  return totalAssets - totalLiabilities;
}

export function shouldRecordSnapshot(
  latest: { net_worth: number } | null,
  totalAssets: number,
  totalLiabilities: number
): boolean {
  const currentNet = totalAssets - totalLiabilities;
  return latest === null || latest.net_worth !== currentNet;
}

export function sortSnapshotsChronologically<
  T extends { recorded_at: string; id: string },
>(snapshots: T[]): T[] {
  return [...snapshots].sort((a, b) => {
    const cmp = a.recorded_at.localeCompare(b.recorded_at);
    if (cmp !== 0) return cmp;
    return a.id.localeCompare(b.id);
  });
}

function samplePoints<T>(points: T[]): T[] {
  if (points.length <= MAX_POINTS) return points;
  const step = points.length / MAX_POINTS;
  const sampled: T[] = [];
  for (let i = 0; i < MAX_POINTS; i++) {
    sampled.push(points[Math.floor(i * step)]);
  }
  return sampled;
}

export function buildNetWorthSeries(
  snapshots: NetWorthSnapshotLike[]
): NetWorthSeriesPoint[] {
  const sorted = [...snapshots].sort((a, b) =>
    a.recorded_at.localeCompare(b.recorded_at)
  );
  return samplePoints(sorted).map((s) => {
    const day = s.recorded_at.slice(0, 10);
    return {
      label: new Date(`${day}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      }),
      value: s.net_worth,
      assets: s.total_assets,
      liabilities: s.total_liabilities,
    };
  });
}

export function monthDelta(
  netWorth: number,
  snapshots: NetWorthSnapshotLike[],
  now: Date = new Date()
): MonthDelta | null {
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const baseline = [...snapshots]
    .filter((s) => s.recorded_at.slice(0, 10) < monthStart)
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0];
  if (!baseline) return null;
  const amount = netWorth - baseline.net_worth;
  const percent =
    baseline.net_worth !== 0
      ? (amount / Math.abs(baseline.net_worth)) * 100
      : null;
  return { amount, percent };
}
