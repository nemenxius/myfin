const KEY = "pendingDisplayCurrency";

export function getPendingDisplayCurrency(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setPendingDisplayCurrency(value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, value);
}

export function clearPendingDisplayCurrency() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
