Phase 1: Expense Tracker MVP Implementation Plan
Goal: Build a functional, mobile-responsive personal finance tracker focusing on account-based transactions and visual insights.

Architecture: Next.js App Router with Server Components for data fetching, TanStack Query for client-side state/optimistic updates, and Supabase (PostgreSQL + Auth) as the backend via RLS.

Tech Stack: Next.js, TypeScript, Tailwind CSS, Shadcn UI, Lucide Icons, Recharts, TanStack Query, @supabase/supabase-js, @supabase/ssr.

Global Constraints
Database: PostgreSQL (Supabase)

Authentication: Supabase Auth via @supabase/ssr

Styling: Tailwind CSS + Shadcn UI

Data Fetching: Server Components + TanStack Query (client)

Environment Variables: Modern Supabase key conventions (sb_publishable_... and sb_secret_...)

Task 1: Project Scaffolding & Infrastructure
Files:

Create: package.json

Create: tailwind.config.ts

Create: next.config.mjs

Create: app/layout.tsx

Create: app/page.tsx

Create: .env.local

Interfaces:

Produces: A running Next.js development server with Tailwind, Lucide, and Supabase SSR dependencies configured.

[ ] Step 1: Initialize Next.js project with dependencies

Bash
npm init -y
npm install next react react-dom lucide-react @tanstack/react-query date-fns recharts clsx tailwind-merge @supabase/supabase-js @supabase/ssr
npm install -D typescript @types/node @types/react @types/react-dom tailwindcss postcss autoprefixer
[ ] Step 2: Configure Tailwind

TypeScript
// tailwind.config.ts
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
}
[ ] Step 3: Setup environment variables (Modern Supabase Standards)

Create .env.local:

Plaintext
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
SUPABASE_SECRET_KEY=sb_secret_your_key_here
[ ] Step 4: Verify setup

Run npm run dev and ensure no errors in console.

[ ] Step 5: Commit

Bash
git add . && git commit -m "chore: initial project scaffolding with modern Supabase keys"
Task 2: Database Schema & Supabase Setup
Files:

Create: supabase/migrations/001_initial_schema.sql

Interfaces:

Consumes: User credentials for Auth.

Produces: A populated PostgreSQL schema in Supabase with RLS enabled and proper write access.

[ ] Step 1: Create the SQL Migration script

SQL
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

-- Profiles
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);

-- Accounts
CREATE POLICY "Users can manage own accounts" ON accounts FOR ALL USING (auth.uid() = user_id);

-- Categories (Read global or own; Insert own)
CREATE POLICY "Users can view all relevant categories" ON categories FOR SELECT 
USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "Users can create own custom categories" ON categories 
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Transactions
CREATE POLICY "Users can manage own transactions" ON transactions FOR ALL USING (auth.uid() = user_id);

-- INDEXES for Performance
CREATE INDEX idx_transactions_user_date ON transactions(user_id, date DESC);
CREATE INDEX idx_accounts_user ON accounts(user_id);
[ ] Step 2: Seed Global Categories

SQL
INSERT INTO categories (name, icon) VALUES 
('Food', 'Utensils'),
('Rent', 'Home'),
('Utilities', 'Zap'),
('Salary', 'Banknote'),
('Investment Income', 'TrendingUp');
[ ] Step 3: Commit

Bash
git add supabase/migrations/001_initial_schema.sql
git commit -m "feat: initial database schema and RLS policies"
Task 3: Supabase Client & Auth Integration
Files:

Create: lib/supabase/client.ts

Create: lib/supabase/server.ts

Create: app/(auth)/login/page.tsx

Interfaces:

Produces: Authenticated user session and Supabase SSR instances for client and server environments.

[ ] Step 1: Implement Client-side Supabase helper

TypeScript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
[ ] Step 2: Implement Server-side Supabase helper

TypeScript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const createClient = () => {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component read-only guard
          }
        },
      },
    }
  )
}
[ ] Step 3: Build Login Page Component

Build authentication form handling supabase.auth.signInWithPassword and signUp.

[ ] Step 4: Commit

Bash
git add lib/ app/(auth)/
git commit -m "feat: supabase SSR client setup and auth integration"
Task 4: Core Data Hooks (TanStack Query)
Files:

Create: hooks/use-transactions.ts

Create: hooks/use-accounts.ts

Create: types/database.ts

Interfaces:

Consumes: Supabase SSR client.

Produces: React hooks returning { data, isLoading, error } and optimistic update handlers.

[ ] Step 1: Generate TypeScript Types from Supabase

[ ] Step 2: Implement useAccounts Hook

[ ] Step 3: Implement useTransactions Hook (with optimistic updates)

[ ] Step 4: Commit

Bash
git add hooks/ types/
git commit -m "feat: data fetching hooks with TanStack Query"
Task 5: Dashboard & UI Implementation
Files:

Create: components/dashboard/balance-overview.tsx

Create: components/dashboard/spending-chart.tsx

Create: components/transactions/transaction-list.tsx

Create: app/dashboard/page.tsx

Interfaces:

Consumes: Data from useAccounts and useTransactions.

Produces: Full MVP interactive UI dashboard.

[ ] Step 1: Build BalanceOverview Component (Total Liquidity, Income, Expense)

[ ] Step 2: Build SpendingChart Component (Recharts Area Chart)

[ ] Step 3: Build TransactionList Component (Filterable/Sortable ledger table)

[ ] Step 4: Assemble Dashboard Page

[ ] Step 5: Commit & Final Push

Bash
git add components/ app/dashboard/
git commit -m "feat: complete MVP dashboard UI"