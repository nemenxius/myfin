import { useAccounts } from "./use-accounts";

export function usePrimaryCurrency() {
  const { data: accounts, isLoading, isError } = useAccounts();

  const currency = accounts && accounts.length > 0 ? accounts[0].currency : "USD";

  return { currency, isLoading, isError };
}
