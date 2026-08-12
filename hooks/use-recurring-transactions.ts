import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, format, parse } from "date-fns";
import { supabaseClient } from "@/lib/supabase/client";
import { validateRecurrenceRule } from "@/lib/recurring-transactions/engine";
import type { RecurrenceRule } from "@/lib/recurring-transactions/types";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";

export type RecurringTransaction = Tables<"recurring_transactions">;
export type RecurringTransactionInput = Omit<TablesInsert<"recurring_transactions">, "id" | "user_id" | "created_at" | "updated_at">;
export type RecurringTransactionFields = Omit<TablesUpdate<"recurring_transactions">, "id" | "user_id" | "created_at" | "updated_at">;
export type TransactionFields = Pick<TablesInsert<"transactions">, "account_id" | "to_account_id" | "category_id" | "amount" | "transaction_type" | "description">;

const recurringKey = ["recurring-transactions"] as const;
const transactionKey = ["transactions"] as const;

export function monthsThroughCurrent(startMonth: string, currentMonth = format(new Date(), "yyyy-MM")): string[] {
  const start = parse(startMonth + "-01", "yyyy-MM-dd", new Date());
  const end = parse(currentMonth + "-01", "yyyy-MM-dd", new Date());
  if (start > end) return [];
  const months: string[] = [];
  for (let month = start; month <= end; month = addMonths(month, 1)) months.push(format(month, "yyyy-MM"));
  return months;
}

const currentUserId = async () => {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
};

function validateInput(input: RecurringTransactionInput | RecurringTransactionFields) {
  const rule: RecurrenceRule = {
    startDate: input.start_date ?? "",
    endDate: input.end_date ?? null,
    recurrence: {
      kind: input.recurrence_kind as RecurrenceRule["recurrence"]["kind"],
      unit: (input.recurrence_unit as RecurrenceRule["recurrence"]["unit"]) ?? null,
      interval: input.recurrence_interval ?? null,
    },
  };
  const errors = validateRecurrenceRule(rule);
  if (errors.length) throw new Error(`Invalid recurrence rule: ${errors.join(", ")}`);
}

const invalidate = (client: ReturnType<typeof useQueryClient>) => {
  void client.invalidateQueries({ queryKey: transactionKey });
  void client.invalidateQueries({ queryKey: recurringKey });
};

async function materialize(month: string) {
  const { data, error } = await supabaseClient.rpc("materialize_recurring_transactions", { p_month: month });
  if (error) throw error;
  return data;
}

export function useRecurringTransactions() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: recurringKey,
    queryFn: async (): Promise<RecurringTransaction[]> => {
      const { data, error } = await supabaseClient.from("recurring_transactions").select("*").order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createRecurringTransaction = useMutation({
    mutationFn: async (input: RecurringTransactionInput) => {
      validateInput(input);
      const user_id = await currentUserId();
      const { data, error } = await supabaseClient.from("recurring_transactions").insert({ ...input, user_id }).select().single();
      if (error) throw error;
      for (const month of monthsThroughCurrent(input.start_date.slice(0, 7))) await materialize(month);
      return data;
    },
    onSettled: () => invalidate(queryClient),
  });

  const materializeMonth = useMutation({
    mutationFn: materialize,
    onSettled: () => invalidate(queryClient),
  });

  const editOccurrenceOnly = useMutation({
    mutationFn: async ({ recurringTransactionId, occurrenceDate, transactionId, updates }: { recurringTransactionId: string; occurrenceDate: string; transactionId: string; updates: TransactionFields }) => {
      const { data, error } = await supabaseClient.from("transactions").update(updates).eq("id", transactionId).eq("recurring_transaction_id", recurringTransactionId).select().single();
      if (error) throw error;
      const { error: occurrenceError } = await supabaseClient.from("recurring_transaction_occurrences").update({
        override_account_id: updates.account_id ?? null,
        override_to_account_id: updates.to_account_id ?? null,
        override_category_id: updates.category_id ?? null,
        override_amount: updates.amount ?? null,
        override_transaction_type: updates.transaction_type ?? null,
        override_description: updates.description ?? null,
      }).eq("recurring_transaction_id", recurringTransactionId).eq("occurrence_date", occurrenceDate);
      if (occurrenceError) throw occurrenceError;
      return data;
    },
    onSettled: () => invalidate(queryClient),
  });

  const deleteOccurrenceOnly = useMutation({
    mutationFn: async ({ recurringTransactionId, occurrenceDate, transactionId }: { recurringTransactionId: string; occurrenceDate: string; transactionId: string }) => {
      const { error } = await supabaseClient.from("transactions").delete().eq("id", transactionId).eq("recurring_transaction_id", recurringTransactionId);
      if (error) throw error;
      const { error: occurrenceError } = await supabaseClient.from("recurring_transaction_occurrences").update({ status: "skipped", transaction_id: null }).eq("recurring_transaction_id", recurringTransactionId).eq("occurrence_date", occurrenceDate);
      if (occurrenceError) throw occurrenceError;
    },
    onSettled: () => invalidate(queryClient),
  });

  const editFromOccurrence = useMutation({
    mutationFn: async ({ recurringTransactionId, effectiveDate, updates }: { recurringTransactionId: string; effectiveDate: string; updates: RecurringTransactionFields }) => {
      validateInput({ ...updates, start_date: effectiveDate } as RecurringTransactionInput);
      const { data: rule, error: ruleError } = await supabaseClient.from("recurring_transactions").select("*").eq("id", recurringTransactionId).single();
      if (ruleError) throw ruleError;
      const version = {
        recurring_transaction_id: recurringTransactionId,
        effective_date: effectiveDate,
        account_id: updates.account_id ?? rule.account_id,
        to_account_id: updates.to_account_id ?? rule.to_account_id,
        category_id: updates.category_id ?? rule.category_id,
        amount: updates.amount ?? rule.amount,
        transaction_type: updates.transaction_type ?? rule.transaction_type,
        description: updates.description ?? rule.description,
        recurrence_kind: updates.recurrence_kind ?? rule.recurrence_kind,
        recurrence_unit: updates.recurrence_unit ?? rule.recurrence_unit,
        recurrence_interval: updates.recurrence_interval ?? rule.recurrence_interval,
      };
      const { data, error } = await supabaseClient.from("recurring_transaction_versions").insert(version).select().single();
      if (error) throw error;
      for (const month of monthsThroughCurrent(effectiveDate.slice(0, 7))) await materialize(month);
      return data;
    },
    onSettled: () => invalidate(queryClient),
  });

  const deleteFromOccurrence = useMutation({
    mutationFn: async ({ recurringTransactionId, effectiveDate }: { recurringTransactionId: string; effectiveDate: string }) => {
      const { error } = await supabaseClient.from("recurring_transactions").update({ end_date: format(addMonths(parse(effectiveDate, "yyyy-MM-dd", new Date()), 0), "yyyy-MM-dd") }).eq("id", recurringTransactionId);
      if (error) throw error;
    },
    onSettled: () => invalidate(queryClient),
  });

  const cancelSeries = useMutation({
    mutationFn: async (recurringTransactionId: string) => {
      const { data, error } = await supabaseClient.from("recurring_transactions").update({ is_active: false }).eq("id", recurringTransactionId).select().single();
      if (error) throw error;
      return data;
    },
    onSettled: () => invalidate(queryClient),
  });

  return { ...query, createRecurringTransaction, materializeMonth, editOccurrenceOnly, editFromOccurrence, deleteOccurrenceOnly, deleteFromOccurrence, cancelSeries };
}
