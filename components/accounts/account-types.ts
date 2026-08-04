export const ACCOUNT_TYPES = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "cash", label: "Cash" },
  { value: "brokerage", label: "Investment / Brokerage" },
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number]["value"];

export const ACCOUNT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ACCOUNT_TYPES.map((type) => [type.value, type.label])
);