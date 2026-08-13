import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, format, parse } from "date-fns";
import { supabaseClient } from "@/lib/supabase/client";
import { validateRecurrenceRule } from "@/lib/recurring-transactions/engine";
import type { RecurrenceRule } from "@/lib/recurring-transactions/types";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";

export type RecurringTransaction = Tables<"recurring_transactions">;
export type RecurringTransactionInput = Omit<TablesInsert<"recurring_transactions">, "id" | "user_id" | "created_at" | "updated_at">;
export type RecurringTransactionFields = Omit<TablesUpdate<"recurring_transactions">, "id" | "user_id" | "created_at" | "updated_at">;
export type RecurringVersion = Tables<"recurring_transaction_versions">;
export type TransactionFields = Partial<Pick<TablesInsert<"transactions">, "account_id" | "to_account_id" | "category_id" | "amount" | "transaction_type" | "description">>;

export type RecurringTemplateFields = Pick<
  RecurringTransaction,
  "account_id" | "to_account_id" | "category_id" | "amount" | "transaction_type" | "description" |
  "recurrence_kind" | "recurrence_unit" | "recurrence_interval"
>;

const recurringKey = ["recurring-transactions"] as const;
const versionsKey = ["recurring-versions"] as const;
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

/**
 * Build the merge base for a "this and future"/series edit from the version
 * effective on the edited occurrence date, falling back to the base rule when
 * no version exists yet. Sourcing the base from the effective version (rather
 * than always the rule) keeps cadence/omitted fields from stacking edits
 * reverted by the rule's original values.
 */
export function mergeOverEffectiveVersion(
  rule: RecurringTransaction,
  effectiveVersion: RecurringVersion | null,
  updates: Partial<RecurringTemplateFields>
): RecurringTemplateFields {
  const source = effectiveVersion ?? rule;
  const base: RecurringTemplateFields = {
    account_id: source.account_id,
    to_account_id: source.to_account_id,
    category_id: source.category_id,
    amount: source.amount,
    transaction_type: source.transaction_type,
    description: source.description,
    recurrence_kind: source.recurrence_kind,
    recurrence_unit: source.recurrence_unit,
    recurrence_interval: source.recurrence_interval,
  };
  return mergeFields(base, updates);
}

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
  void client.invalidateQueries({ queryKey: versionsKey });
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

  const versionsQuery = useQuery({
    queryKey: versionsKey,
    queryFn: async (): Promise<RecurringVersion[]> => {
      const { data, error } = await supabaseClient.from("recurring_transaction_versions").select("*").order("effective_date", { ascending: true });
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
      const { data: effectiveVersion, error: versionError } = await supabaseClient
        .from("recurring_transaction_versions")
        .select("*")
        .eq("recurring_transaction_id", recurringTransactionId)
        .lte("effective_date", effectiveDate)
        .order("effective_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (versionError) throw versionError;
      const merged = mergeOverEffectiveVersion(rule, effectiveVersion, updates);
      validateTransactionFields(merged);
      validateInput({ ...merged, start_date: effectiveDate, end_date: rule.end_date } as RecurringTransactionInput);
      const { data, error } = await supabaseClient.rpc("apply_recurring_edit_from_occurrence", {
        p_recurring_transaction_id: recurringTransactionId,
        p_effective_date: effectiveDate,
        p_version: merged,
      });
      if (error) throw error;
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

  return { ...query, versions: versionsQuery.data, createRecurringTransaction, materializeMonth, editOccurrenceOnly, editFromOccurrence, deleteOccurrenceOnly, deleteFromOccurrence, cancelSeries };
}
