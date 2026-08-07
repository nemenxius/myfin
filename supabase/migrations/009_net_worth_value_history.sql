-- supabase/migrations/009_net_worth_value_history.sql

-- 1. WIPE EXISTING 008 TEST DATA (user-confirmed: only test data exists)
TRUNCATE TABLE net_worth_snapshots;
TRUNCATE TABLE net_worth_entries;

-- 2. DROP THE SNAPSHOT MODEL
DROP TRIGGER IF EXISTS net_worth_entries_record_snapshot ON net_worth_entries;
DROP FUNCTION IF EXISTS record_net_worth_snapshot();
DROP TABLE net_worth_snapshots;

-- 3. DROP THE SINGLE-VALUE COLUMN
ALTER TABLE net_worth_entries DROP COLUMN value;

-- 4. VALUE HISTORY TABLE
CREATE TABLE net_worth_entry_values (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID REFERENCES net_worth_entries(id) ON DELETE CASCADE NOT NULL,
  as_of DATE NOT NULL,
  value NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  CONSTRAINT net_worth_entry_values_entry_as_of_key UNIQUE (entry_id, as_of)
);

CREATE INDEX idx_net_worth_entry_values_entry_date ON net_worth_entry_values(entry_id, as_of);

-- 5. RLS
ALTER TABLE net_worth_entry_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own entry values" ON net_worth_entry_values
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM net_worth_entries e
    WHERE e.id = entry_id AND e.user_id = auth.uid()
  )
);

-- 6. updated_at trigger (requires set_updated_at() from 007, already applied remotely)
CREATE TRIGGER net_worth_entry_values_set_updated_at
BEFORE UPDATE ON net_worth_entry_values
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
