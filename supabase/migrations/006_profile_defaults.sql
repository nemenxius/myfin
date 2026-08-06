-- supabase/migrations/006_profile_defaults.sql
-- Optional default account/category used to prefill new transactions (NULL = none).

ALTER TABLE public.profiles
  ADD COLUMN default_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN default_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;
