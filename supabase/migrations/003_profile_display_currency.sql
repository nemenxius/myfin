-- supabase/migrations/003_profile_display_currency.sql
-- Display currency for the user (NULL = not yet chosen -> onboarding step).

ALTER TABLE public.profiles ADD COLUMN display_currency TEXT;

-- The app writes display_currency during onboarding and from Settings.
-- profiles previously had only a SELECT policy.
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
