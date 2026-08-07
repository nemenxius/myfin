"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase/client";
import { usePrimaryCurrency } from "./use-primary-currency";
import {
  buildNetWorthSeries,
  computeTotals,
  monthDelta,
} from "@/lib/net-worth/math";
import type { Tables } from "@/types/database";

type NetWorthEntry = Tables<"net_worth_entries">;
type NetWorthValue = Tables<"net_worth_entry_values">;

export type EntryType = "asset" | "liability";

export type EntryWithValues = NetWorthEntry & { values: NetWorthValue[] };

export type EntryInput = {
  entry_type: EntryType;
  name: string;
  description?: string | null;
  category_id?: string | null;
  initialValue: number;
  initialAsOf?: string;
};

export type ValueInput = {
  as_of: string;
  value: number;
};

const netWorthKey = ["net-worth"] as const;
const entriesKey = ["net-worth", "entries"] as const;
const valuesKey = ["net-worth", "values"] as const;

let tempIdCounter = 0;
const tempId = (): string => `temp-${++tempIdCounter}-${Date.now()}`;

const fetchEntries = async (): Promise<NetWorthEntry[]> => {
  const { data, error } = await supabaseClient
    .from("net_worth_entries")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
};

const fetchValues = async (): Promise<NetWorthValue[]> => {
  const { data, error } = await supabaseClient
    .from("net_worth_entry_values")
    .select("*")
    .order("as_of", { ascending: true });

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

const todayString = (): string => new Date().toISOString().slice(0, 10);

export function useNetWorth() {
  const queryClient = useQueryClient();
  const { currency } = usePrimaryCurrency();

  const entriesQuery = useQuery({
    queryKey: entriesKey,
    queryFn: fetchEntries,
  });

  const valuesQuery = useQuery({
    queryKey: valuesKey,
    queryFn: fetchValues,
  });

  const rawEntries = entriesQuery.data ?? [];
  const rawValues = valuesQuery.data ?? [];

  const entries = useMemo<EntryWithValues[]>(() => {
    const byEntry = new Map<string, NetWorthValue[]>();
    for (const v of rawValues) {
      const list = byEntry.get(v.entry_id) ?? [];
      list.push(v);
      byEntry.set(v.entry_id, list);
    }
    return rawEntries.map((entry) => ({
      ...entry,
      values: (byEntry.get(entry.id) ?? []).sort((a, b) =>
        a.as_of.localeCompare(b.as_of)
      ),
    }));
  }, [rawEntries, rawValues]);

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
  const netWorthSeries = useMemo(() => buildNetWorthSeries(entries), [entries]);
  const delta = useMemo(() => monthDelta(entries), [entries]);

  const createEntry = useMutation({
    mutationFn: async (input: EntryInput): Promise<NetWorthEntry> => {
      const user_id = await getCurrentUserId();
      const { data, error } = await supabaseClient
        .from("net_worth_entries")
        .insert({
          entry_type: input.entry_type,
          name: input.name,
          description: input.description ?? null,
          category_id: input.category_id ?? null,
          currency: currency || "USD",
          user_id,
        })
        .select()
        .single();

      if (error) throw error;

      const { error: valueError } = await supabaseClient
        .from("net_worth_entry_values")
        .insert({
          entry_id: data.id,
          as_of: input.initialAsOf ?? todayString(),
          value: Math.max(0, input.initialValue),
        });

      if (valueError) {
        await supabaseClient.from("net_worth_entries").delete().eq("id", data.id);
        throw valueError;
      }
      return data;
    },
    onMutate: async (newEntry) => {
      await queryClient.cancelQueries({ queryKey: netWorthKey });

      const previousEntries =
        queryClient.getQueryData<NetWorthEntry[]>(entriesKey);
      const previousValues =
        queryClient.getQueryData<NetWorthValue[]>(valuesKey);
      const user_id = await getCurrentUserId();
      const now = new Date().toISOString();
      const entryTempId = tempId();

      const optimisticEntry: NetWorthEntry = {
        id: entryTempId,
        user_id,
        entry_type: newEntry.entry_type,
        name: newEntry.name,
        description: newEntry.description ?? null,
        category_id: newEntry.category_id ?? null,
        currency: currency || "USD",
        created_at: now,
        updated_at: now,
      };

      const optimisticValue: NetWorthValue = {
        id: tempId(),
        entry_id: entryTempId,
        as_of: newEntry.initialAsOf ?? todayString(),
        value: Math.max(0, newEntry.initialValue),
        created_at: now,
        updated_at: now,
      };

      queryClient.setQueryData<NetWorthEntry[]>(entriesKey, (old) => [
        ...(old ?? []),
        optimisticEntry,
      ]);
      queryClient.setQueryData<NetWorthValue[]>(valuesKey, (old) => [
        ...(old ?? []),
        optimisticValue,
      ]);

      return { previousEntries, previousValues };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousEntries) {
        queryClient.setQueryData(entriesKey, context.previousEntries);
      }
      if (context?.previousValues) {
        queryClient.setQueryData(valuesKey, context.previousValues);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: netWorthKey }),
  });

  const updateEntry = useMutation({
    mutationFn: async ({
      id,
      ...rest
    }: {
      id: string;
      name?: string;
      description?: string | null;
      category_id?: string | null;
    }): Promise<NetWorthEntry> => {
      const { data, error } = await supabaseClient
        .from("net_worth_entries")
        .update({
          ...(rest.name !== undefined ? { name: rest.name } : {}),
          ...(rest.description !== undefined
            ? { description: rest.description ?? null }
            : {}),
          ...(rest.category_id !== undefined
            ? { category_id: rest.category_id ?? null }
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
            ...(rest.name !== undefined ? { name: rest.name } : {}),
            ...(rest.description !== undefined
              ? { description: rest.description ?? null }
              : {}),
            ...(rest.category_id !== undefined
              ? { category_id: rest.category_id ?? null }
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

      const previousEntries =
        queryClient.getQueryData<NetWorthEntry[]>(entriesKey);
      const previousValues =
        queryClient.getQueryData<NetWorthValue[]>(valuesKey);

      queryClient.setQueryData<NetWorthEntry[]>(entriesKey, (old) =>
        (old ?? []).filter((entry) => entry.id !== id)
      );
      queryClient.setQueryData<NetWorthValue[]>(valuesKey, (old) =>
        (old ?? []).filter((v) => v.entry_id !== id)
      );

      return { previousEntries, previousValues };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousEntries) {
        queryClient.setQueryData(entriesKey, context.previousEntries);
      }
      if (context?.previousValues) {
        queryClient.setQueryData(valuesKey, context.previousValues);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: netWorthKey }),
  });

  const addValue = useMutation({
    mutationFn: async ({
      entryId,
      ...input
    }: { entryId: string } & ValueInput): Promise<NetWorthValue> => {
      const { data, error } = await supabaseClient
        .from("net_worth_entry_values")
        .insert({
          entry_id: entryId,
          as_of: input.as_of,
          value: Math.max(0, input.value),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ entryId, ...input }) => {
      await queryClient.cancelQueries({ queryKey: netWorthKey });

      const previous = queryClient.getQueryData<NetWorthValue[]>(valuesKey);
      const now = new Date().toISOString();

      const optimistic: NetWorthValue = {
        id: tempId(),
        entry_id: entryId,
        as_of: input.as_of,
        value: Math.max(0, input.value),
        created_at: now,
        updated_at: now,
      };

      queryClient.setQueryData<NetWorthValue[]>(valuesKey, (old) => [
        ...(old ?? []),
        optimistic,
      ]);

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(valuesKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: netWorthKey }),
  });

  const updateValue = useMutation({
    mutationFn: async ({
      id,
      ...input
    }: { id: string } & ValueInput): Promise<NetWorthValue> => {
      const { data, error } = await supabaseClient
        .from("net_worth_entry_values")
        .update({
          as_of: input.as_of,
          value: Math.max(0, input.value),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, ...input }) => {
      await queryClient.cancelQueries({ queryKey: netWorthKey });

      const previous = queryClient.getQueryData<NetWorthValue[]>(valuesKey);

      queryClient.setQueryData<NetWorthValue[]>(valuesKey, (old) =>
        (old ?? []).map((v) =>
          v.id === id
            ? { ...v, as_of: input.as_of, value: Math.max(0, input.value) }
            : v
        )
      );

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(valuesKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: netWorthKey }),
  });

  const deleteValue = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabaseClient
        .from("net_worth_entry_values")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: netWorthKey });

      const previous = queryClient.getQueryData<NetWorthValue[]>(valuesKey);

      queryClient.setQueryData<NetWorthValue[]>(valuesKey, (old) =>
        (old ?? []).filter((v) => v.id !== id)
      );

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(valuesKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: netWorthKey }),
  });

  const isLoading = entriesQuery.isLoading || valuesQuery.isLoading;
  const error = entriesQuery.error ?? valuesQuery.error;

  return {
    ...entriesQuery,
    entries,
    assets,
    liabilities,
    totals,
    netWorth,
    netWorthSeries,
    monthDelta: delta,
    createEntry,
    updateEntry,
    deleteEntry,
    addValue,
    updateValue,
    deleteValue,
    isLoading,
    error,
  };
}
