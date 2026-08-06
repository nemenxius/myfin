import { describe, expect, it } from "vitest";
import { parseYahooSearchResponse } from "./search";

describe("parseYahooSearchResponse", () => {
  it("maps Yahoo quotes to symbol suggestions", () => {
    const data = {
      quotes: [
        { symbol: "AAPL", shortname: "Apple Inc.", exchDisp: "NASDAQ" },
        { symbol: "BTC-USD", shortname: "Bitcoin USD", exchDisp: "CCC" },
      ],
    };

    expect(parseYahooSearchResponse(data)).toEqual([
      { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
      { symbol: "BTC-USD", name: "Bitcoin USD", exchange: "CCC" },
    ]);
  });

  it("falls back to longname when shortname is missing", () => {
    const data = {
      quotes: [{ symbol: "MSFT", longname: "Microsoft Corporation" }],
    };

    const [first] = parseYahooSearchResponse(data);
    expect(first).toEqual({
      symbol: "MSFT",
      name: "Microsoft Corporation",
      exchange: null,
    });
  });

  it("skips non-Yahoo-finance and malformed quotes", () => {
    const data = {
      quotes: [
        { symbol: "SPY", isYahooFinance: false },
        { symbol: "" },
        { longname: "no symbol" },
        null,
      ],
    };

    expect(parseYahooSearchResponse(data)).toEqual([]);
  });

  it("returns an empty array for invalid payloads", () => {
    expect(parseYahooSearchResponse(null)).toEqual([]);
    expect(parseYahooSearchResponse({})).toEqual([]);
    expect(parseYahooSearchResponse({ quotes: "nope" })).toEqual([]);
  });

  it("normalizes symbol case and whitespace", () => {
    const data = {
      quotes: [{ symbol: "  aapl ", shortname: "Apple Inc." }],
    };

    expect(parseYahooSearchResponse(data)[0]?.symbol).toBe("AAPL");
  });

  it("falls back to the raw exchange when exchDisp is missing", () => {
    const data = {
      quotes: [{ symbol: "MSFT", longname: "Microsoft", exchange: "NMS" }],
    };

    expect(parseYahooSearchResponse(data)[0]?.exchange).toBe("NMS");
  });
});
