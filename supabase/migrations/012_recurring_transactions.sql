-- Recurring transaction templates, effective-dated versions, and idempotent
-- monthly materialization.

CREATE TABLE public.recurring_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  to_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL CHECK (amount <> 0 AND amount <> 'Infinity'::numeric AND amount <> '-Infinity'::numeric),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('Income', 'Expense', 'Transfer')),
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  recurrence_kind TEXT NOT NULL CHECK (recurrence_kind IN ('never', 'interval', 'workday')),
  recurrence_unit TEXT CHECK (recurrence_unit IN ('day', 'week', 'month', 'year')),
  recurrence_interval INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date),
  CHECK (((recurrence_kind = 'interval' AND (
        (recurrence_unit = 'day' AND recurrence_interval IN (1, 2))
        OR (recurrence_unit = 'week' AND recurrence_interval IN (1, 2, 3, 4))
        OR (recurrence_unit = 'month' AND recurrence_interval IN (1, 2, 3, 6))
        OR (recurrence_unit = 'year' AND recurrence_interval = 1)))
      OR (recurrence_kind IN ('never', 'workday') AND recurrence_unit IS NULL AND recurrence_interval IS NULL)) IS TRUE),
  CHECK ((transaction_type = 'Transfer' AND to_account_id IS NOT NULL)
      OR (transaction_type <> 'Transfer' AND to_account_id IS NULL)),
  CHECK (to_account_id IS NULL OR to_account_id <> account_id)
);

CREATE TABLE public.recurring_transaction_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_transaction_id UUID NOT NULL REFERENCES public.recurring_transactions(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  to_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL CHECK (amount <> 0 AND amount <> 'Infinity'::numeric AND amount <> '-Infinity'::numeric),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('Income', 'Expense', 'Transfer')),
  description TEXT,
  recurrence_kind TEXT NOT NULL CHECK (recurrence_kind IN ('never', 'interval', 'workday')),
  recurrence_unit TEXT CHECK (recurrence_unit IN ('day', 'week', 'month', 'year')),
  recurrence_interval INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recurring_transaction_id, effective_date),
  CHECK ((transaction_type = 'Transfer' AND to_account_id IS NOT NULL)
      OR (transaction_type <> 'Transfer' AND to_account_id IS NULL)),
  CHECK (to_account_id IS NULL OR to_account_id <> account_id),
  CHECK (((recurrence_kind = 'interval' AND (
        (recurrence_unit = 'day' AND recurrence_interval IN (1, 2))
        OR (recurrence_unit = 'week' AND recurrence_interval IN (1, 2, 3, 4))
        OR (recurrence_unit = 'month' AND recurrence_interval IN (1, 2, 3, 6))
        OR (recurrence_unit = 'year' AND recurrence_interval = 1)))
      OR (recurrence_kind IN ('never', 'workday') AND recurrence_unit IS NULL AND recurrence_interval IS NULL)) IS TRUE)
);

CREATE TABLE public.recurring_transaction_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_transaction_id UUID NOT NULL REFERENCES public.recurring_transactions(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'skipped', 'materialized')),
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  override_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  override_to_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  override_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  override_amount NUMERIC CHECK (override_amount IS NULL OR (override_amount <> 0 AND override_amount <> 'Infinity'::numeric AND override_amount <> '-Infinity'::numeric)),
  override_transaction_type TEXT CHECK (override_transaction_type IN ('Income', 'Expense', 'Transfer')),
  override_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recurring_transaction_id, occurrence_date),
  CHECK ((override_transaction_type IS NULL)
      OR (override_transaction_type = 'Transfer' AND override_to_account_id IS NOT NULL)
      OR (override_transaction_type IN ('Income', 'Expense') AND override_to_account_id IS NULL)),
  CHECK (override_to_account_id IS NULL OR override_account_id IS NULL OR override_to_account_id <> override_account_id)
);

ALTER TABLE public.transactions
  ADD COLUMN recurring_transaction_id UUID REFERENCES public.recurring_transactions(id) ON DELETE SET NULL;

CREATE INDEX idx_recurring_transactions_user_active ON public.recurring_transactions(user_id, is_active);
CREATE INDEX idx_recurring_transaction_versions_rule_date ON public.recurring_transaction_versions(recurring_transaction_id, effective_date DESC);
CREATE INDEX idx_recurring_transaction_occurrences_rule_date ON public.recurring_transaction_occurrences(recurring_transaction_id, occurrence_date);
CREATE INDEX idx_transactions_recurring ON public.transactions(recurring_transaction_id);

ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_transaction_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_transaction_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recurring transactions" ON public.recurring_transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own recurring transactions" ON public.recurring_transactions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
    AND (to_account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = to_account_id AND a.user_id = auth.uid()))
    AND (category_id IS NULL OR EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND (c.user_id IS NULL OR c.user_id = auth.uid())))
  );
CREATE POLICY "Users can update own recurring transactions" ON public.recurring_transactions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
    AND (to_account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = to_account_id AND a.user_id = auth.uid()))
    AND (category_id IS NULL OR EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND (c.user_id IS NULL OR c.user_id = auth.uid())))
  );
CREATE POLICY "Users can delete own recurring transactions" ON public.recurring_transactions
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own recurring versions" ON public.recurring_transaction_versions
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.recurring_transactions r WHERE r.id = recurring_transaction_id AND r.user_id = auth.uid()));
CREATE POLICY "Users can insert own recurring versions" ON public.recurring_transaction_versions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.recurring_transactions r WHERE r.id = recurring_transaction_id AND r.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
    AND (to_account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = to_account_id AND a.user_id = auth.uid()))
    AND (category_id IS NULL OR EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND (c.user_id IS NULL OR c.user_id = auth.uid())))
  );
CREATE POLICY "Users can update own recurring versions" ON public.recurring_transaction_versions
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.recurring_transactions r WHERE r.id = recurring_transaction_id AND r.user_id = auth.uid()))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.recurring_transactions r WHERE r.id = recurring_transaction_id AND r.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
    AND (to_account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = to_account_id AND a.user_id = auth.uid()))
    AND (category_id IS NULL OR EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND (c.user_id IS NULL OR c.user_id = auth.uid())))
  );
CREATE POLICY "Users can delete own recurring versions" ON public.recurring_transaction_versions
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.recurring_transactions r WHERE r.id = recurring_transaction_id AND r.user_id = auth.uid()));

CREATE POLICY "Users can view own recurring occurrences" ON public.recurring_transaction_occurrences
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.recurring_transactions r WHERE r.id = recurring_transaction_id AND r.user_id = auth.uid()));
CREATE POLICY "Users can insert own recurring occurrences" ON public.recurring_transaction_occurrences
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.recurring_transactions r WHERE r.id = recurring_transaction_id AND r.user_id = auth.uid())
    AND (transaction_id IS NULL OR EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND t.user_id = auth.uid() AND t.recurring_transaction_id = recurring_transaction_id))
    AND (override_account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = override_account_id AND a.user_id = auth.uid()))
    AND (override_to_account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = override_to_account_id AND a.user_id = auth.uid()))
    AND (override_category_id IS NULL OR EXISTS (SELECT 1 FROM public.categories c WHERE c.id = override_category_id AND (c.user_id IS NULL OR c.user_id = auth.uid())))
  );
CREATE POLICY "Users can update own recurring occurrences" ON public.recurring_transaction_occurrences
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.recurring_transactions r WHERE r.id = recurring_transaction_id AND r.user_id = auth.uid()))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.recurring_transactions r WHERE r.id = recurring_transaction_id AND r.user_id = auth.uid())
    AND (transaction_id IS NULL OR EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND t.user_id = auth.uid() AND t.recurring_transaction_id = recurring_transaction_id))
    AND (override_account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = override_account_id AND a.user_id = auth.uid()))
    AND (override_to_account_id IS NULL OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = override_to_account_id AND a.user_id = auth.uid()))
    AND (override_category_id IS NULL OR EXISTS (SELECT 1 FROM public.categories c WHERE c.id = override_category_id AND (c.user_id IS NULL OR c.user_id = auth.uid())))
  );
CREATE POLICY "Users can delete own recurring occurrences" ON public.recurring_transaction_occurrences
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.recurring_transactions r WHERE r.id = recurring_transaction_id AND r.user_id = auth.uid()));

CREATE POLICY "Recurring transaction reference must be own" ON public.transactions
  FOR INSERT WITH CHECK (recurring_transaction_id IS NULL OR EXISTS (SELECT 1 FROM public.recurring_transactions r WHERE r.id = recurring_transaction_id AND r.user_id = auth.uid() AND r.user_id = user_id));
CREATE POLICY "Recurring transaction reference must remain own" ON public.transactions
  FOR UPDATE WITH CHECK (recurring_transaction_id IS NULL OR EXISTS (SELECT 1 FROM public.recurring_transactions r WHERE r.id = recurring_transaction_id AND r.user_id = auth.uid() AND r.user_id = user_id));

CREATE OR REPLACE FUNCTION public.materialize_recurring_transactions(p_month TEXT)
RETURNS SETOF public.transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_month DATE;
  v_month_end DATE;
  v_rule RECORD;
  v_version RECORD;
  v_date DATE;
  v_account_id UUID;
  v_to_account_id UUID;
  v_category_id UUID;
  v_amount NUMERIC;
  v_transaction_type TEXT;
  v_cadence_start DATE;
  v_cadence_kind TEXT;
  v_cadence_unit TEXT;
  v_cadence_interval INTEGER;
  v_occurrence_id UUID;
  v_transaction public.transactions;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Invalid month'; END IF;
  v_month := to_date(p_month || '-01', 'YYYY-MM-DD');
  v_month_end := (v_month + INTERVAL '1 month - 1 day')::date;

  FOR v_rule IN SELECT * FROM public.recurring_transactions WHERE user_id = v_uid AND is_active FOR UPDATE LOOP
    v_date := GREATEST(v_rule.start_date, v_month);
    WHILE v_date <= v_month_end LOOP
      SELECT * INTO v_version FROM public.recurring_transaction_versions
        WHERE recurring_transaction_id = v_rule.id AND effective_date <= v_date
        ORDER BY effective_date DESC LIMIT 1;
      v_cadence_start := COALESCE(v_version.effective_date, v_rule.start_date);
      v_cadence_kind := COALESCE(v_version.recurrence_kind, v_rule.recurrence_kind);
      v_cadence_unit := COALESCE(v_version.recurrence_unit, v_rule.recurrence_unit);
      v_cadence_interval := COALESCE(v_version.recurrence_interval, v_rule.recurrence_interval);
      IF v_date <= COALESCE(v_rule.end_date, v_month_end)
         AND v_date >= v_cadence_start
         AND (v_cadence_kind = 'never' AND v_date = v_cadence_start
           OR v_cadence_kind = 'workday' AND EXTRACT(ISODOW FROM v_date) < 6
           OR v_cadence_kind = 'interval' AND (
             (v_cadence_unit = 'day' AND (v_date - v_cadence_start) % v_cadence_interval = 0)
             OR (v_cadence_unit = 'week' AND (v_date - v_cadence_start) % (v_cadence_interval * 7) = 0)
             OR (v_cadence_unit = 'month' AND
               EXTRACT(DAY FROM v_date) = LEAST(EXTRACT(DAY FROM v_cadence_start), EXTRACT(DAY FROM (date_trunc('month', v_date) + INTERVAL '1 month - 1 day')::date)) AND
                ((EXTRACT(YEAR FROM v_date)::integer * 12 + EXTRACT(MONTH FROM v_date)::integer) - (EXTRACT(YEAR FROM v_cadence_start)::integer * 12 + EXTRACT(MONTH FROM v_cadence_start)::integer)) % v_cadence_interval = 0)
             OR (v_cadence_unit = 'year' AND
               EXTRACT(MONTH FROM v_date) = EXTRACT(MONTH FROM v_cadence_start) AND
               EXTRACT(DAY FROM v_date) = LEAST(EXTRACT(DAY FROM v_cadence_start), EXTRACT(DAY FROM (date_trunc('month', v_date) + INTERVAL '1 month - 1 day')::date)) AND
               (EXTRACT(YEAR FROM v_date)::integer - EXTRACT(YEAR FROM v_cadence_start)::integer) % v_cadence_interval = 0)
           )) THEN
        v_occurrence_id := NULL;
        INSERT INTO public.recurring_transaction_occurrences (recurring_transaction_id, occurrence_date)
        VALUES (v_rule.id, v_date) ON CONFLICT (recurring_transaction_id, occurrence_date) DO NOTHING;
        SELECT o.id INTO v_occurrence_id
        FROM public.recurring_transaction_occurrences o
        WHERE o.recurring_transaction_id = v_rule.id
          AND o.occurrence_date = v_date
          AND o.status = 'pending'
        FOR UPDATE;
        IF v_occurrence_id IS NOT NULL THEN
          SELECT COALESCE(o.override_account_id, v_version.account_id, v_rule.account_id),
            COALESCE(o.override_to_account_id, v_version.to_account_id, v_rule.to_account_id),
            COALESCE(o.override_category_id, v_version.category_id, v_rule.category_id),
            COALESCE(o.override_amount, v_version.amount, v_rule.amount),
            COALESCE(o.override_transaction_type, v_version.transaction_type, v_rule.transaction_type)
          INTO v_account_id, v_to_account_id, v_category_id, v_amount, v_transaction_type
          FROM public.recurring_transaction_occurrences o WHERE o.id = v_occurrence_id;
          -- SECURITY DEFINER must re-check resolved account/category ownership.
          IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_account_id AND user_id = v_uid)
             OR (v_to_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_to_account_id AND user_id = v_uid))
             OR (v_category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories WHERE id = v_category_id AND (user_id IS NULL OR user_id = v_uid)))
             OR NOT EXISTS (SELECT 1 FROM public.recurring_transactions WHERE id = v_rule.id AND user_id = v_uid)
             OR v_amount = 0 OR v_amount IN ('Infinity'::numeric, '-Infinity'::numeric)
             OR (v_to_account_id IS NOT NULL AND v_to_account_id = v_account_id)
             OR (v_transaction_type = 'Transfer' AND v_to_account_id IS NULL)
             OR (v_transaction_type IN ('Income', 'Expense') AND v_to_account_id IS NOT NULL) THEN
            RAISE EXCEPTION 'Invalid resolved account/category ownership or values';
          END IF;
          IF EXISTS (SELECT 1 FROM public.recurring_transaction_occurrences o
            WHERE o.id = v_occurrence_id AND o.transaction_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM public.transactions t
                WHERE t.id = o.transaction_id AND t.user_id = v_uid AND t.recurring_transaction_id = v_rule.id)) THEN
            RAISE EXCEPTION 'Invalid occurrence transaction reference';
          END IF;
          INSERT INTO public.transactions (user_id, account_id, to_account_id, category_id, amount, transaction_type, date, description, recurring_transaction_id)
          SELECT v_uid,
            v_account_id,
            v_to_account_id,
            v_category_id,
            v_amount,
            v_transaction_type,
            v_date::timestamptz,
            COALESCE(o.override_description, v_version.description, v_rule.description), v_rule.id
          FROM public.recurring_transaction_occurrences o WHERE o.id = v_occurrence_id
          RETURNING * INTO v_transaction;
          UPDATE public.recurring_transaction_occurrences
            SET transaction_id = v_transaction.id, status = 'materialized'
            WHERE id = v_occurrence_id AND (transaction_id IS NULL OR transaction_id = v_transaction.id);
          IF NOT FOUND THEN RAISE EXCEPTION 'Occurrence transaction reference changed'; END IF;
          RETURN NEXT v_transaction;
        END IF;
      END IF;
      v_date := v_date + 1;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.materialize_recurring_transactions(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materialize_recurring_transactions(TEXT) TO authenticated;
