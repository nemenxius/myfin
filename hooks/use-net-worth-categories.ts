import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert } from "@/types/database";

type NetWorthCategory = Tables<"net_worth_categories">;
type NetWorthCategoryInsert = TablesInsert<"net_worth_categories">;
type NetWorthCategoryInput = Omit<NetWorthCategoryInsert, "user_id">;

const queryKey = ["net-worth-categories"] as const;

const fetchNetWorthCategories = async (): Promise<NetWorthCategory[]> => {
  const { data, error } = await supabaseClient
    .from("net_worth_categories")
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

export function useNetWorthCategories() {
  const queryClient = useQueryClient();

  const categoriesQuery = useQuery({
    queryKey,
    queryFn: fetchNetWorthCategories,
  });

  const createNetWorthCategory = useMutation({
    mutationFn: async (input: NetWorthCategoryInput): Promise<NetWorthCategory> => {
      const user_id = await getCurrentUserId();
      const { data, error } = await supabaseClient
        .from("net_worth_categories")
        .insert({ ...input, user_id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async (newCategory) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<NetWorthCategory[]>(queryKey);
      const user_id = await getCurrentUserId();
      const now = new Date().toISOString();

      const optimistic: NetWorthCategory = {
        id: `temp-${Date.now()}`,
        user_id,
        name: newCategory.name,
        icon: newCategory.icon,
        created_at: now,
        updated_at: now,
      };

      queryClient.setQueryData<NetWorthCategory[]>(queryKey, (old) => [
        ...(old ?? []),
        optimistic,
      ]);

      return { previous };
    },
    onError: (_error, _newCategory, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const updateNetWorthCategory = useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: { id: string } & Partial<NetWorthCategoryInsert>): Promise<NetWorthCategory> => {
      const { data, error } = await supabaseClient
        .from("net_worth_categories")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<NetWorthCategory[]>(queryKey);

      queryClient.setQueryData<NetWorthCategory[]>(queryKey, (old) =>
        (old ?? []).map((category) =>
          category.id === id ? { ...category, ...updates } : category
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

  const deleteNetWorthCategory = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabaseClient
        .from("net_worth_categories")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<NetWorthCategory[]>(queryKey);

      queryClient.setQueryData<NetWorthCategory[]>(queryKey, (old) =>
        (old ?? []).filter((category) => category.id !== id)
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
    ...categoriesQuery,
    createNetWorthCategory,
    updateNetWorthCategory,
    deleteNetWorthCategory,
  };
}
