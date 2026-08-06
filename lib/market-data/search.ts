import type { MarketSymbolSuggestion } from "./types";

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
