const VALID_CURRENCY = /^[A-Za-z]{3}$/;

function safeNumberFormat(currency: string, options: Intl.NumberFormatOptions) {
  try {
    return new Intl.NumberFormat("en-US", { ...options, currency });
  } catch {
    return new Intl.NumberFormat("en-US", { ...options, currency: "USD" });
  }
}

export function formatCurrency(amount: number, currency = "USD"): string {
  if (!VALID_CURRENCY.test(currency)) currency = "USD";
  return safeNumberFormat(currency, { style: "currency" }).format(amount);
}

export function getCurrencySymbol(currency = "USD"): string {
  if (!VALID_CURRENCY.test(currency)) currency = "USD";
  const parts = safeNumberFormat(currency, {
    style: "currency",
    currencyDisplay: "narrowSymbol",
  }).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? currency;
}
