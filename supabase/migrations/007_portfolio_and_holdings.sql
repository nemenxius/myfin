-- supabase/migrations/007_portfolio_and_holdings.sql

-- 1. PORTFOLIO HOLDINGS
CREATE TABLE portfolio_holdings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT,
  asset_type TEXT CHECK (asset_type IN ('stock', 'etf', 'crypto', 'fund', 'other')) NOT NULL,
  currency TEXT DEFAULT 'USD' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE (user_id, symbol)
);

-- 2. HOLDING TRANSACTIONS
CREATE TABLE holding_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  holding_id UUID REFERENCES portfolio_holdings(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT CHECK (type IN ('buy', 'sell', 'dividend', 'transfer')) NOT NULL,
  shares NUMERIC(18,8) NOT NULL,
  price_per_share NUMERIC(14,4) NOT NULL,
  commission NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
  transacted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ENABLE RLS
ALTER TABLE portfolio_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE holding_transactions ENABLE ROW LEVEL SECURITY;

-- POLICIES
CREATE POLICY "Users can manage own holdings" ON portfolio_holdings
FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own holding transactions" ON holding_transactions
FOR ALL USING (auth.uid() = user_id);

-- holding_id must reference a holding owned by the same user
CREATE POLICY "Holding transactions must reference own holding" ON holding_transactions
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM portfolio_holdings
    WHERE portfolio_holdings.id = holding_id AND portfolio_holdings.user_id = auth.uid()
  )
);

CREATE POLICY "Holding transactions must reference own holding on update" ON holding_transactions
FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
  EXISTS (
    SELECT 1 FROM portfolio_holdings
    WHERE portfolio_holdings.id = holding_id AND portfolio_holdings.user_id = auth.uid()
  )
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER portfolio_holdings_set_updated_at
BEFORE UPDATE ON portfolio_holdings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- INDEXES
CREATE INDEX idx_portfolio_holdings_user_symbol ON portfolio_holdings(user_id, symbol);
CREATE INDEX idx_holding_transactions_holding_id ON holding_transactions(holding_id);
CREATE INDEX idx_holding_transactions_user_id ON holding_transactions(user_id);
