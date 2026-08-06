import { cacheGet, cacheKey, cacheSet } from "./cache";
import type { HistoryRange, MarketHistoryPoint } from "./types";
import { getYahooHistory } from "./providers/yahoo";
import { getAlphaVantageHistory } from "./providers/alphavantage";
import { getCoinGeckoHistory } from "./providers/coingecko";

const HISTORY_TTL_MS = 300_000;
const MAX_POINTS = 366;

export async function getHistory(
  symbol: string,
  range: HistoryRange = "1y"
): Promise<MarketHistoryPoint[]> {
  const key = cacheKey("history", symbol, range);
  const cached = cacheGet<MarketHistoryPoint[]>(key);
  if (cached) return cached;

  const providers = [
    () => getYahooHistory(symbol, range),
    () => getAlphaVantageHistory(symbol),
    () => getCoinGeckoHistory(symbol, range),
  ];

  let lastError: unknown = null;
  for (const provider of providers) {
    try {
      let points = await provider();
      if (points.length > MAX_POINTS) {
        const step = Math.ceil(points.length / MAX_POINTS);
        points = points.filter((_, i) => i % step === 0);
      }
      cacheSet(key, points, HISTORY_TTL_MS);
      return points;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`No history provider available for ${symbol}`);
}
