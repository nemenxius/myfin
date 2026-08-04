# Phase 1: Expense Tracker MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a functional, mobile-responsive personal finance tracker focusing on account-based transactions and visual insights.

**Architecture:** Next.js App Router with Server Components for data fetching, TanStack Query for client-side state/optimistic updates, and Supabase (PostgreSQL + Auth) as the backend via RLS.

**Tech Stack:** Next.js, TypeScript, Tailwind CSS, Shadcn UI, Lucide Icons, Recharts, TanStack Query, Supabase.

## Global Constraints

- Database: PostgreSQL (Supabase)
- Authentication: Supabase Auth
- Styling: Tailwind CSS + Shadcn UI
- Data Fetching: Server Components + TanStack Query (client)

---

### Task 1: Project Scaffolding & Infrastructure

**Files:**
- Create: `package.json`
- Create: `tailwind.config.ts`
- Create: `next.config.mjs`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `.env.local`

**Interfaces:**
- Produces: A running Next.js development server with Tailwind and Lucide configured.

- [ ] **Step 1: Initialize Next.js project with dependencies**

```bash
# Note: Using npm as standard for this environment
npm init -y
npm install next react react-dom lucide-react @tanstack/react-query date-fns recharts clsx tailwind-merge
npm install -D typescript @types/node @types/react @types/react-dom tailwindcss postcss autoprefixer
```

- [ ] **Step 2: Configure Tailwind and Shadcn basics

- [ ] **Step 2: Configure Tailwind and Shadcn basics**

```typescript
// tailwind.config.ts (Simplified for task)
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 3: Setup environment variables**

Create `.env.local`:
```text
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

- [ ] **Step 4: Verify setup**

Run `npm run dev` and ensure no errors in console.

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "chore: initial project scaffolding"
```

---

### Task 2: Database Schema & Supabase Setup

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`
- Modify: `app/api/supabase/route.ts` (or similar config)

**Interfaces:**
- Consumes: User credentials for Auth.
- Produces: A populated PostgreSQL schema in Supable with RLS enabled.

- [ ] **Step 1: Create the SQL Migration script**

```sql
-- supabase/migrations/001_initial_schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. ACCOUNTS
CREATE TABLE accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT CHECK (account_type IN ('checking', 'savings', 'cash', 'brokerage')) NOT NULL,
  currency TEXT DEFAULT 'USD' NOT NULL,
  initial_balance NUMERIC NOT NULL DEFAULT 0
);

-- 3. CATEGORIES
CREATE TABLE categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- Nullable for Global Categories
  name TEXT NOT NULL,
  icon TEXT NOT NULL -- Lucide icon name slug
);

-- 4. TRANSACTIONS
CREATE TABLE transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL, -- Positive for income, negative for expense
  transaction_type TEXT CHECK (transaction_type IN ('income', 'expense', 'transfer')) NOT NULL,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  description TEXT
);

-- ENABLE RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- POLICIES

-- Profiles: User can only see their own profile
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);

-- Accounts: User can manage their own accounts
CREATE POLICY "Users can manageOwn accounts" ON accounts FOR ALL USING (auth.uid() = user_id);

-- Categories: Users can see global categories OR their own custom ones
CREATE POLICY "Users can view all relevant categories" ON categories FOR SELECT 
USING (user_id IS NULL OR auth.uid() = user_id);

-- Users can create own custom categories
CREATE POLICY "Users can create own custom categories" ON categories 
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Transactions: User can manage their own transactions
CREATE POLICY "Users can manage own transactions" ON transactions FOR ALL USING (auth.uid() = user_id);

-- INDEXES for Performance
CREATE INDEX idx_transactions_user_date ON transactions(user_id, date DESC);
CREATE INDEX idx_accounts_user ON accounts(user_id);
```

- [ ] **Step 2: Seed Global Categories**

```sql
INSERT INTO categories (name, icon) VALUES 
('Food', 'Utensils'),
('Rent', 'Home'),
('Utilities', 'Zap'),
('Salary', 'Banknote'),
('Investment Income', 'TrendingUp');
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/001_initial_schema.sql
git commit -m "feat: initial database schema and RLS policies"
```

---

### Task 3: Supabase Client & Auth Integration

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/login/page.tsx` (Redirect handler)

**Interfaces:**
- Produces: Authenticated user session and Supabase client instances for both client and server environments.

- [ ] **Step 1: Implement Client-side Supabase helper**

```typescript
// lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js'

export const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

- [ ] **Step 2: Implement Server-side Supabase helper** (Using @supabase/ssr if available, otherwise standard client with cookie handling)

- [ ] **Step 3: Build Login Page Component**

Create a simple form using Shadcn UI `Button` and `Input` that calls `supabase.auth.signInWithPassword`.

- [ ] **Step 4: Commit**

```bash
git add lib/ app/(auth)/
git commit -m "feat: supabase client setup and auth logic"
```

---

### Task 4: Core Data Hooks (TanStack Query)

**Files:**
- Create: `hooks/use-transactions.ts`
- Create: `hooks/use-accounts.ts`
- Create: `types/database.ts` (Generated types from Supabase)

**Interfaces:**
- Consumes: Supabase client.
- Produces: React hooks that return `{ data, isLoading, error }` and mutation functions for CRUD operations.

- [ ] **Step 1: Generate TypeScript Types from Database Schema**

(Using `supabase gen types typescript...`)

- [ ] **Step 2: Implement useAccounts Hook**

```typescript
// Example pattern
export function useAccounts() {
  const queryClient = useQueryClient();
  const fetchAccounts = async () => { /* supabase call */ };
  
  return useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts });
}
```

- [ ] **Step 3: Implement useTransactions Hook** (Includes logic for optimistic updates on add/delete)

- [ ] **Step 4: Commit**

```bash
git add hooks/ types/
git commit -m "feat: data fetching hooks with TanStack Query"
```

---

### Task 5: Dashboard & UI Implementation

**Files:**
- Create: `components/dashboard/balance-overview.tsx`
- Create: `components/dashboard/spending-chart.tsx`
- Create: `app/dashboard/page.tsx`
- Create: `components/transactions/transaction-list.tsx`

**Interfaces:**
- Consumes: Data from `useAccounts` and `useTransactions`.
- Produces: The final visual dashboard.

- [ ] **Step 1: Build BalanceOverview Component** (3 cards: Total, Income, Expense)

- [ ] **Step 2: Build SpendingChart Component** (Area Chart using Recharts)

- [ ] **Step 3: Build TransactionList Component** (A clean table/list view)

- [ ] **Step 4: Assemble Dashboard Page**

```typescript
// app/dashboard/page.tsx
export default function Dashboard() {
  return (
    <main className="p-6 space-y-8">
      <BalanceOverview />
      <SpendingChart />
      <TransactionList />
    </main>
  );
}
```

- [ ] **Step 5: Final Polish & Commit**

```bash
git add components/ app/dashboard/
git commit -m "feat: implement dashboard UI and charts"
```

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-03-expense-tracker-mvp.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
