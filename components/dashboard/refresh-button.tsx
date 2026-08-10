"use client";

import { RefreshCw } from "lucide-react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Query keys this button is allowed to refetch. The Overview page renders the
 * transactions/accounts/categories/portfolio/net-worth datasets, so refreshing
 * exactly these keys keeps the charts in sync without triggering market-data
 * refetches (["portfolio","quote",...], ["portfolio","history",...]) that hit
 * Yahoo rate limits.
 */
const REFRESH_QUERY_KEYS = [
  ["transactions"],
  ["accounts"],
  ["categories"],
  ["portfolio", "data"],
  ["net-worth"],
] as const;

export function RefreshButton() {
  const queryClient = useQueryClient();

  // Disabled while any of the targeted queries are fetching (initial load or
  // background refetch) to prevent double-click refetch storms.
  //
  // Must be a SINGLE unconditional useIsFetching() call: chaining multiple
  // useIsFetching() calls with `||` would short-circuit, so the hook count
  // would vary between renders (React Rules of Hooks violation). The predicate
  // matches element-wise against REFRESH_QUERY_KEYS, which is the single
  // source of truth for the five targeted keys.
  const isFetching =
    useIsFetching({
      predicate: (query) =>
        REFRESH_QUERY_KEYS.some((key) =>
          key.every((part, index) => query.queryKey[index] === part),
        ),
    }) > 0;

  const handleRefresh = () => {
    for (const queryKey of REFRESH_QUERY_KEYS) {
      queryClient.invalidateQueries({ queryKey });
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={handleRefresh}
      disabled={isFetching}
      aria-label="Refresh dashboard data"
      title="Refresh dashboard data"
    >
      <RefreshCw
        className={cn("h-4 w-4", isFetching && "animate-spin")}
        aria-hidden
      />
    </Button>
  );
}
