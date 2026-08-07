-- supabase/migrations/008_net_worth.sql

-- 1. NET WORTH ENTRIES (assets and liabilities share one table, discriminated by entry_type)
CREATE TABLE net_worth_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  entry_type TEXT CHECK (entry_type IN ('asset', 'liability')) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  value NUMERIC NOT NULL,
  currency TEXT DEFAULT 'USD' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 2. NET WORTH SNAPSHOTS
CREATE TABLE net_worth_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  total_assets NUMERIC NOT NULL,
  total_liabilities NUMERIC NOT NULL,
  net_worth NUMERIC NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ENABLE RLS
ALTER TABLE net_worth_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE net_worth_snapshots ENABLE ROW LEVEL SECURITY;

-- POLICIES
CREATE POLICY "Users can manage own net worth entries" ON net_worth_entries
FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own net worth snapshots" ON net_worth_snapshots
FOR ALL USING (auth.uid() = user_id);

-- INDEXES
CREATE INDEX idx_net_worth_entries_user_type ON net_worth_entries(user_id, entry_type);
CREATE INDEX idx_net_worth_snapshots_user_date ON net_worth_snapshots(user_id, recorded_at);

-- 3. SNAPSHOT TRIGGER
-- Records a snapshot when an entry write changes the user's net worth.
CREATE OR REPLACE FUNCTION record_net_worth_snapshot()
RETURNS TRIGGER AS $$
DECLARE
  target_user UUID;
  asset_total NUMERIC;
  liability_total NUMERIC;
  current_net NUMERIC;
BEGIN
  target_user := COALESCE(NEW.user_id, OLD.user_id);

  SELECT COALESCE(SUM(value), 0) INTO asset_total
  FROM net_worth_entries
  WHERE user_id = target_user AND entry_type = 'asset';

  SELECT COALESCE(SUM(value), 0) INTO liability_total
  FROM net_worth_entries
  WHERE user_id = target_user AND entry_type = 'liability';

  current_net := asset_total - liability_total;

  -- Skip when net worth is unchanged from the latest snapshot (dedupe).
  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT net_worth
      FROM net_worth_snapshots
      WHERE user_id = target_user
      ORDER BY recorded_at DESC, id DESC
      LIMIT 1
    ) latest
    WHERE latest.net_worth = current_net
  ) THEN
    INSERT INTO net_worth_snapshots (user_id, total_assets, total_liabilities, net_worth)
    VALUES (target_user, asset_total, liability_total, current_net);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION record_net_worth_snapshot() SET search_path = public;

CREATE TRIGGER net_worth_entries_record_snapshot
AFTER INSERT OR UPDATE OR DELETE ON net_worth_entries
FOR EACH ROW EXECUTE FUNCTION record_net_worth_snapshot();
