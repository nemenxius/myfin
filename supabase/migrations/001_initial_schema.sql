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
  transaction_type TEXT CHECK (transaction_type IN ('Income', 'Expense', 'Transfer')) NOT NULL,
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
CREATE POLICY "Users can manage own accounts" ON accounts FOR ALL USING (auth.uid() = user_id);

-- Categories: Users can see global categories OR their own custom ones
CREATE POLICY "Users can view all relevant categories" ON categories FOR SELECT
USING (user_id IS NULL OR auth.uid() = user_id);

-- Users can create own custom categories
CREATE POLICY "Users can create own custom categories" ON categories
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Transactions: User can manage their own transactions
CREATE POLICY "Users can manage own transactions" ON transactions FOR ALL USING (auth.uid() = user_id);

-- Transactions: Referenced account must belong to the same user
CREATE POLICY "Transactions must reference own account" ON transactions
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM accounts
    WHERE accounts.id = account_id AND accounts.user_id = auth.uid()
  )
);

-- INDEXES for Performance
CREATE INDEX idx_transactions_user_date ON transactions(user_id, date DESC);
CREATE INDEX idx_accounts_user ON accounts(user_id);