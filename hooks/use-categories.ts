import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert } from "@/types/database";

type Category = Tables<"categories">;
type CategoryInsert = TablesInsert<"categories">;
type CategoryInput = Omit<CategoryInsert, "user_id">;

const queryKey = ["categories"] as const;

const fetchCategories = async (): Promise<Category[]> => {
  const { data, error } = await supabaseClient
    .from("categories")
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

export function useCategories() {
  const queryClient = useQueryClient();

  const categoriesQuery = useQuery({
    queryKey,
    queryFn: fetchCategories,
  });

  const createCategory = useMutation({
    mutationFn: async (input: CategoryInput): Promise<Category> => {
      const user_id = await getCurrentUserId();
      const { data, error } = await supabaseClient
        .from("categories")
        .insert({ ...input, user_id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async (newCategory) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<Category[]>(queryKey);
      const user_id = await getCurrentUserId();

      const optimistic: Category = {
        id: `temp-${Date.now()}`,
        user_id,
        name: newCategory.name,
        icon: newCategory.icon,
      };

      queryClient.setQueryData<Category[]>(queryKey, (old) => [
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

  const updateCategory = useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: { id: string } & Partial<CategoryInsert>): Promise<Category> => {
      const { data, error } = await supabaseClient
        .from("categories")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<Category[]>(queryKey);

      queryClient.setQueryData<Category[]>(queryKey, (old) =>
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

  const deleteCategory = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabaseClient
        .from("categories")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<Category[]>(queryKey);

      queryClient.setQueryData<Category[]>(queryKey, (old) =>
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
    createCategory,
    updateCategory,
    deleteCategory,
  };
}
