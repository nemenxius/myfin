import type { HistoryRange, MarketHistoryPoint, MarketQuote } from "../types";

interface YahooChartResponse {
  chart: {
    result?: Array<{
      meta: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        currency?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{ close?: Array<number | null> }>;
      };
    }>;
    error?: unknown;
  };
}

async function fetchYahooChart(
  symbol: string,
  range: string,
  interval: string
): Promise<YahooChartResponse> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Yahoo returned ${res.status}`);
  return (await res.json()) as YahooChartResponse;
}

export async function getYahooQuote(symbol: string): Promise<MarketQuote> {
  const data = await fetchYahooChart(symbol, "1d", "1d");
  const result = data.chart?.result?.[0];
  const meta = result?.meta;
  if (!result || !meta) throw new Error("Yahoo quote not found");
  const currentPrice = meta.regularMarketPrice;
  const previousClose = meta.chartPreviousClose ?? meta.previousClose;
  if (currentPrice == null || previousClose == null) {
    throw new Error("Yahoo quote incomplete");
  }
  const change24h = currentPrice - previousClose;
  return {
    symbol,
    currentPrice,
    change24h,
    changePercent24h: previousClose !== 0 ? (change24h / previousClose) * 100 : 0,
    currency: meta.currency ?? "USD",
    previousClose,
  };
}

export async function getYahooHistory(
  symbol: string,
  range: HistoryRange
): Promise<MarketHistoryPoint[]> {
  const data = await fetchYahooChart(symbol, range, "1d");
  const result = data.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!timestamps || !closes) throw new Error("Yahoo history not found");
  const points: MarketHistoryPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close == null) continue;
    points.push({ date: new Date(timestamps[i] * 1000).toISOString(), close });
  }
  return points;
}
