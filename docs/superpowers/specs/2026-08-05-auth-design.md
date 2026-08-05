# MyFin Auth & Onboarding — Design Spec

**Date:** 2026-08-05
**Status:** Approved (design sections 1–2)
**Scope:** User registration, email-verified accounts, Google signup, display-currency onboarding, route protection, logout, password reset, and a settings surface.

## 1. Goals

- Allow anyone to create an account and use the app after confirming their email.
- Support both **email + password** and **Google OAuth** signup on the same auth page.
- Ask for the user's **display currency** during signup; store it on the profile and use it as the source of truth for aggregate displays.
- Require **secure passwords** (min 8 chars) for email signup.
- Provide a **logout** button and a minimal **settings** surface (change display currency, change password).
- Protect dashboard routes from unauthenticated access.
- Replace the fake landing waitlist with a real signup CTA.

## 2. Data Model

### Migration `003_profile_display_currency.sql`

```sql
ALTER TABLE public.profiles ADD COLUMN display_currency TEXT;
```

- **Nullable.** `NULL` = "display currency not yet chosen" (triggers onboarding). A non-null value = explicit user choice.
- No trigger changes. `handle_new_user()` (migration 002) inserts only `id`, so new rows get `display_currency = NULL` automatically and existing rows are unaffected.
- No new tables, no changes to `accounts`, `categories`, or `transactions`.

### Display currency resolution (source of truth)

For any aggregate display, resolve in order:

1. `profiles.display_currency` (explicit choice, set at signup or onboarding).
2. Fallback: first account's `currency` (existing `useAccounts` ordering).
3. Fallback: `"USD"`.

This replaces the current first-account-only heuristic in `usePrimaryCurrency`.

## 3. Central Auth Layer

New hooks, replacing ad-hoc `auth.getUser()` calls:

- `hooks/use-auth.ts` — exposes authenticated user + session state and `signOut()`. Built on `supabaseClient.auth.getSession()` + `onAuthStateChange`; resolves user identity via `auth.getUser()` (server-verified).
- `hooks/use-profile.ts` — TanStack Query for the `profiles` row (incl. `display_currency`), keyed by user id.
- `hooks/use-primary-currency.ts` — rewritten to consume the profile display currency per the resolution order above. Return shape stays `{ currency, isLoading, isError }` so existing consumers (stat-cards, side-panel, spending-chart, transaction-list, account-list) are unaffected.

## 4. Auth Flows

### 4.1 Sign up (email + password)

- Fields: email, password (min 8), confirm password (must match), display currency (reuses `CURRENCIES` from `components/accounts/account-currencies.ts`).
- Client-side validation only (Supabase enforces min length server-side after config).
- `supabaseClient.auth.signUp({ email, password })`.
- With email confirmation enabled, **no session exists after signup** — the currency choice cannot be written to the profile yet. Persist it client-side as a pending value (`localStorage` key `pendingDisplayCurrency`) and apply it on the first authenticated load (see 4.3).
- Show the **check-your-inbox** screen after a successful signup.

### 4.2 Email verification

- Supabase confirmation email links to `/auth/confirm?token_hash=…&type=email`.
- Route handler `app/auth/confirm/route.ts`: uses the server client to `verifyOtp({ token_hash, type })`, then redirects. On success → landing of the authenticated flow; on failure → `/auth?error=confirm`.

### 4.3 First-login onboarding

The check runs in an `OnboardingGate` client component mounted in the authenticated dashboard layout (so it covers `/dashboard`, `/dashboard/*`, and `/settings`). It shows nothing until `useProfile` loads; then:

- If `profile.display_currency` is non-null → render children (no onboarding).
- If NULL **and** a pending value exists in `localStorage` → apply it (`UPDATE profiles`), clear storage, render children.
- If NULL with no pending value (Google user) → `router.replace("/onboarding")`.
- Unauthenticated → redirect to `/auth` (belt-and-braces with middleware).

`app/onboarding/page.tsx`: currency picker (reuses `CURRENCIES`), "Get started" saves `display_currency`, redirects to `/dashboard`. Guard: redirect to `/dashboard` if currency already set; redirect to `/auth` if unauthenticated.

### 4.4 Google signup / sign-in

- "Continue with Google" button → `signInWithOAuth({ provider: "google", options: { redirectTo: "<origin>/auth/callback" } })`.
- Route handler `app/auth/callback/route.ts`: server client `exchangeCodeForSession(code)`, then redirect to `/dashboard` (onboarding handles the currency step).
- Profile row is auto-created by the `handle_new_user()` trigger.

### 4.5 Sign in

- Email + password via `signInWithPassword`. If the email is unconfirmed, surface Supabase's "Email not confirmed" error with a resend hint.
- Google via 4.4.

### 4.6 Password reset

- `app/(auth)/forgot/page.tsx`: email input → `resetPasswordForEmail(email)` → confirmation message.
- Supabase reset email links to `/auth/update-password` (redirect-configured).
- `app/(auth)/update-password/page.tsx`: new password + confirm → `updateUser({ password })` → success message + sign in.
- Route guard: only reachable with a valid reset session.

### 4.7 Logout

- `signOut()` → redirect to `/`.

## 5. UI / Pages

- **Landing (`/`)**: header gets "Sign In" and "Create Account" buttons; hero CTA links to `/auth?mode=signup`. Remove `components/landing/waitlist-form.tsx` (no longer referenced). Update hero copy ("Launching soon" → open signup).
- **Auth page** (`app/(auth)/auth/page.tsx`, reworking the existing `(auth)/login`): single branded card with a **Sign in / Create account** toggle, "Continue with Google" on both modes, "Forgot password?" link on sign-in, inline error handling. `?mode=signup` deep-links to the create-account tab.
- **Onboarding** (`app/onboarding/page.tsx`): as in 4.3.
- **Dashboard shell** (`app/dashboard/layout.tsx`): wraps children in the `OnboardingGate` client component (see 4.3) that enforces the display-currency check before rendering.
- **Dashboard header** (`components/dashboard/header.tsx`): add a user menu (email / avatar) with **Settings** and **Log out**. Keep existing nav and "Add Account".
- **Settings** (`app/dashboard/settings/page.tsx`):
  - Display currency: dropdown → `UPDATE profiles.display_currency` (optimistic, invalidate `use-profile`).
  - Password: new password + confirm → `updateUser({ password })`. Hidden for Google users (detect via `user.app_metadata.provider === "google"`); show "Signed in with Google" note instead.
  - Danger zone: **Log out** button.

## 6. Route Protection

`middleware.ts` (standard Supabase SSR refresh pattern):

- On every request, refresh the session via the server client (cookie-based) and call `getUser()`.
- Protected: `/dashboard`, `/dashboard/*`, `/settings`… (anything under the authenticated shell) and `/onboarding` → redirect to `/auth` when no user.
- `/auth` and `/auth/*` → redirect to `/dashboard` when already signed in.
- All other paths (landing, static) pass through.
- Matcher scoped to the relevant paths (auth, dashboard, onboarding) to avoid running middleware on every asset request.

## 7. Security

- Passwords: hashed by Supabase (bcrypt). Never logged; never transmitted in URLs; never stored in client state beyond the form field.
- Minimum password length **8** — enforced client-side (validation) and server-side (Supabase Auth "Password Length" setting).
- Email confirmation is the account-validation gate ("accounts validated via email").
- Sessions: httpOnly cookies managed by `@supabase/ssr`. CSRF handled by Supabase's PKCE/code flow.
- Route handlers verify sessions server-side via `getUser()` (not just the cookie JWT).

## 8. Manual Supabase configuration (documented in the plan; performed by the user in the Supabase dashboard)

1. **Auth → Providers → Email**: enable **Confirm email**; set **Password Length** to 8.
2. **Auth → Providers → Google**: enable, set Client ID + Secret (from Google Cloud Console: OAuth consent screen + OAuth 2.0 Client ID, Web application type, authorized redirect URI `https://<project>.supabase.co/auth/v1/callback`).
3. **Auth → URL Configuration**: Site URL `http://localhost:3000`; add redirect URLs for `/auth/callback`, `/auth/confirm`, and `/auth/update-password`.
4. "Allow new users to sign up" must remain enabled.
5. The Supabase CLI is not installed in this environment — migrations are applied via the dashboard SQL editor or `supabase db push` elsewhere. **`003_profile_display_currency.sql` must be applied to the remote DB** before the app relies on the column.

## 9. Verification

- `npm run build` passes (type-check + prerender).
- Manual walkthrough of each flow against a running `npm run dev`:
  - Sign up → confirmation email → confirm → first sign-in → dashboard.
  - Signup currency persisted to profile; aggregate displays use it.
  - Google signup → OAuth → onboarding currency step → dashboard.
  - Sign in with wrong password → error; unconfirmed email → "Email not confirmed".
  - Forgot password → reset email → new password → sign in with new password.
  - Settings: change currency; change password; Google user sees no password section.
  - Logout → landing; protected routes redirect unauthenticated users; `/auth` redirects signed-in users.
- `AGENTS.md` updated (schema change, auth feature, manual config notes).

## 10. Out of Scope (future)

- Email change, account deletion, multi-provider accounts (email ↔ Google linking), 2FA, custom user profiles/avatars, resend-email UI beyond a hint.
