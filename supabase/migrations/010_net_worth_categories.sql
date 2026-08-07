-- supabase/migrations/010_net_worth_categories.sql
-- Requires 009 (net_worth_entry_values) to be applied first.

-- 1. NET WORTH CATEGORIES
CREATE TABLE net_worth_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- NULL = global default
  name TEXT NOT NULL,
  icon TEXT NOT NULL, -- Lucide icon name slug
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_net_worth_categories_user_id ON net_worth_categories(user_id);

-- 2. RLS
ALTER TABLE net_worth_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read global and own net worth categories" ON net_worth_categories
FOR SELECT USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Users can create own net worth categories" ON net_worth_categories
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own net worth categories" ON net_worth_categories
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own net worth categories" ON net_worth_categories
FOR DELETE USING (user_id = auth.uid());

-- 3. updated_at trigger
CREATE TRIGGER net_worth_categories_set_updated_at
BEFORE UPDATE ON net_worth_categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. ENTRIES GAIN A CATEGORY
ALTER TABLE net_worth_entries
ADD COLUMN category_id UUID REFERENCES net_worth_categories(id) ON DELETE SET NULL;

-- 5. TIGHTEN ENTRIES RLS (category must be global or owned)
DROP POLICY "Users can manage own net worth entries" ON net_worth_entries;

CREATE POLICY "Users can select own net worth entries" ON net_worth_entries
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own net worth entries" ON net_worth_entries
FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND (
    category_id IS NULL
    OR category_id IN (
      SELECT id FROM net_worth_categories
      WHERE user_id IS NULL OR user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update own net worth entries" ON net_worth_entries
FOR UPDATE USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND (
    category_id IS NULL
    OR category_id IN (
      SELECT id FROM net_worth_categories
      WHERE user_id IS NULL OR user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can delete own net worth entries" ON net_worth_entries
FOR DELETE USING (auth.uid() = user_id);
