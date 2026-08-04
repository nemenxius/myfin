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
  (auth)/login/       # Login page
  dashboard/          # Dashboard page (statement band, insight banner, chart, ledger)
  dashboard/layout.tsx # Shared dashboard shell (header + nav)
  dashboard/accounts/ # Accounts management page
  layout.tsx          # Root layout — loads brand fonts (Public Sans, Newsreader, IBM Plex Mono)
  globals.css         # Tailwind v4 theme tokens, brand palette, animations, utilities
  providers.tsx       # TanStack Query provider wrapper
  page.tsx            # Landing page
components/
  accounts/           # account-form, account-list, account-types
  brand/              # Logo (SVG wallet mark)
  dashboard/          # header, balance-overview, insight-banner, spending-chart
  landing/            # header, hero, hero-visual, waitlist-form
  transactions/       # transaction-list (ledger), transaction-form
  ui/                 # Shadcn/Base UI primitives (card, table, button, dialog, etc.)
hooks/
  use-transactions.ts # CRUD + optimistic mutations for transactions
  use-accounts.ts     # CRUD for accounts
  use-categories.ts   # Read-only categories query
lib/
  supabase/client.ts  # Browser Supabase client (createBrowserClient)
  supabase/server.ts  # Server Supabase client (createServerClient, cookie-based)
  format.ts           # formatCurrency (Intl.NumberFormat, USD)
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

> Note: the browser/server clients use the **publishable key** (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), not the legacy anon key. The service-role key must never be exposed to the browser. Placeholder/invalid values cause a 500 on `/login` (`Invalid supabaseUrl`), so use valid-shaped values when building.

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

**Environment & migrations notes:**
- `.env.local` is in a working state with the real Supabase URL and publishable key.
- `supabase/.temp`, `.env*`, and `.next` are gitignored.
- All work is committed on `main` and pushed to `origin/main`.

**Bug fix — 409 on account/transaction inserts (2026-08-04):**
- Symptom: creating an account returned `409 Conflict` on `POST /rest/v1/accounts`; the form closed silently with nothing created.
- Root cause: `accounts.user_id`/`transactions.user_id` reference `profiles(id)`, but nothing ever created a `profiles` row (no signup trigger, no client insert). Inserts failed the FK (`23503` → PostgREST `409`).
- Fix: `supabase/migrations/002_auto_create_profiles.sql` — backfills `profiles` for existing `auth.users` and adds an `on_auth_user_created` trigger (SECURITY DEFINER `handle_new_user()`) so new signups get a profile row automatically. **Must be applied to the remote DB** (dashboard SQL editor or `supabase db push`) — the Supabase CLI is not installed in this dev environment.
- App hardening: `account-form.tsx` now uses `mutateAsync` and keeps the dialog open with an error banner on failure (instead of closing silently); fixed a Base UI `nativeButton` warning on the link-rendered "Create an account" button in `transaction-form.tsx`.

## 6. Agent Maintenance Guideline

After completing any major task, feature, or database migration, **update the "Current Status & Recent Progress Log" section above** — add a dated entry describing what was done, note any schema/env changes, and confirm the commit. Keep this file as the single source of truth for project state so future agents can pick up where the last one left off.