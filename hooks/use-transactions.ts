import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert } from "@/types/database";

type Transaction = Tables<"transactions">;
type TransactionInsert = TablesInsert<"transactions">;
type TransactionInput = Omit<TransactionInsert, "user_id">;
type MutableTransactionFields = Pick<TransactionInsert, "account_id" | "to_account_id" | "category_id" | "amount" | "transaction_type" | "date" | "description">;
const mutableTransactionKeys: (keyof MutableTransactionFields)[] = ["account_id", "to_account_id", "category_id", "amount", "transaction_type", "date", "description"];

const baseQueryKey = ["transactions"] as const;

const fetchTransactions = async (): Promise<Transaction[]> => {
  const { data, error } = await supabaseClient
    .from("transactions")
    .select("*")
    .order("date", { ascending: false });

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

export function useTransactions(month?: string) {
  const queryClient = useQueryClient();
  const queryKey = month ? (["transactions", month] as const) : baseQueryKey;

  const transactionsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (month) {
        const { error } = await supabaseClient.rpc("materialize_recurring_transactions", { p_month: month });
        if (error) throw error;
      }
      return fetchTransactions();
    },
  });

  const addTransaction = useMutation({
    mutationFn: async (input: TransactionInput): Promise<Transaction> => {
      const user_id = await getCurrentUserId();
      const { data, error } = await supabaseClient
        .from("transactions")
        .insert({ ...input, user_id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async (newTransaction) => {
      await queryClient.cancelQueries({ queryKey: baseQueryKey });

      const previous = queryClient.getQueriesData<Transaction[]>({ queryKey: baseQueryKey });
      const user_id = await getCurrentUserId();

      const optimistic: Transaction = {
        id: `temp-${Date.now()}`,
        user_id,
        account_id: newTransaction.account_id,
        category_id: newTransaction.category_id ?? null,
        to_account_id: newTransaction.to_account_id ?? null,
        amount: newTransaction.amount,
        transaction_type: newTransaction.transaction_type,
        date: newTransaction.date ?? new Date().toISOString(),
        description: newTransaction.description ?? null,
        recurring_transaction_id: null,
      };

      queryClient.setQueriesData<Transaction[]>({ queryKey: baseQueryKey }, (old) => [
        optimistic,
        ...(old ?? []),
      ]);

      return { previous };
    },
    onError: (_error, _newTransaction, context) => {
      context?.previous?.forEach(([key, value]) => queryClient.setQueryData(key, value));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: baseQueryKey }),
  });

  const updateTransaction = useMutation({
    mutationFn: async ({
      id,
      ...updates
      }: { id: string } & Partial<MutableTransactionFields>): Promise<Transaction> => {
      const safeUpdates = Object.fromEntries(mutableTransactionKeys.filter((key) => key in updates).map((key) => [key, updates[key]]));
      const { data, error } = await supabaseClient
        .from("transactions")
        .update(safeUpdates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: baseQueryKey });
      const safeUpdates = Object.fromEntries(mutableTransactionKeys.filter((key) => key in updates).map((key) => [key, updates[key]]));

      const previous = queryClient.getQueriesData<Transaction[]>({ queryKey: baseQueryKey });

      queryClient.setQueriesData<Transaction[]>({ queryKey: baseQueryKey }, (old) =>
        (old ?? []).map((transaction) =>
          transaction.id === id ? { ...transaction, ...safeUpdates } : transaction
        )
      );

      return { previous };
    },
    onError: (_error, _updates, context) => {
      context?.previous?.forEach(([key, value]) => queryClient.setQueryData(key, value));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: baseQueryKey }),
  });

  const deleteTransaction = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabaseClient
        .from("transactions")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: baseQueryKey });

      const previous = queryClient.getQueriesData<Transaction[]>({ queryKey: baseQueryKey });

      queryClient.setQueriesData<Transaction[]>({ queryKey: baseQueryKey }, (old) =>
        (old ?? []).filter((transaction) => transaction.id !== id)
      );

      return { previous };
    },
    onError: (_error, _id, context) => {
      context?.previous?.forEach(([key, value]) => queryClient.setQueryData(key, value));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: baseQueryKey }),
  });

  return {
    ...transactionsQuery,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  };
}
