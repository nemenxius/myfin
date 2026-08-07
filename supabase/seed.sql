-- supabase/seed.sql
-- Global categories (user_id NULL) available to all users.

INSERT INTO categories (name, icon) VALUES
('Food', 'Utensils'),
('Rent', 'Home'),
('Utilities', 'Zap'),
('Salary', 'Banknote'),
('Investment Income', 'TrendingUp');

-- Global net worth asset categories (user_id NULL) available to all users.
INSERT INTO net_worth_categories (name, icon)
SELECT name, icon FROM (VALUES
  ('Money', 'Banknote'),
  ('P2P', 'Handshake'),
  ('Stock Exchange', 'CandlestickChart'),
  ('PPR', 'PiggyBank')
) AS defaults(name, icon)
WHERE NOT EXISTS (
  SELECT 1 FROM net_worth_categories
  WHERE user_id IS NULL AND name = defaults.name
);
