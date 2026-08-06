export const ASSET_TYPES = [
  { value: "stock", label: "Stock" },
  { value: "etf", label: "ETF" },
  { value: "crypto", label: "Crypto" },
  { value: "fund", label: "Fund" },
  { value: "other", label: "Other" },
] as const;

export const ASSET_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ASSET_TYPES.map((t) => [t.value, t.label])
);

export const HOLDING_TRANSACTION_TYPES = [
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
  { value: "dividend", label: "Dividend" },
  { value: "transfer", label: "Transfer" },
] as const;

export const HOLDING_TRANSACTION_TYPE_LABELS: Record<string, string> =
  Object.fromEntries(HOLDING_TRANSACTION_TYPES.map((t) => [t.value, t.label]));
