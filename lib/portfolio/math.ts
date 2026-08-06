export interface CalcTransaction {
  type: string;
  shares: number;
  pricePerShare: number;
  commission: number;
}

export interface HoldingCalculations {
  totalShares: number;
  avgPrice: number;
  costBasis: number;
  currentValue: number;
  totalChange: number;
  totalChangePercent: number | null;
  dailyChange: number;
  dailyChangePercent: number | null;
}

export type HistoryPoint = { date: string; close: number };
export type ValuePoint = { date: string; value: number };

export function totalShares(transactions: CalcTransaction[]): number {
  return transactions.reduce((sum, t) => {
    if (t.type === "buy") return sum + t.shares;
    if (t.type === "sell") return sum - t.shares;
    return sum;
  }, 0);
}

export function avgPrice(transactions: CalcTransaction[]): number {
  const buys = transactions.filter((t) => t.type === "buy");
  const boughtShares = buys.reduce((sum, t) => sum + t.shares, 0);
  if (boughtShares <= 0) return 0;
  const weightedCost = buys.reduce((sum, t) => sum + t.shares * t.pricePerShare, 0);
  return weightedCost / boughtShares;
}

export function sumCommissions(transactions: CalcTransaction[]): number {
  return transactions.reduce((sum, t) => sum + t.commission, 0);
}

export function computeCostBasis(
  shares: number,
  avg: number,
  commissions: number
): number {
  return shares * avg + commissions;
}

export function computeCurrentValue(shares: number, currentPrice: number): number {
  return shares * currentPrice;
}

export function computeHoldingCalculations(
  transactions: CalcTransaction[],
  currentPrice: number | null,
  previousClose: number | null
): HoldingCalculations {
  const shares = totalShares(transactions);
  const avg = avgPrice(transactions);
  const commissions = sumCommissions(transactions);
  const costBasis = computeCostBasis(shares, avg, commissions);
  const value = currentPrice == null ? 0 : computeCurrentValue(shares, currentPrice);
  const totalChange = value - costBasis;
  const dailyChange =
    currentPrice != null && previousClose != null
      ? (currentPrice - previousClose) * shares
      : 0;

  return {
    totalShares: shares,
    avgPrice: avg,
    costBasis,
    currentValue: value,
    totalChange,
    totalChangePercent: costBasis !== 0 ? (totalChange / costBasis) * 100 : null,
    dailyChange,
    dailyChangePercent: value !== 0 ? (dailyChange / value) * 100 : null,
  };
}

export function combineValueSeries(
  seriesBySymbol: Array<{ symbol: string; points: HistoryPoint[] }>,
  sharesBySymbol: Record<string, number>
): ValuePoint[] {
  const byDate = new Map<string, number>();
  for (const { symbol, points } of seriesBySymbol) {
    const shares = sharesBySymbol[symbol] ?? 0;
    for (const point of points) {
      const day = point.date.slice(0, 10);
      byDate.set(day, (byDate.get(day) ?? 0) + point.close * shares);
    }
  }
  return Array.from(byDate.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
