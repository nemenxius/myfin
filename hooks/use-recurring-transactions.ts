import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, format, parse } from "date-fns";
import { supabaseClient } from "@/lib/supabase/client";
import { validateRecurrenceRule } from "@/lib/recurring-transactions/engine";
import type { RecurrenceRule } from "@/lib/recurring-transactions/types";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";

export type RecurringTransaction = Tables<"recurring_transactions">;
export type RecurringTransactionInput = Omit<TablesInsert<"recurring_transactions">, "id" | "user_id" | "created_at" | "updated_at">;
export type RecurringTransactionFields = Omit<TablesUpdate<"recurring_transactions">, "id" | "user_id" | "created_at" | "updated_at">;
export type TransactionFields = Partial<Pick<TablesInsert<"transactions">, "account_id" | "to_account_id" | "category_id" | "amount" | "transaction_type" | "description">>;

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

const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const mergeFields = <T extends Record<string, unknown>>(base: T, changes: Partial<T>) =>
  Object.fromEntries(Object.keys(base).map((key) => [key, has(changes, key) ? changes[key as keyof T] : base[key]])) as T;

const occurrenceOverrides = (updates: TransactionFields) => Object.fromEntries(
  Object.entries(updates).map(([key, value]) => [`override_${key}`, value])
);

function validateTransactionFields(fields: { transaction_type?: string | null; to_account_id?: string | null }) {
  if (fields.transaction_type === "Transfer" && !fields.to_account_id) throw new Error("Transfer transactions require a destination account");
  if (fields.transaction_type !== "Transfer" && fields.to_account_id != null) throw new Error("Only transfer transactions may have a destination account");
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
      const { data, error } = await supabaseClient.rpc("create_and_materialize_recurring_transaction", {
        p_rule: { ...input, user_id },
        p_through_month: format(new Date(), "yyyy-MM"),
      });
      if (error) throw error;
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
      const { data: existing, error: existingError } = await supabaseClient.from("transactions").select("*").eq("id", transactionId).eq("recurring_transaction_id", recurringTransactionId).single();
      if (existingError) throw existingError;
      const resolved = mergeFields(existing, updates as Partial<typeof existing>);
      validateTransactionFields(resolved);
      const { data, error } = await supabaseClient.from("transactions").update(updates).eq("id", transactionId).eq("recurring_transaction_id", recurringTransactionId).select().single();
      if (error) throw error;
      const { error: occurrenceError } = await supabaseClient.from("recurring_transaction_occurrences").update({
        ...occurrenceOverrides(updates),
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
      const { data: rule, error: ruleError } = await supabaseClient.from("recurring_transactions").select("*").eq("id", recurringTransactionId).single();
      if (ruleError) throw ruleError;
      const version = mergeFields({
        account_id: rule.account_id, to_account_id: rule.to_account_id, category_id: rule.category_id,
        amount: rule.amount, transaction_type: rule.transaction_type, description: rule.description,
        recurrence_kind: rule.recurrence_kind, recurrence_unit: rule.recurrence_unit, recurrence_interval: rule.recurrence_interval,
      }, updates as Partial<typeof rule>);
      validateTransactionFields(version);
      validateInput({ ...version, start_date: effectiveDate, end_date: rule.end_date } as RecurringTransactionInput);
      const versionInsert = {
        recurring_transaction_id: recurringTransactionId,
        effective_date: effectiveDate,
        ...version,
      };
      const { data, error } = await supabaseClient.from("recurring_transaction_versions").insert(versionInsert).select().single();
      if (error) throw error;
      for (const month of monthsThroughCurrent(effectiveDate.slice(0, 7))) await materialize(month);
      return data;
    },
    onSettled: () => invalidate(queryClient),
  });

  const deleteFromOccurrence = useMutation({
    mutationFn: async ({ recurringTransactionId, effectiveDate }: { recurringTransactionId: string; effectiveDate: string }) => {
      const { error } = await supabaseClient.rpc("delete_recurring_from_occurrence", { p_recurring_transaction_id: recurringTransactionId, p_effective_date: effectiveDate });
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
