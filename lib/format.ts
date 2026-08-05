export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export function getCurrencySymbol(currency = "USD"): string {
  const parts = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? currency;
}
