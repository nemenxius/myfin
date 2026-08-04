-- supabase/migrations/002_auto_create_profiles.sql
-- Fix: accounts/transactions inserts fail with 409 (FK violation on profiles)
-- Root cause: no row exists in public.profiles for a user, so any row
-- referencing profiles(id) via user_id violates the FK (SQLSTATE 23503 ->
-- PostgREST HTTP 409). Nothing ever created a profile row: there was no
-- signup trigger and no client-side profile insert.

-- 1. Backfill profiles for users that already exist.
INSERT INTO public.profiles (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 2. Auto-create a profile row whenever a new user signs up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
