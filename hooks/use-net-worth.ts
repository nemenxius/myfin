"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase/client";
import { usePrimaryCurrency } from "./use-primary-currency";
import {
  buildNetWorthSeries,
  computeTotals,
  monthDelta,
  sortSnapshotsChronologically,
} from "@/lib/net-worth/math";
import type { Tables, TablesInsert } from "@/types/database";

type NetWorthEntry = Tables<"net_worth_entries">;
type NetWorthSnapshot = Tables<"net_worth_snapshots">;
type NetWorthEntryInsert = TablesInsert<"net_worth_entries">;

export type EntryType = "asset" | "liability";

export type EntryInput = {
  entry_type: EntryType;
  name: string;
  description?: string | null;
  value: number;
};

const netWorthKey = ["net-worth"] as const;
const entriesKey = ["net-worth", "entries"] as const;
const snapshotsKey = ["net-worth", "snapshots"] as const;

const fetchEntries = async (): Promise<NetWorthEntry[]> => {
  const { data, error } = await supabaseClient
    .from("net_worth_entries")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
};

const fetchSnapshots = async (): Promise<NetWorthSnapshot[]> => {
  const { data, error } = await supabaseClient
    .from("net_worth_snapshots")
    .select("*")
    .order("recorded_at", { ascending: true });

  if (error) throw error;
  return data;
};

const getCurrentUserId = async (): Promise<string> => {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
};

export function useNetWorth() {
  const queryClient = useQueryClient();
  const { currency } = usePrimaryCurrency();

  const entriesQuery = useQuery({
    queryKey: entriesKey,
    queryFn: fetchEntries,
  });

  const snapshotsQuery = useQuery({
    queryKey: snapshotsKey,
    queryFn: fetchSnapshots,
  });

  const entries = entriesQuery.data ?? [];

  const snapshots = useMemo(
    () => sortSnapshotsChronologically(snapshotsQuery.data ?? []),
    [snapshotsQuery.data]
  );

  const assets = useMemo(
    () => entries.filter((entry) => entry.entry_type === "asset"),
    [entries]
  );

  const liabilities = useMemo(
    () => entries.filter((entry) => entry.entry_type === "liability"),
    [entries]
  );

  const totals = useMemo(() => computeTotals(entries), [entries]);
  const netWorth = totals.totalAssets - totals.totalLiabilities;
  const netWorthSeries = useMemo(() => buildNetWorthSeries(snapshots), [snapshots]);
  const delta = useMemo(() => monthDelta(netWorth, snapshots), [netWorth, snapshots]);

  const createEntry = useMutation({
    mutationFn: async (input: EntryInput): Promise<NetWorthEntry> => {
      const user_id = await getCurrentUserId();
      const { data, error } = await supabaseClient
        .from("net_worth_entries")
        .insert({
          entry_type: input.entry_type,
          name: input.name,
          description: input.description ?? null,
          value: Math.max(0, input.value),
          currency: currency || "USD",
          user_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async (newEntry) => {
      await queryClient.cancelQueries({ queryKey: netWorthKey });

      const previous = queryClient.getQueryData<NetWorthEntry[]>(entriesKey);
      const user_id = await getCurrentUserId();
      const now = new Date().toISOString();

      const optimistic: NetWorthEntry = {
        id: `temp-${Date.now()}`,
        user_id,
        entry_type: newEntry.entry_type,
        name: newEntry.name,
        description: newEntry.description ?? null,
        value: Math.max(0, newEntry.value),
        currency: currency || "USD",
        created_at: now,
        updated_at: now,
      };

      queryClient.setQueryData<NetWorthEntry[]>(entriesKey, (old) => [
        ...(old ?? []),
        optimistic,
      ]);

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(entriesKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: netWorthKey }),
  });

  const updateEntry = useMutation({
    mutationFn: async ({
      id,
      ...rest
    }: { id: string } & Partial<EntryInput>): Promise<NetWorthEntry> => {
      const { data, error } = await supabaseClient
        .from("net_worth_entries")
        .update({
          ...rest,
          ...(rest.value !== undefined
            ? { value: Math.max(0, rest.value) }
            : {}),
          ...(rest.description !== undefined
            ? { description: rest.description ?? null }
            : {}),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, ...rest }) => {
      await queryClient.cancelQueries({ queryKey: netWorthKey });

      const previous = queryClient.getQueryData<NetWorthEntry[]>(entriesKey);

      queryClient.setQueryData<NetWorthEntry[]>(entriesKey, (old) =>
        (old ?? []).map((entry) => {
          if (entry.id !== id) return entry;
          return {
            ...entry,
            ...rest,
            ...(rest.value !== undefined
              ? { value: Math.max(0, rest.value) }
              : {}),
            ...(rest.description !== undefined
              ? { description: rest.description ?? null }
              : {}),
          };
        })
      );

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(entriesKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: netWorthKey }),
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabaseClient
        .from("net_worth_entries")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: netWorthKey });

      const previous = queryClient.getQueryData<NetWorthEntry[]>(entriesKey);

      queryClient.setQueryData<NetWorthEntry[]>(entriesKey, (old) =>
        (old ?? []).filter((entry) => entry.id !== id)
      );

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(entriesKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: netWorthKey }),
  });

  return {
    ...entriesQuery,
    entries,
    assets,
    liabilities,
    snapshots,
    totals,
    netWorth,
    netWorthSeries,
    monthDelta: delta,
    createEntry,
    updateEntry,
    deleteEntry,
  };
}
