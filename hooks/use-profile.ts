"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import type { Tables } from "@/types/database";

type Profile = Tables<"profiles">;

export function useProfile() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["profile", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile | null> => {
      if (!userId) return null;
      const { data, error } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const updateDisplayCurrency = useMutation({
    mutationFn: async (currency: string) => {
      if (!userId) throw new Error("Not authenticated");
      const { data, error } = await supabaseClient
        .from("profiles")
        .update({ display_currency: currency })
        .eq("id", userId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Profile not found");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile", userId] });
    },
  });

  const updateDefaults = useMutation({
    mutationFn: async ({
      default_account_id,
      default_category_id,
    }: {
      default_account_id: string | null;
      default_category_id: string | null;
    }) => {
      if (!userId) throw new Error("Not authenticated");
      const { data, error } = await supabaseClient
        .from("profiles")
        .update({
          default_account_id,
          default_category_id,
        })
        .eq("id", userId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Profile not found");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile", userId] });
    },
  });

  return { ...query, updateDisplayCurrency, updateDefaults };
}
