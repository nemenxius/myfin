-- supabase/migrations/004_category_manage.sql

-- Users can update their own custom categories (global categories stay read-only)
CREATE POLICY "Users can update own custom categories" ON categories
FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own custom categories
CREATE POLICY "Users can delete own custom categories" ON categories
FOR DELETE USING (auth.uid() = user_id);
