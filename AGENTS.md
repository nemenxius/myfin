# AGENTS.md

Project memory and instruction guide for AI coding agents working on **MyFin**.

## 1. Project Overview & Tech Stack

MyFin is a personal finance tracker (expense tracker) built as a Next.js web app. It lets a user record income/expense transactions across accounts, categorize them, and view their net position, monthly spending, and a running-balance ledger.

- **Framework:** Next.js 16 (App Router, React 19, Turbopack)
- **Styling:** Tailwind CSS v4 (CSS-first config via `@theme` in `app/globals.css`), `tw-animate-css`
- **UI components:** Shadcn UI (v4) built on **Base UI** primitives (`@base-ui/react`) — note: Base UI buttons use a `render` prop, not `asChild`
- **State / data fetching:** TanStack Query (v5) for server state + optimistic mutations
- **Database:** Supabase (Postgres) with Row Level Security; **no ORM** — raw Supabase JS client + generated TypeScript types
- **Icons:** Lucide React
- **Charts:** Recharts
- **Utilities:** `date-fns`, `clsx`, `tailwind-merge`, `class-variance-authority`

## 2. Directory Structure & Architecture

```
app/
  (auth)/auth/        # Sign in / sign up
  auth/callback + auth/confirm # OAuth/email route handlers
  onboarding/         # Display-currency onboarding
  dashboard/          # Dashboard page (stat cards, chart + side panel, ledger) + settings
  dashboard/layout.tsx # Shared dashboard shell (header + nav)
  dashboard/accounts/ # Accounts management page
  layout.tsx          # Root layout — loads brand fonts (Public Sans, Newsreader, IBM Plex Mono)
  globals.css         # Tailwind v4 theme tokens, brand palette, animations, utilities
  providers.tsx       # TanStack Query provider wrapper
  page.tsx            # Landing page
components/
  accounts/           # account-currencies, account-form, account-list, account-types
  auth/               # auth-form, user-menu, onboarding-gate, update-password-form
  brand/              # Logo (SVG wallet mark)
  dashboard/          # header, stat-card, stat-cards, side-panel, spending-chart
  landing/            # header, hero, hero-visual
  transactions/       # transaction-list (ledger), transaction-form
  ui/                 # Shadcn/Base UI primitives (card, table, button, dialog, etc.)
hooks/
  use-auth.tsx          # Auth state (user/session) via AuthProvider (mounted in providers.tsx)
  use-profile.ts        # Profile row (display_currency) query
  use-transactions.ts   # CRUD + optimistic mutations for transactions
  use-accounts.ts       # CRUD for accounts
  use-categories.ts     # Read-only categories query
  use-primary-currency.ts # Profile display_currency → first account's currency → USD fallback
lib/
  supabase/client.ts  # Browser Supabase client (createBrowserClient)
  supabase/server.ts  # Server Supabase client (createServerClient, cookie-based)
  format.ts           # formatCurrency(amount, currency) + getCurrencySymbol (Intl.NumberFormat)
  utils.ts            # cn() helper
types/
  database.ts         # Generated Supabase types (Tables<T> / TablesInsert<T>)
supabase/
  migrations/         # SQL migrations (001_initial_schema.sql)
  seed.sql            # Global categories seed
```

## 3. Key Architectural Rules & Patterns

### Data fetching
- All server state goes through **TanStack Query** hooks in `hooks/` — never call Supabase directly inside components.
- Browser queries use `supabaseClient` from `lib/supabase/client.ts`; server components/actions use `createClient()` from `lib/supabase/server.ts`.
- Generated types come from `types/database.ts`. Use the `Tables<T>` / `TablesInsert<T>` helper types (e.g. `Tables<"transactions">`), **not** handwritten aliases. `transaction_type` and `account_type` are plain strings (not unions) in the generated types.
- Auth state flows through `useAuth()` (`hooks/use-auth.tsx`, mounted in `app/providers.tsx`) and the profile row through `useProfile()`. `usePrimaryCurrency` resolves: `profiles.display_currency` → first account's currency → `"USD"`. Route protection lives in `middleware.ts` (refreshes the session, guards `/dashboard*` + `/onboarding`, bounces signed-in users off `/auth`).

### Database / RLS conventions
- **UUID primary keys** everywhere (`gen_random_uuid()`), with `user_id` referencing `profiles(id)`.
- **Global vs user categories:** `categories.user_id` is nullable. `NULL` = global category (visible to all users, seeded in `supabase/seed.sql`); a non-null `user_id` = a user's custom category. RLS policy: `user_id IS NULL OR auth.uid() = user_id`.
- RLS is enabled on all tables; policies enforce that users only see/manage their own rows. Transactions must reference an account owned by the same user (enforced via a `WITH CHECK` policy).
- `amount` is `NUMERIC`: **positive = income, negative = expense**.
- Schema changes go in `supabase/migrations/` as numbered SQL files; seed data in `supabase/seed.sql`.

### Optimistic UI guidelines
- Mutations use `useMutation` with `onMutate` to optimistically update the cache, `onError` to roll back to the previous snapshot, and `onSettled` to `invalidateQueries`.
- `useTransactions` follows this pattern (add/update/delete). `useAccounts` uses the simpler `onSuccess` → `invalidateQueries` pattern.
- `addTransaction` resolves `user_id` internally via `auth.getUser()` — callers pass everything except `user_id`.

### Styling conventions
- Tailwind v4 CSS-first: tokens are defined in `@theme inline` and `:root`/`.dark` blocks in `app/globals.css`.
- Brand palette: navy `#083458`, teal `#18848C`, paper background `#F4F5F3`, ink `#0B1C28`, fog `#6C7A83`, leaf `#0E7C5B` (income/positive), ember `#C0392B` (expense/negative).
- Type system: **Public Sans** (body/UI, `--font-sans`), **Newsreader** (serif display, `--font-display`), **IBM Plex Mono** (all money figures, `--font-mono`). Use `font-mono tabular-nums` for any currency amount.
- Prefer existing Shadcn primitives in `components/ui/` over hand-rolled markup. Remember Base UI quirks (e.g. `render` prop on buttons, `onValueChange` on Select passes `string | null`).

## 4. Project Setup & Commands

```bash
npm install          # install dependencies
npm run dev          # start dev server (http://localhost:3000)
npm run build        # production build (type-checks + prerenders)
npm run start        # run production build
npm run lint         # run ESLint (next lint)
```

**Supabase type generation** (after schema changes):

```bash
supabase gen types typescript --project-id <PROJECT_ID> --schema public > types/database.ts
```

**Environment variables** (`.env.local` — never commit real values):

```
NEXT_PUBLIC_SUPABASE_URL=<project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

> Note: the browser/server clients use the **publishable key** (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), not the legacy anon key. The service-role key must never be exposed to the browser. Placeholder/invalid values cause a 500 on `/auth` (`Invalid supabaseUrl`), so use valid-shaped values when building.

**Database migrations:**

```bash
supabase db push     # apply pending migrations
supabase db reset    # reset local DB and re-run migrations + seed
```

## 5. Current Status & Recent Progress Log

**Phase 1 (MVP) — complete.** Tasks 1–5 delivered and pushed to `main`:

- **Task 1 — Scaffolding:** Next.js 16 App Router, Tailwind v4, Shadcn UI (Base UI), brand fonts, `globals.css` theme tokens.
- **Task 2 — Database:** `supabase/migrations/001_initial_schema.sql` (profiles, accounts, categories, transactions; UUID PKs; RLS policies; indexes) + `supabase/seed.sql` (global categories).
- **Task 3 — Supabase clients:** browser (`lib/supabase/client.ts`) and server (`lib/supabase/server.ts`) clients; `.env.local` with URL + publishable key; generated types in `types/database.ts`.
- **Task 4 — Data layer:** TanStack Query hooks — `useTransactions` (CRUD + optimistic mutations), `useAccounts`, `useCategories`.
- **Task 5 — Dashboard UI:** statement-style dashboard — dark navy "statement" band (net position, income/spending split, trend), overlapping insight banner (monthly spend), monthly spending chart (Recharts), and a ledger with running balances.

**Post-Phase-1 additions:**
- Landing page (`components/landing/`) with waitlist form and brand SVG logo.
- Full transaction management (create/edit/delete) with AlertDialog delete confirmation and dropdown row actions.
- Brand-aligned dashboard visual overhaul, then the current statement-style redesign (commit `0b4d679`).
- **Account Management (2026-08-04):** full CRUD for accounts. `hooks/use-accounts.ts` now exposes `createAccount`/`updateAccount`/`deleteAccount` (all optimistic with rollback + `invalidateQueries`; `createAccount` resolves `user_id` internally). New `components/accounts/` — `account-form.tsx` (create/edit dialog: name, type, starting balance, currency), `account-list.tsx` (calculated balances = `initial_balance` + Σ transactions, delete AlertDialog warns when linked transactions will cascade), `account-types.ts` (shared type→label map; DB values `checking`/`savings`/`cash`/`brokerage`). Shared `components/dashboard/header.tsx` (Overview/Accounts nav + global "Add Account" button) hosted by new `app/dashboard/layout.tsx`; new route `app/dashboard/accounts/page.tsx`. Transaction form shows an empty-state prompting to create an account when none exist.

**Dashboard redesign (2026-08-04):**
- Replaced the navy "jumbotron" (`components/dashboard/balance-overview.tsx`, deleted) with a responsive row of six stat cards — new `components/dashboard/stat-card.tsx` + `stat-cards.tsx`. Deleted `components/dashboard/insight-banner.tsx`.
- Added `components/dashboard/side-panel.tsx` (this-month spending with progress bar, category donut + top-3, account balances) and restyled `components/dashboard/spending-chart.tsx`.
- Rewrote `app/dashboard/page.tsx` to compose: StatCards → chart + side-panel grid (2/3 + 1/3) → TransactionList. No schema or env changes.
- Note: `npm run lint` is currently broken in this repo — `next lint` was removed in Next 16 and there is no ESLint config.

**Environment & migrations notes:**
- `.env.local` is in a working state with the real Supabase URL and publishable key.
- `supabase/.temp`, `.env*`, and `.next` are gitignored.
- All work is committed on `main` and pushed to `origin/main`.

**Bug fix — 409 on account/transaction inserts (2026-08-04):**
- Symptom: creating an account returned `409 Conflict` on `POST /rest/v1/accounts`; the form closed silently with nothing created.
- Root cause: `accounts.user_id`/`transactions.user_id` reference `profiles(id)`, but nothing ever created a `profiles` row (no signup trigger, no client insert). Inserts failed the FK (`23503` → PostgREST `409`).
- Fix: `supabase/migrations/002_auto_create_profiles.sql` — backfills `profiles` for existing `auth.users` and adds an `on_auth_user_created` trigger (SECURITY DEFINER `handle_new_user()`) so new signups get a profile row automatically. **Must be applied to the remote DB** (dashboard SQL editor or `supabase db push`) — the Supabase CLI is not installed in this dev environment.
- App hardening: `account-form.tsx` now uses `mutateAsync` and keeps the dialog open with an error banner on failure (instead of closing silently); fixed a Base UI `nativeButton` warning on the link-rendered "Create an account" button in `transaction-form.tsx`.

**Currency handling (2026-08-04):**
- `lib/format.ts`: `formatCurrency(amount, currency = "USD")` is now currency-aware (via `Intl.NumberFormat`); added `getCurrencySymbol(currency = "USD")`.
- New `hooks/use-primary-currency.ts`: returns `{ currency, isLoading, isError }` — the first account's currency, `"USD"` fallback when there are no accounts. Used by all aggregate displays.
- New `components/accounts/account-currencies.ts`: `CURRENCIES` (`{ value, label }[]`, same pattern as `ACCOUNT_TYPES`); the account form's currency field is now a Select dropdown.
- Aggregate displays use the primary currency: stat-cards, spending-chart, transaction-list ledger, and side-panel monthly totals + category donut.
- Per-account displays use each account's own currency: account-list balances and side-panel account balances.
- **Multi-currency aggregates (decision):** aggregate totals (ledger running balance, Combined balance, account-list total) sum raw `amount` values across accounts regardless of currency and label them in the primary currency. This assumes a single-currency-per-user reality; there is **no FX conversion**. Per-currency ledgers / FX conversion are a future feature, not a bug to fix silently.
- **Robustness (decision):** `lib/format.ts` validates currency codes (`/^[A-Za-z]{3}$/`) and wraps `Intl.NumberFormat` in a `try/catch` — invalid/garbage `accounts.currency` values (legacy free-text rows) fall back to `"USD"` instead of throwing a `RangeError` that would crash the dashboard render. Unknown-but-well-formed 3-letter codes render as literals.
- No schema or env changes.

**Auth feature (2026-08-05):**
- Full auth flow: email + Google signup, email-confirmed accounts, display-currency onboarding, password reset, logout, settings page, middleware route protection.
- Schema change: migration `003_profile_display_currency.sql` (nullable `profiles.display_currency` + profiles UPDATE policy). **Must be applied to the remote DB** (dashboard SQL editor).
- Manual Supabase config required: Confirm email ON, Password Length 8, Site URL `http://localhost:3000`, Google provider enabled, email templates pointed at `/auth/confirm` and `/auth/update-password`.
- The auth page lives at `/auth?mode=signup|signin` (old `/login` removed); landing links there.
- Decision: email-signup currency is held in `localStorage` (`pendingDisplayCurrency`) and applied on first authenticated load because email confirmation yields no session at signup time; Google users get an onboarding step instead.

**Auth hardening (2026-08-05, commit `50cf0f0`):**
- OnboardingGate no longer dead-ends on a blank dashboard if the pending-currency update fails — it shows an error card with a "Try again" button. It also guards against re-firing the mutation on every render (stable `mutate` + `startedRef`).
- `useProfile.updateDisplayCurrency` throws `Profile not found` when the update affects 0 rows (previously a silent success that could loop `/onboarding` ↔ `/dashboard` if a `profiles` row was missing).
- `pendingDisplayCurrency` is now set only after `signUp` succeeds (previously written before the call, leaving stale currency on signup error).
- `/auth/update-password` form is disabled with a "Verifying…" state until the recovery token is verified.
- `/auth/callback` validates the `next` param (same-origin path starting with a single `/`) before redirecting.
- Deferred: Next 16.3 deprecates `middleware.ts` in favor of `proxy.ts` (warning only; auth-critical file — migrate as a separate task).

**Month-scoped ledger & stat cards (2026-08-05):**
- Dashboard accepts `?month=YYYY-MM`; `lib/month.ts` (`parseMonthParam`, `monthWindow`, `monthLabel`) + `components/dashboard/month-selector.tsx` (chevrons + Today, `router.replace` so the back button isn't flooded).
- Income/Spending/Net/Savings-rate cards follow the month; Net position + Combined balance stay global. Ledger filters to the month with carried-forward seed balances; month-aware subtitle/empty states. Transaction form defaults new dates to the selected month (today if current). Chart + side panel unchanged.
- **No schema or env changes**; no data-layer changes (client-side filter over the `["transactions"]` cache).
- Commit: `86dd32c` (plan) → feature commits through `15de129`.

**Review fixes: local-midnight dates, pure ledger helper, Vitest (2026-08-05):**
- New `lib/date.ts` (`dateInputToISO` / `isoToDateInput`) — `transaction-form.tsx` now stores dates at LOCAL midnight instead of UTC midnight, so a transaction dated the 1st no longer falls before the month window's local-midnight start in UTC-negative timezones.
- Ledger balance math extracted from `transaction-list.tsx` into pure `lib/ledger.ts` (`buildLedger` + exported `LedgerRow`); the component now just calls it in its `rows` useMemo.
- Added Vitest (`npm test`): `vitest.config.ts` (forces `TZ: America/New_York`, `@` alias), `lib/month.test.ts`, `lib/ledger.test.ts`. 10 tests passing; `npm run build` green.
- Commit: after `61286c1`.

**Category management in settings (2026-08-05):**
- New "Categories" card on `/dashboard/settings` — users can create, edit, and delete their own custom transaction categories via a Dialog with a Lucide icon picker; seeded global categories are read-only.
- `useCategories` extended from read-only to optimistic CRUD (`createCategory`/`updateCategory`/`deleteCategory`, mirrors `useAccounts`). New `components/categories/`: `category-icons.tsx` (CATEGORY_ICONS + CategoryIcon renderer with Tag fallback), `category-form.tsx` (Dialog), `category-list.tsx` (grouped list + AlertDialog delete). Icons are rendered in the side-panel by-category list and the transaction-form category dropdown (see the next entry).
- **Schema change:** migration `004_category_manage.sql` (UPDATE + DELETE policies for own categories). **Must be applied to the remote DB** (dashboard SQL editor) — same as migrations 002/003.
- **Settings roadmap (not yet built):** dark mode/theme, default account for new transactions, CSV export, display name, week/month-start preferences, MFA/session management, delete account.
- Commit: feature commits on top of `b2fa6a4`.

**Category icons in dashboard (2026-08-05):**
- The side-panel "By category" list now renders each category's Lucide icon (from `categories.icon`) tinted to the donut slice color, replacing the plain colored dot; Uncategorized falls back to the Tag icon.
- The transaction form's category dropdown shows fog-colored icons next to category names in both the open list and the closed trigger (via Base UI `SelectValue`'s function-child formatter).
- Pure presentation change — no schema, no env, no data-layer changes, no new dependencies. Spec: `docs/superpowers/specs/2026-08-05-category-icons-dashboard-design.md`.
- Commit: feature commits on top of `6a92015`.

## 6. Agent Maintenance Guideline

After completing any major task, feature, or database migration, **update the "Current Status & Recent Progress Log" section above** — add a dated entry describing what was done, note any schema/env changes, and confirm the commit. Keep this file as the single source of truth for project state so future agents can pick up where the last one left off.
