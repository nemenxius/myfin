export interface MarketQuote {
  symbol: string;
  currentPrice: number;
  change24h: number;
  changePercent24h: number;
  currency: string;
  previousClose: number;
}

export interface MarketHistoryPoint {
  date: string;
  close: number;
}

export type HistoryRange = "3m" | "6m" | "1y";

export interface MarketSymbolSuggestion {
  symbol: string;
  name: string | null;
  exchange: string | null;
}
