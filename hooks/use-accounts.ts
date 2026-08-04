import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert } from "@/types/database";

type Account = Tables<"accounts">;
type AccountInsert = TablesInsert<"accounts">;
type AccountInput = Omit<AccountInsert, "user_id">;

const queryKey = ["accounts"] as const;

const fetchAccounts = async (): Promise<Account[]> => {
  const { data, error } = await supabaseClient
    .from("accounts")
    .select("*")
    .order("name", { ascending: true });

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

export function useAccounts() {
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey,
    queryFn: fetchAccounts,
  });

  const createAccount = useMutation({
    mutationFn: async (input: AccountInput): Promise<Account> => {
      const user_id = await getCurrentUserId();
      const { data, error } = await supabaseClient
        .from("accounts")
        .insert({ ...input, user_id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async (newAccount) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<Account[]>(queryKey);
      const user_id = await getCurrentUserId();

      const optimistic: Account = {
        id: `temp-${Date.now()}`,
        user_id,
        name: newAccount.name,
        account_type: newAccount.account_type,
        currency: newAccount.currency ?? "USD",
        initial_balance: newAccount.initial_balance ?? 0,
      };

      queryClient.setQueryData<Account[]>(queryKey, (old) => [
        ...(old ?? []),
        optimistic,
      ]);

      return { previous };
    },
    onError: (_error, _newAccount, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const updateAccount = useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: { id: string } & Partial<AccountInsert>): Promise<Account> => {
      const { data, error } = await supabaseClient
        .from("accounts")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<Account[]>(queryKey);

      queryClient.setQueryData<Account[]>(queryKey, (old) =>
        (old ?? []).map((account) =>
          account.id === id ? { ...account, ...updates } : account
        )
      );

      return { previous };
    },
    onError: (_error, _updates, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteAccount = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabaseClient
        .from("accounts")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<Account[]>(queryKey);

      queryClient.setQueryData<Account[]>(queryKey, (old) =>
        (old ?? []).filter((account) => account.id !== id)
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
    ...accountsQuery,
    createAccount,
    updateAccount,
    deleteAccount,
  };
}
