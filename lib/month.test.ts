import { describe, expect, it } from "vitest";
import { monthLabel, monthWindow, parseMonthParam } from "./month";

describe("parseMonthParam", () => {
  it("keeps a valid YYYY-MM value", () => {
    expect(parseMonthParam("2026-07")).toBe("2026-07");
  });

  it("falls back to current month for undefined", () => {
    const result = parseMonthParam(undefined);
    expect(result).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
  });

  it("rejects invalid month numbers", () => {
    expect(parseMonthParam("2026-13")).toBe(parseMonthParam(undefined));
    expect(parseMonthParam("2026-00")).toBe(parseMonthParam(undefined));
  });

  it("rejects malformed strings", () => {
    expect(parseMonthParam("foo")).toBe(parseMonthParam(undefined));
    expect(parseMonthParam("2026")).toBe(parseMonthParam(undefined));
  });

  it("rejects years 0-99 via the real-date round trip", () => {
    expect(parseMonthParam("0000-01")).toBe(parseMonthParam(undefined));
    expect(parseMonthParam("0099-01")).toBe(parseMonthParam(undefined));
  });
});

describe("monthWindow", () => {
  it("returns inclusive start and exclusive end at local midnight", () => {
    const { start, end } = monthWindow("2026-07");
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(6);
    expect(start.getDate()).toBe(1);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(7);
    expect(end.getDate()).toBe(1);
  });
});

describe("monthLabel", () => {
  it("formats month name and year", () => {
    expect(monthLabel("2026-07")).toBe("July 2026");
  });
});
