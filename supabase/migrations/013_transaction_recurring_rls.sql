-- Replace the permissive transaction write policies from migrations 001, 005,
-- and 012. PostgreSQL combines permissive policies with OR, so the old FOR ALL
-- policy could bypass the recurring-rule ownership check.

DROP POLICY IF EXISTS "Users can manage own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Transactions must reference own account" ON public.transactions;
DROP POLICY IF EXISTS "Transactions must reference own to_account" ON public.transactions;
DROP POLICY IF EXISTS "Recurring transaction reference must be own" ON public.transactions;
DROP POLICY IF EXISTS "Recurring transaction reference must remain own" ON public.transactions;
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can delete own transactions" ON public.transactions;

CREATE POLICY "Users can view own transactions" ON public.transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions" ON public.transactions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = account_id AND a.user_id = auth.uid()
    )
    AND (
      to_account_id IS NULL OR EXISTS (
        SELECT 1 FROM public.accounts a
        WHERE a.id = to_account_id AND a.user_id = auth.uid()
      )
    )
    AND (
      category_id IS NULL OR EXISTS (
        SELECT 1 FROM public.categories c
        WHERE c.id = category_id AND (c.user_id IS NULL OR c.user_id = auth.uid())
      )
    )
    AND (
      recurring_transaction_id IS NULL OR EXISTS (
        SELECT 1 FROM public.recurring_transactions r
        WHERE r.id = recurring_transaction_id
          AND r.user_id = auth.uid()
          AND r.user_id = user_id
      )
    )
  );

CREATE POLICY "Users can update own transactions" ON public.transactions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = account_id AND a.user_id = auth.uid()
    )
    AND (
      to_account_id IS NULL OR EXISTS (
        SELECT 1 FROM public.accounts a
        WHERE a.id = to_account_id AND a.user_id = auth.uid()
      )
    )
    AND (
      category_id IS NULL OR EXISTS (
        SELECT 1 FROM public.categories c
        WHERE c.id = category_id AND (c.user_id IS NULL OR c.user_id = auth.uid())
      )
    )
    AND (
      recurring_transaction_id IS NULL OR EXISTS (
        SELECT 1 FROM public.recurring_transactions r
        WHERE r.id = recurring_transaction_id
          AND r.user_id = auth.uid()
          AND r.user_id = user_id
      )
    )
  );

CREATE POLICY "Users can delete own transactions" ON public.transactions
  FOR DELETE USING (auth.uid() = user_id);
