# Transfer Type Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Transfer transaction type fully functional for moving balance between two existing accounts, with proper form UX and correct exclusion from income/expense aggregates.

**Architecture:** Add a `to_account_id` column to the `transactions` table, update the transaction form to show a dual-account selector for transfers, and exclude transfers from income/expense calculations in dashboard stat cards.

**Tech Stack:** Next.js 16, React 19, Supabase Postgres, TanStack Query, Tailwind CSS, Lucide React.

## Global Constraints

- UUID primary keys everywhere (`gen_random_uuid()`)
- User-owned tables reference `profiles(id)`
- Do not call Supabase directly from components; use TanStack Query hooks
- Use generated helpers from `types/database.ts`: `Tables<T>` and `TablesInsert<T>`
- Optimistic UI with `onMutate` snapshot, `onError` rollback, `onSettled` invalidation
- Schema changes go in `supabase/migrations/` as numbered SQL files
- After schema changes, regenerate types with `supabase gen types typescript --project-id <PROJECT_ID> --schema public > types/database.ts`

---

### Task 1: Add `to_account_id` column to transactions

**Files:**
- Create: `supabase/migrations/005_add_to_account_id.sql`
- Modify: `types/database.ts` (or regenerate via Supabase CLI)

**Interfaces:**
- Consumes: None (new column)
- Produces: `transactions.to_account_id` column (nullable UUID, FK to `accounts.id`), updated RLS policy

- [ ] **Step 1: Write migration SQL**

Create `supabase/migrations/005_add_to_account_id.sql`:

```sql
ALTER TABLE transactions
  ADD COLUMN to_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

CREATE POLICY "Transactions must reference own to_account" ON transactions
FOR INSERT WITH CHECK (
  to_account_id IS NULL
  OR EXISTS (
    SELECT 1 FROM accounts
    WHERE accounts.id = to_account_id AND accounts.user_id = auth.uid()
  )
);
```

- [ ] **Step 2: Update types/database.ts manually**

Add `to_account_id: string | null` to `Row`, `Insert`, and `Update` for `transactions`. Add a relationship entry for `transactions_to_account_id_fkey`.

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/005_add_to_account_id.sql types/database.ts
git commit -m "feat: add to_account_id to transactions for transfer type"
```

---

### Task 2: Update transaction form for transfer type

**Files:**
- Modify: `components/transactions/transaction-form.tsx`

**Interfaces:**
- Consumes: `useAccounts()` hook (accounts list), `useCategories()` hook (categories list, hidden for transfers)
- Produces: Form with dual-account selector for Transfer type, hidden category for Transfer type, `to_account_id` in payload

- [ ] **Step 1: Add `toAccountId` state**

Add `const [toAccountId, setToAccountId] = useState("");` after the existing `accountId` state declaration.

- [ ] **Step 2: Reset `toAccountId` in useEffect**

In the `useEffect` that resets form on open/edit, add `setToAccountId("");` to the else branch (new transaction) and set it from `transaction.to_account_id` in the edit branch.

- [ ] **Step 3: Add validation for `toAccountId` when type is Transfer**

In `validate()`, add: if `type === "Transfer"` and `!toAccountId`, set `next.toAccountId = "Please select a destination account."`. Also validate that `toAccountId !== accountId`.

- [ ] **Step 4: Add `toAccountId` to `FormErrors` interface**

Add `toAccountId?: string;` to the `FormErrors` interface.

- [ ] **Step 5: Update `handleSubmit` payload**

Add `to_account_id: type === "Transfer" ? toAccountId : null` to the payload object.

- [ ] **Step 6: Show dual-account selector for Transfer type**

Wrap the existing account selector in a conditional: when `type === "Transfer"`, show two account selectors labeled "From" and "To". The "From" selector uses `accountId` state, the "To" selector uses `toAccountId` state. Filter the "To" options to exclude the selected "From" account. Add error message for `toAccountId` below the "To" selector.

- [ ] **Step 7: Hide category for Transfer type**

Wrap the category selector in a conditional: only render when `type !== "Transfer"`.

- [ ] **Step 8: Run build**

Run: `npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 9: Commit**

```bash
git add components/transactions/transaction-form.tsx
git commit -m "feat: update transaction form for transfer type with dual-account selector"
```

---

### Task 3: Exclude transfers from income/expense in stat cards

**Files:**
- Modify: `components/dashboard/stat-cards.tsx`

**Interfaces:**
- Consumes: `useTransactions()` hook data
- Produces: Income and expense totals that exclude `transaction_type === "Transfer"`

- [ ] **Step 1: Filter transfers from income calculation**

Change the `income` filter from `t.amount > 0` to `t.amount > 0 && t.transaction_type !== "Transfer"`.

- [ ] **Step 2: Filter transfers from expense calculation**

Change the `expense` filter from `t.amount < 0` to `t.amount < 0 && t.transaction_type !== "Transfer"`.

- [ ] **Step 3: Filter transfers from monthIncome/monthExpense**

In the `for` loop that computes `monthIncome` and `monthExpense`, add `t.transaction_type !== "Transfer"` to both the income and expense branches.

- [ ] **Step 4: Run build and tests**

Run: `npm run build && npm test`
Expected: Build succeeds and all 10 tests pass

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/stat-cards.tsx
git commit -m "feat: exclude transfers from income/expense in stat cards"
```

---

### Task 4: Verify spending chart and side panel already handle transfers correctly

**Files:**
- No changes needed (verify only)

**Interfaces:**
- Consumes: `useTransactions()` hook data
- Produces: Verified that transfers are excluded from spending calculations

- [ ] **Step 1: Verify spending-chart.tsx**

Confirm that `transaction.amount >= 0` skip (line 54) already excludes transfers since they are stored as positive amounts. No change needed.

- [ ] **Step 2: Verify side-panel.tsx**

Confirm that `t.amount >= 0` skip (line 33) already excludes transfers. No change needed.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All 10 tests pass

- [ ] **Step 4: Commit (no changes, just verification)**

No commit needed if no changes were made.

---

### Task 5: Run full build and test verification

**Files:**
- No file changes

**Interfaces:**
- Consumes: All modified files from previous tasks
- Produces: Verified build and test results

- [ ] **Step 1: Run production build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run test suite**

Run: `npm test`
Expected: All 10 tests pass

- [ ] **Step 3: Commit verification results**

No code changes needed; this is a verification gate.