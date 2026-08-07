import { format, startOfMonth } from "date-fns";

export interface ValueRowLike {
  as_of: string;
  value: number;
}

export interface NetWorthEntryLike {
  id: string;
  entry_type: string;
  values: ValueRowLike[];
}

export interface NetWorthTotals {
  totalAssets: number;
  totalLiabilities: number;
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

const todayString = (): string => format(new Date(), "yyyy-MM-dd");

export function entryCurrentValue(entry: NetWorthEntryLike): number | null {
  if (entry.values.length === 0) return null;
  const latest = [...entry.values].sort((a, b) =>
    b.as_of.localeCompare(a.as_of)
  )[0];
  return latest.value;
}

export function valueAsOf(
  entry: NetWorthEntryLike,
  date: string
): number | null {
  const applicable = entry.values
    .filter((v) => v.as_of <= date)
    .sort((a, b) => b.as_of.localeCompare(a.as_of))[0];
  return applicable ? applicable.value : null;
}

export function computeTotals(
  entries: NetWorthEntryLike[],
  asOf: string = todayString()
): NetWorthTotals {
  let totalAssets = 0;
  let totalLiabilities = 0;
  for (const entry of entries) {
    const v = valueAsOf(entry, asOf);
    if (v === null) continue;
    if (entry.entry_type === "asset") totalAssets += v;
    else if (entry.entry_type === "liability") totalLiabilities += v;
  }
  return { totalAssets, totalLiabilities };
}

export function computeNetWorth(
  entries: NetWorthEntryLike[],
  asOf: string = todayString()
): number {
  const { totalAssets, totalLiabilities } = computeTotals(entries, asOf);
  return totalAssets - totalLiabilities;
}

export function collectValueDates(entries: NetWorthEntryLike[]): string[] {
  const dates = new Set<string>();
  for (const entry of entries) {
    for (const v of entry.values) dates.add(v.as_of);
  }
  return [...dates].sort((a, b) => a.localeCompare(b));
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
  entries: NetWorthEntryLike[]
): NetWorthSeriesPoint[] {
  const dates = collectValueDates(entries);
  return samplePoints(dates).map((date) => {
    const totals = computeTotals(entries, date);
    return {
      label: new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      }),
      value: totals.totalAssets - totals.totalLiabilities,
      assets: totals.totalAssets,
      liabilities: totals.totalLiabilities,
    };
  });
}

export function monthDelta(
  entries: NetWorthEntryLike[],
  now: Date = new Date()
): MonthDelta | null {
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const baselineDate = collectValueDates(entries)
    .filter((d) => d < monthStart)
    .sort((a, b) => b.localeCompare(a))[0];
  if (!baselineDate) return null;
  const currentNet = computeNetWorth(entries);
  const baselineNet = computeNetWorth(entries, baselineDate);
  const amount = currentNet - baselineNet;
  const percent =
    baselineNet !== 0 ? (amount / Math.abs(baselineNet)) * 100 : null;
  return { amount, percent };
}
