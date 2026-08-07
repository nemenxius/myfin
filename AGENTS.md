# AGENTS.md

Project memory and operating guide for AI coding agents working on **MyFin**.

Keep this file compact and current. It should preserve durable architecture, rules, commands, migration state, and active follow-ups. Do not use it as a full chronological changelog; detailed feature specs/plans live in `docs/superpowers/` and history is in git.

## 1. Project Snapshot

MyFin is a personal finance tracker built with **Next.js 16 App Router** and **React 19**. Users manage accounts, income/expense transactions, custom categories, display currency, and a dashboard with monthly stat cards, spending chart, side panel, and running-balance ledger.

- **Framework:** Next.js 16, React 19, Turbopack.
- **Styling:** Tailwind CSS v4 via `app/globals.css` `@theme`; `tw-animate-css`.
- **UI:** Shadcn-style components in `components/ui/` built on **Base UI** primitives.
- **Data:** TanStack Query v5 hooks in `hooks/`.
- **Database/Auth:** Supabase Postgres + RLS, raw Supabase JS clients, generated types in `types/database.ts`; no ORM.
- **Visuals:** Lucide React icons, Recharts.
- **Utilities:** `date-fns`, `clsx`, `tailwind-merge`, `class-variance-authority`.

## 2. Current Architecture Map

```txt
app/
  (auth)/auth/              # Sign in / sign up page
  auth/callback             # OAuth callback route
  auth/confirm              # Email/OTP confirmation route
  auth/update-password      # Password recovery page
  onboarding/               # Display-currency onboarding
  dashboard/                # Overview, accounts, settings routes
  dashboard/portfolio/      # Portfolio overview + holding detail routes
  dashboard/net-worth/      # Net worth overview route
  api/market-data           # Market data proxy route (quotes/history)
  layout.tsx                # Root layout and brand fonts
  providers.tsx             # TanStack Query + auth providers
components/
  accounts/                 # Account CRUD, currencies, account type constants
  auth/                     # Auth forms, user menu, onboarding gate
  brand/                    # Logo
  categories/               # Category CRUD UI and Lucide icon renderer
  dashboard/                # Header, stat cards, month selector, chart, side panel
  landing/                  # Marketing page header/hero/hero-visual
  net-worth/                # Net worth summary, evolution chart, entry lists/forms, category management
  portfolio/                # Holding form, holdings table, charts
  transactions/             # Transaction form and ledger table
  ui/                       # Base UI / Shadcn primitives
hooks/
  use-auth.tsx              # AuthProvider/useAuth session state
  use-profile.ts            # profiles row + display currency + defaults mutations
  use-primary-currency.ts   # profile currency -> first account -> USD fallback
  use-accounts.ts           # Account CRUD
  use-categories.ts         # Category CRUD
  use-transactions.ts       # Transaction CRUD
  use-portfolio.ts          # Portfolio holdings/transactions CRUD + computed metrics
  use-net-worth.ts          # Net worth entries + value-row CRUD
  use-net-worth-categories.ts   # Net worth asset category CRUD
lib/
  supabase/client.ts        # Browser Supabase client
  supabase/server.ts        # Server Supabase client
  format.ts                 # Currency formatting helpers
  month.ts                  # Month parsing/window/labels
  date.ts                   # Date input <-> local-midnight ISO helpers
  ledger.ts                 # Pure ledger/running-balance helper
  pending-display-currency.ts # localStorage helpers for signup currency
  market-data/              # Yahoo/AlphaVantage/CoinGecko providers + TTL cache
  net-worth/                # Pure net worth value-history helpers + tests
  portfolio/                # Pure portfolio math helpers + tests
supabase/
  migrations/               # Numbered SQL migrations
  seed.sql                  # Global categories seed
proxy.ts                    # Next 16.3 Proxy auth/session refresh; replaces middleware.ts
```

## 3. Non-Negotiable Rules

### Data Fetching

- Components do **not** call Supabase directly. Use TanStack Query hooks in `hooks/`.
- Browser data uses `supabaseClient` from `lib/supabase/client.ts`; server code uses `createClient()` from `lib/supabase/server.ts`.
- Use generated helpers from `types/database.ts`: `Tables<T>` and `TablesInsert<T>`. Do not handwrite DB row aliases unless they wrap generated types.
- `transaction_type` and `account_type` are plain strings in generated types, not database enum unions.

### Auth And Routing

- Auth state flows through `useAuth()` from `hooks/use-auth.tsx`, mounted in `app/providers.tsx`.
- Route protection/session refresh lives in `proxy.ts` using the Next 16.3 Proxy convention. Do not recreate `middleware.ts`.
- Protected routes: `/dashboard*` and `/onboarding`. Signed-in users visiting `/auth` are redirected to `/dashboard`.
- Email-signup currency is temporarily stored in `localStorage` as `pendingDisplayCurrency`; Google users may go through onboarding.

### Database And RLS

- UUID primary keys everywhere (`gen_random_uuid()`). User-owned tables reference `profiles(id)`.
- `profiles` rows are auto-created by migration `002_auto_create_profiles.sql` trigger.
- Categories: `categories.user_id IS NULL` means global/read-only seeded category; non-null means user custom category.
- Category RLS allows selecting global + own categories, inserting own categories, and updating/deleting own custom categories only.
- Transactions must reference an account owned by the same user. Category ownership validation on transaction insert is a known future hardening item.
- `transactions.amount`: positive = income, negative = expense.
- Schema changes go in `supabase/migrations/` as numbered SQL files; seed changes go in `supabase/seed.sql`.

### Optimistic UI

- Mutations should use `onMutate` snapshot/optimistic update, `onError` rollback, and `onSettled` invalidation unless there is a clear reason not to.
- `useTransactions`, `useAccounts`, and `useCategories` are the patterns to copy.
- Create mutations resolve `user_id` internally via `auth.getUser()`; callers should not pass `user_id`.

### Styling And UI

- Brand colors: navy `#083458`, teal `#18848C`, paper `#F4F5F3`, ink `#0B1C28`, fog `#6C7A83`, leaf `#0E7C5B`, ember `#C0392B`.
- Theme CSS variables in `app/globals.css` hold **full hex colors** (e.g. `--muted-foreground: #64747f`), NOT shadcn-style HSL triplets. Therefore in Recharts/SVG use `var(--x)` directly (e.g. `fill: "var(--muted-foreground)"`, `stroke: "var(--border)"`). Wrapping in `hsl(var(--x))` is invalid CSS and silently renders black text/strokes in dark mode. Never hardcode `bg-white`/`text-ink`/hex greys in components — use `bg-card`, `bg-popover`, `bg-secondary`, `text-foreground`, `text-muted-foreground`, `text-fog`, `bg-leaf/10 text-leaf`, `bg-ember/10 text-ember`, and chart colors via `var(--chart-1..5)` / `--leaf` / `--ember`.
- Fonts: Public Sans (`--font-sans`), Newsreader (`--font-display`), IBM Plex Mono (`--font-mono`). Use `font-mono tabular-nums` for money.
- Prefer primitives in `components/ui/` over custom base markup.
- Base UI quirks: `Button` uses `render` rather than `asChild`; Select `onValueChange` passes `string | null`; `SelectValue` supports a function child for custom selected rendering.
- Category icons use `components/categories/category-icons.tsx` (`CategoryIcon` with `Tag` fallback). Dashboard side-panel icons are tinted to donut colors; transaction-form dropdown icons use `text-fog`.

## 4. Commands And Verification

```bash
npm install        # install dependencies
npm run dev        # local dev server, usually http://localhost:3000
npm run build      # production build; type-checks and prerenders
npm test           # Vitest suite; currently 25 tests
npm run start      # run production build
```

- Do **not** run `npm run lint`: this repo still has the old `next lint` script and no ESLint config; Next 16 removed `next lint`.
- `npm test` currently passes but emits a known non-failing Vite warning about native config loading and ESM syntax in `vitest.config.ts`.
- Fresh completion claims require `npm run build && npm test` unless the task is docs-only and the user explicitly scopes verification differently.

## 5. Supabase And Environment

Environment variables in `.env.local`:

```txt
NEXT_PUBLIC_SUPABASE_URL=<project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

- The clients use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, not the legacy anon key.
- Never expose or commit a service-role key.
- Placeholder/invalid Supabase URL values can break `/auth` with `Invalid supabaseUrl`; use valid-shaped values for builds.
- Supabase CLI is not installed in this dev environment. Remote migrations are usually applied through the Supabase dashboard SQL editor.

Migration state to preserve:

- `001_initial_schema.sql`: profiles, accounts, categories, transactions, indexes, initial RLS.
- `002_auto_create_profiles.sql`: backfill + auth trigger for profile rows.
- `003_profile_display_currency.sql`: nullable `profiles.display_currency` + update policy.
- `004_category_manage.sql`: update/delete policies for own custom categories. User confirmed this was run remotely on 2026-08-05.
- `005_add_to_account_id.sql`: `transactions.to_account_id` + transfer RLS policies.
- `006_profile_defaults.sql`: nullable `profiles.default_account_id` / `default_category_id` for prefilling new transactions. Not yet run remotely; apply via Supabase dashboard SQL editor.
- `007_portfolio_and_holdings.sql`: portfolio_holdings + holding_transactions tables, RLS, indexes. Run remotely on 2026-08-06.
- `008_net_worth.sql`: `net_worth_entries` (asset/liability via `entry_type`) + `net_worth_snapshots` tables, RLS, and a `SECURITY DEFINER` trigger (`record_net_worth_snapshot`) that records a snapshot whenever an entry write changes the user's net worth (dedupes when unchanged). Run remotely on 2026-08-06. **Dependency:** 008's `set_updated_at` trigger requires the `set_updated_at()` function from 007 — apply 007 before 008.
- `009_net_worth_value_history.sql`: replaces 008's snapshot model — wipes existing 008 test data (TRUNCATE), drops the `net_worth_snapshots` table + `record_net_worth_snapshot()` trigger, drops `net_worth_entries.value`, and adds `net_worth_entry_values` (one dated value per entry/date) with RLS via the parent entry. Not yet run remotely; apply via Supabase dashboard SQL editor.
- `010_net_worth_categories.sql`: `net_worth_categories` table (global `user_id IS NULL` read-only defaults + user custom), nullable `net_worth_entries.category_id` (ON DELETE SET NULL), tightened INSERT/UPDATE RLS on `net_worth_entries` so `category_id` must be global or owned. Not yet run remotely; apply via Supabase dashboard SQL editor after 009. Defaults (Money, P2P, Stock Exchange, PPR) seeded in `seed.sql`.

After schema changes, regenerate types with:

```bash
supabase gen types typescript --project-id <PROJECT_ID> --schema public > types/database.ts
```

## 6. Current Feature State

- Landing page and full auth flow are implemented: email + Google signup, email confirmation, password reset, logout, onboarding, settings page.
- Dashboard supports `?month=YYYY-MM`; month-aware cards and ledger use `lib/month.ts`, `lib/date.ts`, and `lib/ledger.ts`.
- Accounts CRUD lives under `/dashboard/accounts`.
- Transactions support create/edit/delete with optimistic updates and month-default dates. New transactions prefill account/category from `profiles.default_account_id` / `default_category_id` (optional; both unset means no default).
- Settings (`/dashboard/settings`) includes a Defaults card to set/unset the default account and default category.
- Categories are managed in `/dashboard/settings`: global categories are read-only; users can create/edit/delete custom categories with a Lucide icon picker.
- Category icons render in the dashboard side-panel by-category list and in the transaction form dropdown.
- The side-panel donut chart and its top-3 category list are hover-synced via a shared `activeIndex` state in `side-panel.tsx`. Recharts 3 note: per-`Cell` geometry props (`outerRadius`, etc.) no longer exist; per-slice active styling uses the `Pie` `shape` prop rendering a `Sector` (Cell carries only `fill`).
- Portfolio holdings auto-detect their trading currency from the live quote when added (e.g. `EUNL.DE` → EUR), falling back to the profile display currency if the quote can't be fetched. Existing holdings created before this change may still carry the `USD` default.
- Adding a holding shows a live symbol-search dropdown (Yahoo lookup via `action=search`) that fills symbol, name, price, and currency on select; search failures degrade silently to manual typing.
- Currency formatting is currency-aware and guarded against invalid currency codes; aggregate multi-currency totals still sum raw values and label them in primary currency. There is no FX conversion.
- The Portfolio Performance chart and each holding's price chart are transaction-aware:
  value series reflect actual buy/sell dates (starting at the first purchase), holding
  charts start at that holding's first transaction, and price history is fetched at a
  per-symbol range (`3m`/`6m`/`1y`/`2y`/`5y`/`max`) derived from the earliest transaction.
- Proxy migration is complete: `proxy.ts` replaced deprecated `middleware.ts`. Restart dev servers if the old deprecation warning persists.
- Net Worth (`/dashboard/net-worth`) is fully independent of accounts, transactions, and portfolio data. Each entry (asset/liability) has a timeline of dated value rows (`net_worth_entry_values`); current value = the latest row, and the evolution chart is reconstructed from all value rows (no snapshots). Entries are restricted to the profile display currency (no FX conversion).
- Net Worth assets support optional categories: four read-only global defaults
  (Money, P2P, Stock Exchange, PPR) plus user-custom categories (managed in
  Settings); assets show a category badge and pick one in the asset form.
  Liabilities are unaffected. RLS validates that an entry's category is global
  or owned by the user.

## 7. Known Follow-Ups

- Tighten transaction insert/update RLS so `category_id` must be global or owned by the same user. Same ownership gap exists on `holding_transactions`: its foreign-ownership EXISTS policy is OR-combined with the `auth.uid()` ALL policy, so a user could insert a transaction referencing another user's `holding_id`. Migration 007 is not yet applied remotely, so an in-file fix is cheap before applying.
- Add UI feedback for failed category/account delete mutations instead of silent optimistic rollback. Same class applies to portfolio holding/transaction deletes.
- Consider typing category/account update inputs to exclude `user_id`. Same applies to `updateHoldingTransaction` (caller-supplied updates are not stripped of `user_id`/`holding_id`/`created_at`; only safe fields are sent by the current form).
- Consider a small icon-map drift test for `CATEGORY_ICONS` vs the internal icon map.
- Settings roadmap: dark mode/theme, CSV export, display name, week/month-start preferences, MFA/session management, delete account.
- Optional tooling cleanup: replace broken `npm run lint` script or add an ESLint config.
- Optional Vitest cleanup: remove the non-failing native config warning by moving config to `.mjs` or setting package/module configuration intentionally.
- Portfolio: holdings are deleted when a user deletes the holding (cascades transactions); consider warning before deletion (UI already confirms).
- Portfolio: the portfolio chart multiplies each holding's current total shares across its entire history range (spec-mandated model; do not "fix" without updating the spec).
- Portfolio: holdings created before currency auto-detection may have the wrong stored `currency` (USD default); no backfill was built. Consider a per-holding currency edit action.
- Market data: Yahoo rate limits; in-memory cache is per server instance. If multi-instance, consider a shared cache.
- Net worth: if the user changes their display currency, existing entry values are re-labeled (not converted), matching the app-wide no-FX behavior. Value rows are stored per-entry, so the chart reflects values as of each recorded date.

## 8. Token-Saving / Ignore Guidance

Do not inspect these unless directly relevant to the task:

- `node_modules/`, `.next/`, `out/`, `build/`, `dist/`
- `package-lock.json` unless dependency resolution is the task
- `tsconfig.tsbuildinfo`, `next-env.d.ts`
- `types/database.ts` unless DB typing/schema work is involved
- `.superpowers/sdd/` except when resuming or auditing subagent-driven work
- Large generated/log/data files (`*.log`, `*.sqlite`, `*.db`, `*.csv`, `*.jsonl`, `*.ndjson`, archives)

Important JSON config files such as `package.json`, `tsconfig.json`, `components.json`, and `next.config.mjs` should remain visible; do not blanket-ignore `*.json`.

## 9. Maintenance Rule

After a major feature, bug fix, or database migration, update this file only with durable information:

- current architecture or command changes
- new migration state / remote application requirements
- new known follow-ups
- changed conventions that future agents must follow

Do not append long chronological implementation logs. Prefer specs/plans in `docs/superpowers/` and git history for detailed narratives.
