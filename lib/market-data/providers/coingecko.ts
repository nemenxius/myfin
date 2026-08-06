import type { HistoryRange, MarketHistoryPoint, MarketQuote } from "../types";

const COINGECKO_ID_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  DOGE: "dogecoin",
  XRP: "ripple",
  ADA: "cardano",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  DOT: "polkadot",
  LTC: "litecoin",
};

function coinId(symbol: string): string {
  return COINGECKO_ID_MAP[symbol.toUpperCase()] ?? symbol.toLowerCase();
}

function apiKey(): string {
  const key = process.env.COINGECKO_API_KEY;
  if (!key) throw new Error("COINGECKO_API_KEY not set");
  return key;
}

export async function getCoinGeckoQuote(symbol: string): Promise<MarketQuote> {
  const key = apiKey();
  const id = coinId(symbol);
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`;
  const res = await fetch(url, {
    headers: { accept: "application/json", "x-cg-demo-api-key": key },
  });
  if (!res.ok) throw new Error(`CoinGecko returned ${res.status}`);
  const json = (await res.json()) as Record<
    string,
    { usd?: number; usd_24h_change?: number }
  >;
  const coin = json[id];
  const price = coin?.usd;
  const changePercent = coin?.usd_24h_change;
  if (price == null) throw new Error("CoinGecko quote not found");
  const previousClose =
    changePercent != null ? price / (1 + changePercent / 100) : price;
  return {
    symbol,
    currentPrice: price,
    change24h: price - previousClose,
    changePercent24h: changePercent ?? 0,
    currency: "USD",
    previousClose,
  };
}

export async function getCoinGeckoHistory(
  symbol: string,
  range: HistoryRange
): Promise<MarketHistoryPoint[]> {
  const key = apiKey();
  const id = coinId(symbol);
  const days =
    range === "3m"
      ? 90
      : range === "6m"
        ? 182
        : range === "1y"
          ? 365
          : range === "2y"
            ? 730
            : range === "5y"
              ? 1825
              : "max";
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
  const res = await fetch(url, {
    headers: { accept: "application/json", "x-cg-demo-api-key": key },
  });
  if (!res.ok) throw new Error(`CoinGecko returned ${res.status}`);
  const json = (await res.json()) as { prices?: Array<[number, number]> };
  const prices = json.prices;
  if (!prices) throw new Error("CoinGecko history not found");
  return prices
    .filter(([, close]) => close != null)
    .map(([ts, close]) => ({ date: new Date(ts).toISOString(), close }));
}
