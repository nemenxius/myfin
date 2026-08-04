import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database";

type Category = Tables<"categories">;

const queryKey = ["categories"] as const;

const fetchCategories = async (): Promise<Category[]> => {
  const { data, error } = await supabaseClient
    .from("categories")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
};

export function useCategories() {
  return useQuery({
    queryKey,
    queryFn: fetchCategories,
  });
}