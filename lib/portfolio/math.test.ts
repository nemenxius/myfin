import { describe, expect, it } from "vitest";
import {
  addDays,
  format,
  parseISO,
  subMonths,
  subYears,
} from "date-fns";
import {
  avgPrice,
  buildHoldingValueSeries,
  combineValueSeries,
  computeCostBasis,
  computeCurrentValue,
  computeHoldingCalculations,
  rangeForDate,
  sumCommissions,
  totalShares,
  type CalcTransaction,
  type DatedCalcTransaction,
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

const datedBuy = (shares: number, price: number, date: string): DatedCalcTransaction => ({
  type: "buy",
  shares,
  pricePerShare: price,
  commission: 0,
  date,
});
const datedSell = (shares: number, price: number, date: string): DatedCalcTransaction => ({
  type: "sell",
  shares,
  pricePerShare: price,
  commission: 0,
  date,
});

describe("buildHoldingValueSeries", () => {
  const history = [
    { date: "2026-01-01T00:00:00Z", close: 100 },
    { date: "2026-01-02T00:00:00Z", close: 110 },
    { date: "2026-01-03T00:00:00Z", close: 120 },
  ];

  it("skips points before the first buy and multiplies running shares by close", () => {
    const txs = [datedBuy(2, 100, "2026-01-02T10:00:00Z")];
    expect(buildHoldingValueSeries(txs, history)).toEqual([
      { date: "2026-01-02", value: 220 },
      { date: "2026-01-03", value: 240 },
    ]);
  });

  it("reflects sells and stops emitting after a full sell", () => {
    const txs = [
      datedBuy(10, 100, "2026-01-01T00:00:00Z"),
      datedSell(4, 120, "2026-01-02T00:00:00Z"),
    ];
    expect(buildHoldingValueSeries(txs, history)).toEqual([
      { date: "2026-01-01", value: 1000 },
      { date: "2026-01-02", value: 6 * 110 },
      { date: "2026-01-03", value: 6 * 120 },
    ]);
  });

  it("ignores dividend and transfer types for the share schedule", () => {
    const txs = [
      datedBuy(5, 100, "2026-01-01T00:00:00Z"),
      { ...datedBuy(0, 0, "2026-01-02T00:00:00Z"), type: "dividend" },
      { ...datedSell(0, 0, "2026-01-02T00:00:00Z"), type: "transfer" },
    ];
    expect(buildHoldingValueSeries(txs, history)).toEqual([
      { date: "2026-01-01", value: 500 },
      { date: "2026-01-02", value: 550 },
      { date: "2026-01-03", value: 600 },
    ]);
  });
});

describe("rangeForDate", () => {
  const now = new Date("2026-08-06T12:00:00Z");

  it("maps recent dates to small ranges", () => {
    expect(rangeForDate("2026-06-01", now)).toBe("3m");
  });

  it("maps dates older than 6 months to 1y and older than 2y to 5y", () => {
    expect(rangeForDate(format(subMonths(now, 10), "yyyy-MM-dd"), now)).toBe("1y");
    expect(rangeForDate(format(subYears(now, 3), "yyyy-MM-dd"), now)).toBe("5y");
  });

  it("returns max for dates older than 5 years", () => {
    expect(rangeForDate(format(subYears(now, 7), "yyyy-MM-dd"), now)).toBe("max");
  });

  it("applies a 7 day buffer so the range starts before the purchase", () => {
    const boundary = format(addDays(subMonths(now, 3), -8), "yyyy-MM-dd");
    expect(rangeForDate(boundary, now)).toBe("6m");
  });
});

describe("combineValueSeries", () => {
  it("sums multiple holdings by day and sorts ascending", () => {
    const series = combineValueSeries([
      {
        symbol: "AAPL",
        points: [
          { date: "2026-01-01", value: 400 },
          { date: "2026-01-02", value: 220 },
        ],
      },
      { symbol: "BTC", points: [{ date: "2026-01-01", value: 50 }] },
    ]);
    expect(series).toEqual([
      { date: "2026-01-01", value: 450 },
      { date: "2026-01-02", value: 220 },
    ]);
  });
});
