import type { HistoryRange, MarketHistoryPoint, MarketQuote } from "../types";

function apiKey(): string {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) throw new Error("ALPHA_VANTAGE_API_KEY not set");
  return key;
}

interface AlphaVantageQuoteResponse {
  "Global Quote"?: {
    "05. price"?: string;
    "08. previous close"?: string;
    "04. currency"?: string;
  };
}

interface AlphaVantageHistoryResponse {
  "Time Series (Daily)"?: Record<string, { "4. close": string }>;
}

export async function getAlphaVantageQuote(symbol: string): Promise<MarketQuote> {
  const key = apiKey();
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage returned ${res.status}`);
  const json = (await res.json()) as AlphaVantageQuoteResponse;
  const quote = json["Global Quote"];
  const price = quote ? Number(quote["05. price"]) : NaN;
  const previousClose = quote ? Number(quote["08. previous close"]) : NaN;
  if (!quote || Number.isNaN(price) || Number.isNaN(previousClose)) {
    throw new Error("Alpha Vantage quote not found");
  }
  const change24h = price - previousClose;
  return {
    symbol,
    currentPrice: price,
    change24h,
    changePercent24h: previousClose !== 0 ? (change24h / previousClose) * 100 : 0,
    currency: quote["04. currency"] ?? "USD",
    previousClose,
  };
}

export async function getAlphaVantageHistory(
  symbol: string,
  range?: HistoryRange
): Promise<MarketHistoryPoint[]> {
  const key = apiKey();
  const outputsize =
    range === "2y" || range === "5y" || range === "max" ? "full" : "compact";
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=${outputsize}&apikey=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage returned ${res.status}`);
  const json = (await res.json()) as AlphaVantageHistoryResponse;
  const series = json["Time Series (Daily)"];
  if (!series) throw new Error("Alpha Vantage history not found");
  return Object.entries(series)
    .map(([date, entry]) => ({ date, close: Number(entry["4. close"]) }))
    .filter((point) => !Number.isNaN(point.close))
    .sort((a, b) => a.date.localeCompare(b.date));
}
