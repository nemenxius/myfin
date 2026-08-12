import { describe, expect, it } from "vitest";
import {
  applyOccurrenceOverride,
  isOccurrenceDate,
  nextOccurrence,
  occurrencesInMonth,
  selectEffectiveVersion,
  validateRecurrenceRule,
} from "./engine";
import type { RecurrenceRule } from "./types";

const rule = (recurrence: RecurrenceRule["recurrence"], startDate = "2026-01-01", endDate: string | null = null): RecurrenceRule => ({
  startDate,
  endDate,
  recurrence,
});

describe("validateRecurrenceRule", () => {
  it("accepts never and daily rules", () => {
    expect(validateRecurrenceRule(rule({ kind: "never", unit: null, interval: null }))).toEqual([]);
    expect(validateRecurrenceRule(rule({ kind: "interval", unit: "day", interval: 1 }))).toEqual([]);
  });

  it("rejects missing dates, invalid units, and invalid intervals", () => {
    expect(validateRecurrenceRule(rule({ kind: "interval", unit: "hour" as never, interval: 1 }))).toContain("unit");
    expect(validateRecurrenceRule(rule({ kind: "interval", unit: "day", interval: 0 }))).toContain("interval");
    expect(validateRecurrenceRule(rule({ kind: "interval", unit: "day", interval: null }))).toContain("interval");
    expect(validateRecurrenceRule(rule({ kind: "interval", unit: "day", interval: 1 }, ""))).toContain("startDate");
  });

  it("includes the end date when it is an occurrence", () => {
    const daily = rule({ kind: "interval", unit: "day", interval: 1 }, "2026-01-01", "2026-01-03");
    expect(occurrencesInMonth(daily, "2026-01")).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });
});

describe("recurrence calculations", () => {
  it("calculates never, daily, and every-other-day schedules", () => {
    expect(occurrencesInMonth(rule({ kind: "never", unit: null, interval: null }, "2026-01-10"), "2026-01")).toEqual(["2026-01-10"]);
    expect(occurrencesInMonth(rule({ kind: "interval", unit: "day", interval: 2 }), "2026-01")).toEqual([
      "2026-01-01", "2026-01-03", "2026-01-05", "2026-01-07", "2026-01-09", "2026-01-11", "2026-01-13", "2026-01-15", "2026-01-17", "2026-01-19", "2026-01-21", "2026-01-23", "2026-01-25", "2026-01-27", "2026-01-29", "2026-01-31",
    ]);
  });

  it("skips weekends for workdays and resumes on Monday", () => {
    const workdays = rule({ kind: "workday", unit: null, interval: null }, "2026-01-09");
    expect(occurrencesInMonth(workdays, "2026-01")).toEqual(["2026-01-09", "2026-01-12", "2026-01-13", "2026-01-14", "2026-01-15", "2026-01-16", "2026-01-19", "2026-01-20", "2026-01-21", "2026-01-22", "2026-01-23", "2026-01-26", "2026-01-27", "2026-01-28", "2026-01-29", "2026-01-30"]);
  });

  it("supports weekly intervals", () => {
    expect(occurrencesInMonth(rule({ kind: "interval", unit: "week", interval: 2 }), "2026-02")).toEqual(["2026-02-12", "2026-02-26"]);
    expect(occurrencesInMonth(rule({ kind: "interval", unit: "week", interval: 3 }), "2026-02")).toEqual(["2026-02-12"]);
    expect(occurrencesInMonth(rule({ kind: "interval", unit: "week", interval: 4 }), "2026-02")).toEqual(["2026-02-26"]);
  });

  it("clamps monthly schedules without drifting the original day", () => {
    const monthly = rule({ kind: "interval", unit: "month", interval: 1 }, "2026-01-30");
    expect(occurrencesInMonth(monthly, "2026-02")).toEqual(["2026-02-28"]);
    expect(occurrencesInMonth(monthly, "2026-03")).toEqual(["2026-03-30"]);
    expect(occurrencesInMonth(rule({ kind: "interval", unit: "month", interval: 2 }, "2026-01-31"), "2026-03")).toEqual(["2026-03-31"]);
    expect(occurrencesInMonth(rule({ kind: "interval", unit: "month", interval: 1 }, "2024-01-31"), "2024-02")).toEqual(["2024-02-29"]);
  });

  it("clamps leap-day yearly schedules", () => {
    const yearly = rule({ kind: "interval", unit: "year", interval: 1 }, "2024-02-29");
    expect(occurrencesInMonth(yearly, "2025-02")).toEqual(["2025-02-28"]);
    expect(occurrencesInMonth(yearly, "2028-02")).toEqual(["2028-02-29"]);
  });

  it("handles boundaries, future months, end dates, and skipped dates", () => {
    const daily = rule({ kind: "interval", unit: "day", interval: 1 }, "2026-01-31", "2026-02-02");
    expect(occurrencesInMonth(daily, "2026-01")).toEqual(["2026-01-31"]);
    expect(occurrencesInMonth(daily, "2026-02")).toEqual(["2026-02-01", "2026-02-02"]);
    expect(occurrencesInMonth(daily, "2027-01")).toEqual([]);
    expect(isOccurrenceDate(daily, "2026-02-03")).toBe(false);
    expect(nextOccurrence(daily, "2026-01-31")).toBe("2026-02-01");
    expect(nextOccurrence(daily, "2026-02-02")).toBe(null);
  });
});

describe("effective versions and overrides", () => {
  const versions = [{ effectiveDate: "2026-01-01", amount: 1 }, { effectiveDate: "2026-03-01", amount: 3 }];

  it("selects the latest version effective on a date", () => {
    expect(selectEffectiveVersion(versions, "2026-02-01")).toEqual(versions[0]);
    expect(selectEffectiveVersion(versions, "2025-12-01")).toBe(null);
    expect(selectEffectiveVersion(versions, "2026-03-01")).toEqual(versions[1]);
  });

  it("applies an occurrence override over the base value", () => {
    expect(applyOccurrenceOverride({ amount: 10, note: "base" }, { amount: 20 })).toEqual({ amount: 20, note: "base" });
  });
});
