import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert } from "@/types/database";

type Transaction = Tables<"transactions">;
type TransactionInsert = TablesInsert<"transactions">;

const queryKey = ["transactions"] as const;

const fetchTransactions = async (): Promise<Transaction[]> => {
  const { data, error } = await supabaseClient
    .from("transactions")
    .select("*")
    .order("date", { ascending: false });

  if (error) throw error;
  return data;
};

export function useTransactions() {
  const queryClient = useQueryClient();

  const transactionsQuery = useQuery({
    queryKey,
    queryFn: fetchTransactions,
  });

  const addTransaction = useMutation({
    mutationFn: async (input: TransactionInsert): Promise<Transaction> => {
      const { data, error } = await supabaseClient
        .from("transactions")
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async (newTransaction) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<Transaction[]>(queryKey);

      const optimistic: Transaction = {
        id: `temp-${Date.now()}`,
        user_id: newTransaction.user_id,
        account_id: newTransaction.account_id,
        category_id: newTransaction.category_id ?? null,
        amount: newTransaction.amount,
        transaction_type: newTransaction.transaction_type,
        date: newTransaction.date ?? new Date().toISOString(),
        description: newTransaction.description ?? null,
      };

      queryClient.setQueryData<Transaction[]>(queryKey, (old) => [
        optimistic,
        ...(old ?? []),
      ]);

      return { previous };
    },
    onError: (_error, _newTransaction, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
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
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<Transaction[]>(queryKey);

      queryClient.setQueryData<Transaction[]>(queryKey, (old) =>
        (old ?? []).filter((transaction) => transaction.id !== id)
      );

      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    ...transactionsQuery,
    addTransaction,
    deleteTransaction,
  };
}