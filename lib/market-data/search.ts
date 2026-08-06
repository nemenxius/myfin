import { cacheGet, cacheKey, cacheSet } from "./cache";
import type { MarketSymbolSuggestion } from "./types";

const SEARCH_TTL_MS = 60_000;
const SEARCH_QUOTES_COUNT = 8;

export function parseYahooSearchResponse(
  data: unknown
): MarketSymbolSuggestion[] {
  if (!data || typeof data !== "object") return [];
  const quotes = (data as { quotes?: unknown }).quotes;
  if (!Array.isArray(quotes)) return [];

  const suggestions: MarketSymbolSuggestion[] = [];
  for (const entry of quotes) {
    if (!entry || typeof entry !== "object") continue;
    const quote = entry as Record<string, unknown>;
    if (quote.isYahooFinance === false) continue;

    const symbol =
      typeof quote.symbol === "string" ? quote.symbol.trim().toUpperCase() : "";
    if (!symbol) continue;

    const name =
      typeof quote.shortname === "string"
        ? quote.shortname
        : typeof quote.longname === "string"
          ? quote.longname
          : null;
    const exchange =
      typeof quote.exchDisp === "string"
        ? quote.exchDisp
        : typeof quote.exchange === "string"
          ? quote.exchange
          : null;

    suggestions.push({ symbol, name, exchange });
  }
  return suggestions;
}

export async function getSymbolSuggestions(
  query: string
): Promise<MarketSymbolSuggestion[]> {
  const key = cacheKey("search", query.toLowerCase());
  const cached = cacheGet<MarketSymbolSuggestion[]>(key);
  if (cached) return cached;

  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    query
  )}&quotesCount=${SEARCH_QUOTES_COUNT}&newsCount=0`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Yahoo search returned ${res.status}`);

  const suggestions = parseYahooSearchResponse(await res.json());
  cacheSet(key, suggestions, SEARCH_TTL_MS);
  return suggestions;
}
