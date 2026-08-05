"use client";

import { useAccounts } from "./use-accounts";
import { useProfile } from "./use-profile";

export function usePrimaryCurrency() {
  const profileQuery = useProfile();
  const {
    data: accounts,
    isLoading: accountsLoading,
    isError: accountsError,
  } = useAccounts();

  const currency =
    profileQuery.data?.display_currency ?? accounts?.[0]?.currency ?? "USD";

  return {
    currency,
    isLoading: profileQuery.isLoading || accountsLoading,
    isError: profileQuery.isError || accountsError,
  };
}
