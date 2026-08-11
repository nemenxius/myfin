# Demo Account — Design

Date: 2026-08-11

## Overview

Give visitors a way to explore the full MyFin app **without registering**:
a "Try demo" entry point signs them into a **private, throwaway anonymous
sandbox** (Supabase anonymous sign-in) pre-seeded with coherent, realistic
demo data spanning ~6 months across all five data areas (accounts,
transactions, portfolio, net worth, categories). Each visitor gets their own
isolated instance; the account and all its data are **permanently purged**
when they sign out and swept up after 24h of inactivity if they abandon the
session.

The implementation is **DB-native**: three `SECURITY DEFINER` SQL functions
(seed / purge-self / sweep) plus a `pg_cron` job, versioned in a migration.
No service-role key is introduced into the application.

## Scope

- Database: migration `011_demo_account.sql` — `seed_demo_data()`,
  `purge_demo_user()`, `purge_stale_demo_users()` (hardened `SECURITY
  DEFINER`), explicit grants, and an hourly `pg_cron` sweep job.
- Demo seed data: all five areas, EUR only, dates relative to `CURRENT_DATE`
  so the demo always looks recent and populated.
- Client: "Try demo" CTAs on the landing hero, landing header, and auth page;
  a demo banner in the dashboard; demo-aware sign-out (purge); demo-aware
  user-menu label; defensive guards against hijacking a real session.
- Docs: one-time Supabase setup steps (anonymous sign-ins + `pg_cron`) and
  `AGENTS.md` updates.

## Out of Scope

- Converting an anonymous demo session into a real account (no signup funnel).
- Any schema changes beyond the three functions + cron job (no new tables,
  no columns, no types regeneration).
- FX conversion (unchanged — demo data is single-currency EUR by design).
- Rate limiting / abuse controls beyond Supabase's built-in anonymous sign-in
  limits (documented, not custom-built).
- Changes to existing RLS policies; the functions rely on FK cascades and
  existing policies.

## Decisions

1. **Private sandbox per visitor via Supabase anonymous sign-in.**
   `signInAnonymously()` creates a real auth user with
   `app_metadata.is_anonymous = true`. RLS, hooks, and the proxy work
   unchanged because the visitor is a normal authenticated user. Anonymous
   users carry no email, so they never trigger the email-confirmation flow.
2. **DB-native implementation (functions + cron), not an API/service-role
   layer.** Matches the project's raw-SQL migration style and avoids
   introducing `SUPABASE_SERVICE_ROLE_KEY` into the app. Seeding and purging
   run inside the database with `postgres` privileges; the client only calls
   `rpc()`.
3. **Hardened `SECURITY DEFINER` functions.**
   - `ALTER FUNCTION ... SET search_path = ''` (empty search path) with
     **fully-qualified identifiers** everywhere (`public.accounts`,
     `auth.uid()`, `cron.schedule`, …). Stricter than the existing
     `SET search_path = public` convention (008); preferred here per user
     requirement.
   - `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC;` and explicit grants:
     `seed_demo_data()` and `purge_demo_user()` → `GRANT EXECUTE TO
     authenticated`; `purge_stale_demo_users()` → **no grant** (owner-only;
     invoked by the cron job as `postgres`).
   - **Fail-closed anonymous guard** inside `seed_demo_data()` and
     `purge_demo_user()`: raise unless `auth.uid()` is non-null **and** the
     JWT is anonymous (`auth.jwt() -> 'app_metadata' ->> 'is_anonymous' =
     'true'`, accepting the top-level `is_anonymous` claim too). A real
     (non-anonymous) user can never seed or purge anything through these
     functions.
   - `purge_demo_user()` deletes only `auth.users WHERE id = auth.uid()` —
     the caller's own id from the JWT, never an arbitrary target. FK cascade
     removes all application data (all tables reference `profiles(id)` /
     `auth.users` with `ON DELETE CASCADE`).
4. **Idempotent seeding without a schema marker.** `seed_demo_data()`
   early-returns if the user already has any account (`IF EXISTS (SELECT 1
   FROM public.accounts WHERE user_id = auth.uid())`). No
   `demo_seeded_at` column — idempotency is determined from existing demo
   data (user-confirmed preference; avoids schema for convenience).
5. **24h inactivity sweep using `auth.sessions.updated_at`, not
   `last_sign_in_at`.** The sweep deletes anonymous users with no session
   refreshed in the last 24h — more accurate for "genuinely inactive".
   Scheduled hourly via `pg_cron` (jobname `purge-stale-demo-users`,
   unschedule-before-schedule for idempotent migration application).
6. **All-EUR demo dataset.** MyFin does not perform FX conversion and sums
   multi-currency totals raw; a single-currency demo keeps every aggregate
   card, chart, and ledger coherent. `profiles.display_currency = 'EUR'` is
   set by the seed **before** the client navigates to `/dashboard` so
   `OnboardingGate` passes and demo users never see onboarding.
7. **Per-area internal coherence only.** Account balances, transactions,
   portfolio, and net worth are each realistic on their own but are not
   mathematically linked: Net Worth is intentionally independent of
   accounts/transactions/portfolio (documented app architecture).
8. **Seeding runs before navigation; a mount-time re-check covers reloads.**
   The "Try demo" handler awaits `signInAnonymously()` → `rpc('seed_demo_data')`
   → then navigates. A client-side mount effect in the demo banner re-calls
   the idempotent seed after a hard reload (e.g., sweep survivor re-auth) so
   the dashboard never mounts without data.
9. **Defensive session guard, not just hidden buttons.** The demo CTA is
   hidden when a session exists **and** the handler itself refuses to call
   `signInAnonymously()` if `user` is present — `signInAnonymously()` would
   otherwise replace a real user's active session.
10. **Seed failure cleanup is best-effort; the user sees the original
    error.** If seeding fails, the handler attempts purge + sign-out
    (errors swallowed) to avoid stranding an empty sandbox, then surfaces the
    **original seed error** to the visitor, not the cleanup result.
11. **Demo sign-out is destructive by design.** For anonymous users,
    `signOut()` first calls `purge_demo_user()` (permanent deletion) and then
    signs out. This is documented in the spec and `AGENTS.md`, and reflected
    in the banner copy ("Changes you make here won't be saved permanently.").

## Database Layer (migration `011_demo_account.sql`)

All functions `LANGUAGE plpgsql SECURITY DEFINER`, `SET search_path = ''`,
fully-qualified identifiers.

### `public.seed_demo_data()`

```text
Guard: auth.uid() IS NULL            -> raise exception (fail closed)
Guard: JWT not anonymous             -> raise exception (fail closed)
Idempotency: any account exists      -> RETURN (no-op)
Steps:
 1. Insert 3 accounts (EUR) with RETURNING ids.
 2. Insert ~30-33 transactions over the past 6 months referencing those
    account ids and the global categories (looked up by name; NULL
    category if a global row is missing).
 3. Insert 3 portfolio holdings (EUR) + 5 buy/dividend transactions with
    transacted_at dates spread over the past 6 months.
 4. Insert 5 net worth entries (3 assets + 2 liabilities, EUR) and for
    each a monthly value row at the last day of each of the past 6 months
    (unique (entry_id, as_of) respected).
 5. UPDATE profiles SET display_currency = 'EUR',
    default_account_id = <checking id>, default_category_id = <Food id>
    WHERE id = auth.uid().
Grants: REVOKE FROM PUBLIC; GRANT EXECUTE TO authenticated.
```

See **Seed Dataset** below for exact rows.

### `public.purge_demo_user()`

```text
Guard: auth.uid() IS NULL            -> raise exception (fail closed)
Guard: JWT not anonymous             -> raise exception (fail closed)
DELETE FROM auth.users WHERE id = auth.uid();  -- FK cascade wipes all data
Grants: REVOKE FROM PUBLIC; GRANT EXECUTE TO authenticated.
```

### `public.purge_stale_demo_users()`

```text
DELETE FROM auth.users u
WHERE u.raw_app_meta_data ->> 'is_anonymous' = 'true'
  AND NOT EXISTS (
    SELECT 1 FROM auth.sessions s
    WHERE s.user_id = u.id AND s.updated_at > now() - interval '24 hours'
  );
Grants: REVOKE FROM PUBLIC; (no grant — owner-only, run by cron as postgres)
```

### `pg_cron` job

```sql
SELECT cron.unschedule('purge-stale-demo-users')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-stale-demo-users');

SELECT cron.schedule('purge-stale-demo-users', '0 * * * *',
                     $$SELECT public.purge_stale_demo_users()$$);
```

Requires the `pg_cron` extension (one-time dashboard enable, see Setup).

## Seed Dataset (all EUR, dates relative to `CURRENT_DATE`)

### Accounts (3)

| name          | account_type | initial_balance |
| ------------- | ------------ | --------------- |
| Main Checking | checking     | 2500.00         |
| Savings       | savings      | 8000.00         |
| Cash          | cash         | 150.00          |

`profiles.default_account_id` → Main Checking; `default_category_id` → Food.

### Transactions (~30-33, past 6 months)

- Salary **+2600** (Income / Salary) on the 25th of each month ×6.
- Rent **-950** (Expense / Rent) on the 1st of each month ×6.
- Utilities **-70..-110** (Expense / Utilities), varies per month ×6.
- Food/restaurant **-60..-180** (Expense / Food), ~8-10 rows spread across
  the months.
- Investment Income **+40..+60** (Income / Investment Income) ×2-3.
- Transfers Main Checking → Savings **-500** each (`to_account_id` set) ×2.

All balances stay positive; the running-balance ledger reads coherently.
`transaction_type` values: `Income` / `Expense` / `Transfer`.

### Portfolio (3 holdings, EUR)

| symbol   | name                                          | asset_type | transactions (past 6 months)            |
| -------- | --------------------------------------------- | ---------- | --------------------------------------- |
| EUNL.DE  | iShares Core MSCI World UCITS ETF             | etf        | 3 buys (10/10/5 shares, rising prices) + 1 dividend |
| VWCE.DE  | Vanguard FTSE All-World UCITS ETF             | etf        | 2 buys (8/6 shares)                     |
| BTC      | Bitcoin                                       | crypto     | 2 buys (0.05/0.02 BTC, rising prices)   |

Holding `currency = 'EUR'`. Current values render from **live market data**
at view time; if quotes are unavailable the views must degrade gracefully
(no crashes — see Verification item 7).

### Net worth (5 entries, EUR, 6 monthly value rows each)

Month-end dates for each of the past 6 months; latest row = current value
(evolution chart shows a 6-point series).

| entry          | entry_type | category        | values (oldest → newest)       |
| -------------- | ---------- | --------------- | ------------------------------ |
| Emergency fund | asset      | Money           | 9000 → 10500 (growing)         |
| Investments    | asset      | Stock Exchange  | 14000 → 16200 (up with small dips) |
| PPR            | asset      | PPR             | 4000 → 4400 (steady growth)    |
| Credit card    | liability  | —               | 1200 → 400 (paying down)       |
| Personal loan  | liability  | —               | 18000 → 17600 (slow decrease)  |

Net worth ≈ +13k and trending up. Uses the current
`net_worth_entry_values` architecture (per-entry dated value rows) — the old
snapshots model was removed in 009 and is not reintroduced.

## Client UX

### `components/demo/try-demo-button.tsx` (new, "use client")

- Renders `null` when `useAuth().user` is present (landing is public; a
  signed-in visitor must not see the demo CTA).
- Handler:
  1. **Defensive guard**: if a session exists (`user` truthy), return — never
     call `signInAnonymously()` over a real session.
  2. `signInAnonymously()` — on error: inline error, stop.
  3. `rpc('seed_demo_data')` — on error: best-effort cleanup
     (`rpc('purge_demo_user')` and `auth.signOut()`, errors swallowed), then
     show the **original seed error** inline, stop.
  4. `router.push('/dashboard')` + `router.refresh()`.
- Loading state while running; compact inline error display.

### Entry points

- Landing hero (`components/landing/hero.tsx`): "Try demo" button alongside
  "Create free account" / "Sign in".
- Landing header (`components/landing/header.tsx`): outline "Try demo"
  button.
- Auth page (`components/auth/auth-form.tsx`): "Explore the demo →" link
  below the card.

### `components/demo/demo-banner.tsx` (new, "use client")

- Mounted in `app/dashboard/layout.tsx` inside `OnboardingGate`.
- Visible only when `user.is_anonymous`.
- Copy: "You're exploring a temporary MyFin demo. Changes you make here won't
  be saved permanently." + **Exit demo** button (sign-out with purge, then
  `router.push('/')`).
- **Mount-time re-seed safety net**: on mount, if `user.is_anonymous`, call
  `rpc('seed_demo_data')` (idempotent) and invalidate TanStack queries so a
  hard reload always ends up with data.

### `hooks/use-auth.tsx` (modified)

- `signOut()`: if the current user is anonymous, `await
  rpc('purge_demo_user')` (errors swallowed) before
  `supabaseClient.auth.signOut()`. Documented behavior: **anonymous sign-out
  permanently deletes the demo sandbox**.

### `components/auth/user-menu.tsx` (modified)

- Label shows "Demo account" for anonymous users instead of
  `user?.email ?? "Account"`.

## Error Handling

- Anonymous sign-in disabled/rate-limited → inline error on the demo CTA;
  visitor stays on the landing page.
- Seed failure → best-effort cleanup (purge + sign-out, swallowed) + the
  original seed error shown inline. No empty sandbox is stranded.
- Sweep deletes a still-open tab (>24h idle) → subsequent data fetches fail;
  app shows its normal query error states until the visitor reloads (proxy
  then redirects to the landing page). Documented limitation; the demo
  banner's Exit demo also clears the state.
- Repeated "Try demo" clicks / reloads → idempotent seed, no duplicates.
- Market-data outage → portfolio views degrade without crashing (verify, see
  Verification 7); existing app behavior, no new failure modes.

## Verification

1. `npm run build` — type-checks and prerenders all affected routes.
2. `npm test` — existing suite still passes.
3. Manual QA checklist (fresh incognito session against the live project):
   - Landing → "Try demo" → dashboard; all five areas populated: accounts
     list, transactions ledger + month selector (6 months of history),
     portfolio holdings + transactions + charts, net worth entries with a
     populated evolution chart, categories visible.
   - Ledger running balance reads coherently; month selector shows
     populated months.
   - Make an edit (add a transaction, delete a holding, add a net worth
     value) — banner remains visible, edits apply.
   - **Exit demo / sign out** → landing; anonymous user purged (SQL:
     `SELECT count(*) FROM auth.users WHERE raw_app_meta_data ->> 'is_anonymous' = 'true'`
     → 0 after a fresh sign-out; or re-entering demo yields a fresh sandbox).
   - **Idempotency**: call `seed_demo_data()` twice in one session → no
     duplicate rows.
   - **Real-user scenario**: sign in with a real account → visit `/` → demo
     CTAs are hidden; a direct attempt to run the demo handler does not swap
     the session (guard).
   - **Market-data unavailable scenario**: block outbound calls to the market
     data providers → portfolio and holding charts degrade gracefully
     without crashing.
   - **Sweep**: call `purge_stale_demo_users()` manually → removes only
     anonymous users with no session updated in 24h; an active demo session
     is untouched.
4. Apply migration 011 remotely via the Supabase dashboard SQL editor (after
   the one-time setup below).
5. Update `AGENTS.md` (migration state + feature state + setup).

## One-Time Supabase Setup (required before the demo works)

1. **Enable anonymous sign-ins** — Dashboard → Authentication → Providers →
   *Anonymous sign-ins* → enable. (Project setting, not SQL; anonymous
   sign-ins are also rate-limited per IP by Supabase by default.)
2. **Enable `pg_cron`** — Dashboard → Database → Extensions → enable
   `pg_cron` (the migration also issues `CREATE EXTENSION IF NOT EXISTS
   pg_cron`).
3. **Apply migration `011_demo_account.sql`** via the dashboard SQL editor
   (as with previous migrations).
4. No type regeneration needed (no table changes).

## AGENTS.md Updates (durable only)

- Migration state: `011_demo_account.sql` — hardened `SECURITY DEFINER`
  functions `seed_demo_data()` / `purge_demo_user()` /
  `purge_stale_demo_users()` + hourly `pg_cron` sweep; requires anonymous
  sign-ins enabled in the dashboard; no schema/table changes.
- Architecture map: `components/demo/try-demo-button.tsx`,
  `components/demo/demo-banner.tsx`.
- Feature state: demo account (anonymous sandbox, pre-seeded all-EUR data,
  permanent purge on sign-out, 24h inactivity sweep); document that
  anonymous sign-out deletes the sandbox.
- Known follow-ups: none new (rate limits are Supabase-managed).
