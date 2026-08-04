-- supabase/seed.sql
-- Global categories (user_id NULL) available to all users.

INSERT INTO categories (name, icon) VALUES
('Food', 'Utensils'),
('Rent', 'Home'),
('Utilities', 'Zap'),
('Salary', 'Banknote'),
('Investment Income', 'TrendingUp');
