import { describe, expect, it } from "vitest";
import {
  avgPrice,
  combineValueSeries,
  computeCostBasis,
  computeCurrentValue,
  computeHoldingCalculations,
  sumCommissions,
  totalShares,
  type CalcTransaction,
} from "./math";

const buy = (shares: number, price: number, commission = 0): CalcTransaction => ({
  type: "buy",
  shares,
  pricePerShare: price,
  commission,
});
const sell = (shares: number, price: number, commission = 0): CalcTransaction => ({
  type: "sell",
  shares,
  pricePerShare: price,
  commission,
});

describe("totalShares", () => {
  it("returns 0 for empty transactions", () => {
    expect(totalShares([])).toBe(0);
  });

  it("sums buys minus sells, ignoring dividends and transfers", () => {
    const txs = [buy(10, 100), buy(5, 120), sell(3, 130)];
    expect(totalShares(txs)).toBe(12);
  });
});

describe("avgPrice", () => {
  it("returns 0 when there are no buys", () => {
    expect(avgPrice([sell(1, 50)])).toBe(0);
  });

  it("computes weighted average buy price", () => {
    const txs = [buy(10, 100), buy(5, 120)];
    expect(avgPrice(txs)).toBeCloseTo(106.6667, 3);
  });
});

describe("sumCommissions", () => {
  it("sums all commissions", () => {
    expect(sumCommissions([buy(1, 10, 2), sell(1, 10, 3)])).toBe(5);
  });
});

describe("computeCostBasis", () => {
  it("computes shares * avg + commissions", () => {
    expect(computeCostBasis(10, 100, 25)).toBe(1025);
  });
});

describe("computeCurrentValue", () => {
  it("multiplies shares by current price", () => {
    expect(computeCurrentValue(10, 150)).toBe(1500);
  });
});

describe("computeHoldingCalculations", () => {
  it("computes the full set of metrics", () => {
    const txs = [buy(10, 100), buy(10, 120), sell(5, 130, 5)];
    const calc = computeHoldingCalculations(txs, 140, 135);
    expect(calc.totalShares).toBe(15);
    expect(calc.avgPrice).toBeCloseTo(110, 3);
    expect(calc.costBasis).toBeCloseTo(15 * 110 + 5, 3);
    expect(calc.currentValue).toBe(15 * 140);
    expect(calc.totalChange).toBeCloseTo(15 * 140 - (15 * 110 + 5), 3);
    expect(calc.dailyChange).toBe((140 - 135) * 15);
  });

  it("returns null percents when basis or value is zero", () => {
    const calc = computeHoldingCalculations([], null, null);
    expect(calc.totalShares).toBe(0);
    expect(calc.totalChangePercent).toBeNull();
    expect(calc.dailyChangePercent).toBeNull();
  });
});

describe("combineValueSeries", () => {
  it("sums multiple holdings by day and sorts ascending", () => {
    const series = combineValueSeries(
      [
        {
          symbol: "AAPL",
          points: [
            { date: "2026-01-01T00:00:00Z", close: 100 },
            { date: "2026-01-02T00:00:00Z", close: 110 },
          ],
        },
        { symbol: "BTC", points: [{ date: "2026-01-01T00:00:00Z", close: 50 }] },
      ],
      { AAPL: 2, BTC: 4 }
    );
    expect(series).toEqual([
      { date: "2026-01-01", value: 400 },
      { date: "2026-01-02", value: 220 },
    ]);
  });
});
