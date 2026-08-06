import { cacheGet, cacheKey, cacheSet } from "./cache";
import type { MarketQuote } from "./types";
import { getYahooQuote } from "./providers/yahoo";
import { getAlphaVantageQuote } from "./providers/alphavantage";
import { getCoinGeckoQuote } from "./providers/coingecko";

const QUOTE_TTL_MS = 60_000;

export async function getQuote(symbol: string): Promise<MarketQuote> {
  const key = cacheKey("quote", symbol);
  const cached = cacheGet<MarketQuote>(key);
  if (cached) return cached;

  const providers = [getYahooQuote, getAlphaVantageQuote, getCoinGeckoQuote];

  let lastError: unknown = null;
  for (const provider of providers) {
    try {
      const quote = await provider(symbol);
      cacheSet(key, quote, QUOTE_TTL_MS);
      return quote;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`No quote provider available for ${symbol}`);
}
