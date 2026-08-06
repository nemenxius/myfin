"use client";

import { useMemo } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert } from "@/types/database";
import {
  combineValueSeries,
  computeHoldingCalculations,
  type CalcTransaction,
  type ValuePoint,
} from "@/lib/portfolio/math";
import type { MarketHistoryPoint, MarketQuote } from "@/lib/market-data/types";

type Holding = Tables<"portfolio_holdings">;
type HoldingInsert = TablesInsert<"portfolio_holdings">;
type HoldingTransaction = Tables<"holding_transactions">;
type HoldingTransactionInsert = TablesInsert<"holding_transactions">;

export interface HoldingWithCalculations extends Holding {
  transactions: HoldingTransaction[];
  holdingHistory: MarketHistoryPoint[];
  totalShares: number;
  avgPrice: number;
  costBasis: number;
  currentValue: number;
  totalChange: number;
  totalChangePercent: number | null;
  dailyChange: number;
  dailyChangePercent: number | null;
  quote: MarketQuote | null;
}

export interface PortfolioTotals {
  totalValue: number;
  totalCostBasis: number;
  totalChange: number;
  totalChangePercent: number | null;
  dailyChange: number;
  dailyChangePercent: number | null;
}

interface PortfolioData {
  holdings: Holding[];
  transactions: HoldingTransaction[];
}

const dataKey = ["portfolio", "data"] as const;

const fetchPortfolioData = async (): Promise<PortfolioData> => {
  const [holdingsRes, transactionsRes] = await Promise.all([
    supabaseClient
      .from("portfolio_holdings")
      .select("*")
      .order("symbol", { ascending: true }),
    supabaseClient
      .from("holding_transactions")
      .select("*")
      .order("transacted_at", { ascending: false }),
  ]);
  if (holdingsRes.error) throw holdingsRes.error;
  if (transactionsRes.error) throw transactionsRes.error;
  return { holdings: holdingsRes.data, transactions: transactionsRes.data };
};

const getCurrentUserId = async (): Promise<string> => {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
};

async function fetchQuote(symbol: string): Promise<MarketQuote | null> {
  const res = await fetch(
    `/api/market-data?symbol=${encodeURIComponent(symbol)}&action=quote`
  );
  if (!res.ok) return null;
  return (await res.json()) as MarketQuote;
}

async function fetchHistory(
  symbol: string,
  range: string
): Promise<MarketHistoryPoint[]> {
  const res = await fetch(
    `/api/market-data?symbol=${encodeURIComponent(symbol)}&action=history&range=${range}`
  );
  if (!res.ok) return [];
  return (await res.json()) as MarketHistoryPoint[];
}

function toCalcTransactions(
  transactions: HoldingTransaction[]
): CalcTransaction[] {
  return transactions.map((t) => ({
    type: t.type,
    shares: t.shares,
    pricePerShare: t.price_per_share,
    commission: t.commission,
  }));
}

export function useHoldings() {
  const queryClient = useQueryClient();
  const dataQuery = useQuery({ queryKey: dataKey, queryFn: fetchPortfolioData });

  const symbols = useMemo(
    () => Array.from(new Set((dataQuery.data?.holdings ?? []).map((h) => h.symbol))),
    [dataQuery.data?.holdings]
  );

  const quotes = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["portfolio", "quote", symbol],
      queryFn: () => fetchQuote(symbol),
      enabled: symbols.length > 0,
      staleTime: 60_000,
      retry: 1,
    })),
  });

  const histories = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["portfolio", "history", symbol],
      queryFn: () => fetchHistory(symbol, "1y"),
      enabled: symbols.length > 0,
      staleTime: 300_000,
      retry: 1,
    })),
  });

  const quoteBySymbol = useMemo(() => {
    const map = new Map<string, MarketQuote | null>();
    symbols.forEach((symbol, i) => map.set(symbol, quotes[i]?.data ?? null));
    return map;
  }, [symbols, quotes]);

  const historyBySymbol = useMemo(() => {
    const map = new Map<string, MarketHistoryPoint[]>();
    symbols.forEach((symbol, i) => map.set(symbol, histories[i]?.data ?? []));
    return map;
  }, [symbols, histories]);

  const holdings = useMemo<HoldingWithCalculations[]>(() => {
    const data = dataQuery.data;
    if (!data) return [];
    return data.holdings.map((holding) => {
      const transactions = data.transactions.filter(
        (t) => t.holding_id === holding.id
      );
      const quote = quoteBySymbol.get(holding.symbol) ?? null;
      const calc = computeHoldingCalculations(
        toCalcTransactions(transactions),
        quote?.currentPrice ?? null,
        quote?.previousClose ?? null
      );
      return {
        ...holding,
        transactions,
        ...calc,
        quote,
        holdingHistory: historyBySymbol.get(holding.symbol) ?? [],
      };
    });
  }, [dataQuery.data, quoteBySymbol, historyBySymbol]);

  const totals = useMemo<PortfolioTotals>(() => {
    const totalValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
    const totalCostBasis = holdings.reduce((sum, h) => sum + h.costBasis, 0);
    const dailyChange = holdings.reduce((sum, h) => sum + h.dailyChange, 0);
    const totalChange = totalValue - totalCostBasis;
    return {
      totalValue,
      totalCostBasis,
      totalChange,
      totalChangePercent:
        totalCostBasis !== 0 ? (totalChange / totalCostBasis) * 100 : null,
      dailyChange,
      dailyChangePercent:
        totalValue !== 0 ? (dailyChange / totalValue) * 100 : null,
    };
  }, [holdings]);

  const valueSeries = useMemo<ValuePoint[]>(() => {
    const sharesBySymbol: Record<string, number> = {};
    for (const h of holdings) sharesBySymbol[h.symbol] = h.totalShares;
    return combineValueSeries(
      holdings.map((h) => ({
        symbol: h.symbol,
        points: historyBySymbol.get(h.symbol) ?? [],
      })),
      sharesBySymbol
    );
  }, [holdings, historyBySymbol]);

  const createHoldingWithTransaction = useMutation({
    mutationFn: async ({
      holding,
      transaction,
    }: {
      holding: Omit<HoldingInsert, "user_id">;
      transaction: Omit<HoldingTransactionInsert, "user_id" | "holding_id">;
    }): Promise<Holding> => {
      const user_id = await getCurrentUserId();
      const { data: existing } = await supabaseClient
        .from("portfolio_holdings")
        .select("*")
        .eq("user_id", user_id)
        .eq("symbol", holding.symbol)
        .maybeSingle();
      const target =
        existing ??
        (
          await supabaseClient
            .from("portfolio_holdings")
            .insert({ ...holding, user_id })
            .select()
            .single()
        ).data;
      if (!target) throw new Error("Failed to create holding");
      const { error } = await supabaseClient
        .from("holding_transactions")
        .insert({ ...transaction, holding_id: target.id, user_id });
      if (error) throw error;
      return target;
    },
    onMutate: async ({ holding, transaction }) => {
      await queryClient.cancelQueries({ queryKey: dataKey });
      const previous = queryClient.getQueryData<PortfolioData>(dataKey);
      const user_id = await getCurrentUserId();
      const now = new Date().toISOString();
      const temp: Holding = {
        id: `temp-${Date.now()}`,
        user_id,
        symbol: holding.symbol,
        name: holding.name ?? null,
        asset_type: holding.asset_type,
        currency: holding.currency ?? "USD",
        created_at: now,
        updated_at: now,
      };
      const tempTx: HoldingTransaction = {
        id: `temp-tx-${Date.now()}`,
        holding_id: temp.id,
        user_id,
        type: transaction.type,
        shares: transaction.shares,
        price_per_share: transaction.price_per_share,
        commission: transaction.commission ?? 0,
        transacted_at: transaction.transacted_at ?? now,
        notes: transaction.notes ?? null,
        created_at: now,
      };
      queryClient.setQueryData<PortfolioData>(dataKey, (old) => ({
        holdings: [temp, ...(old?.holdings ?? [])],
        transactions: [tempTx, ...(old?.transactions ?? [])],
      }));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(dataKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dataKey }),
  });

  const addHoldingTransaction = useMutation({
    mutationFn: async ({
      holdingId,
      transaction,
    }: {
      holdingId: string;
      transaction: Omit<HoldingTransactionInsert, "user_id" | "holding_id">;
    }): Promise<void> => {
      const user_id = await getCurrentUserId();
      const { error } = await supabaseClient
        .from("holding_transactions")
        .insert({ ...transaction, holding_id: holdingId, user_id });
      if (error) throw error;
    },
    onMutate: async ({ holdingId, transaction }) => {
      await queryClient.cancelQueries({ queryKey: dataKey });
      const previous = queryClient.getQueryData<PortfolioData>(dataKey);
      const user_id = await getCurrentUserId();
      const now = new Date().toISOString();
      const tempTx: HoldingTransaction = {
        id: `temp-tx-${Date.now()}`,
        holding_id: holdingId,
        user_id,
        type: transaction.type,
        shares: transaction.shares,
        price_per_share: transaction.price_per_share,
        commission: transaction.commission ?? 0,
        transacted_at: transaction.transacted_at ?? now,
        notes: transaction.notes ?? null,
        created_at: now,
      };
      queryClient.setQueryData<PortfolioData>(dataKey, (old) => ({
        holdings: old?.holdings ?? [],
        transactions: [tempTx, ...(old?.transactions ?? [])],
      }));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(dataKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dataKey }),
  });

  const updateHoldingTransaction = useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: { id: string } & Partial<HoldingTransactionInsert>): Promise<void> => {
      const { error } = await supabaseClient
        .from("holding_transactions")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: dataKey });
      const previous = queryClient.getQueryData<PortfolioData>(dataKey);
      queryClient.setQueryData<PortfolioData>(dataKey, (old) => ({
        holdings: old?.holdings ?? [],
        transactions: (old?.transactions ?? []).map((t) =>
          t.id === id ? { ...t, ...updates } : t
        ),
      }));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(dataKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dataKey }),
  });

  const deleteHoldingTransaction = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabaseClient
        .from("holding_transactions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: dataKey });
      const previous = queryClient.getQueryData<PortfolioData>(dataKey);
      queryClient.setQueryData<PortfolioData>(dataKey, (old) => ({
        holdings: old?.holdings ?? [],
        transactions: (old?.transactions ?? []).filter((t) => t.id !== id),
      }));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(dataKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dataKey }),
  });

  const deleteHolding = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabaseClient
        .from("portfolio_holdings")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: dataKey });
      const previous = queryClient.getQueryData<PortfolioData>(dataKey);
      queryClient.setQueryData<PortfolioData>(dataKey, (old) => {
        const holdings = old?.holdings ?? [];
        const transactions = old?.transactions ?? [];
        return {
          holdings: holdings.filter((h) => h.id !== id),
          transactions: transactions.filter((t) => t.holding_id !== id),
        };
      });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(dataKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dataKey }),
  });

  return {
    ...dataQuery,
    holdings,
    totals,
    valueSeries,
    historyBySymbol,
    createHoldingWithTransaction,
    addHoldingTransaction,
    updateHoldingTransaction,
    deleteHoldingTransaction,
    deleteHolding,
  };
}

export function useHolding(id?: string) {
  const { holdings, ...rest } = useHoldings();
  const holding = holdings.find((h) => h.id === id) ?? null;
  return { holding, ...rest };
}
