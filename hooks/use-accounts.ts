import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase/client";
import type { Account, AccountInsert } from "@/types/database";

const queryKey = ["accounts"] as const;

const fetchAccounts = async (): Promise<Account[]> => {
  const { data, error } = await supabaseClient
    .from("accounts")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
};

export function useAccounts() {
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey,
    queryFn: fetchAccounts,
  });

  const addAccount = useMutation({
    mutationFn: async (input: AccountInsert): Promise<Account> => {
      const { data, error } = await supabaseClient
        .from("accounts")
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteAccount = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabaseClient
        .from("accounts")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    ...accountsQuery,
    addAccount,
    deleteAccount,
  };
}