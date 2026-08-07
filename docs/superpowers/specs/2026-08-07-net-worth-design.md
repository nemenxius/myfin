# Independent Net Worth Tracking — Design

Date: 2026-08-07

## Overview

Add a Net Worth module to MyFin that is completely independent from accounts,
transactions, and portfolio data. Users manually maintain a list of assets and
liabilities (with current values). The system computes `Net Worth = Total Assets
- Total Liabilities`, tracks historical evolution via database snapshots, and
displays everything on a dedicated dashboard route.

## Scope

- Database: `net_worth_entries` + `net_worth_snapshots` tables with RLS and a
  snapshot trigger (migration `008_net_worth.sql`).
- Logic: pure helpers in `lib/net-worth/math.ts` with Vitest coverage.
- Data hooks: TanStack Query hook `hooks/use-net-worth.ts` with optimistic
  updates (matching `useAccounts`/`useCategories`).
- UI: `/dashboard/net-worth` route; summary cards, evolution AreaChart, and
  per-type entry lists with a shared create/edit dialog.
- Types: hand-edit `types/database.ts` (Supabase CLI is not installed).

## Out of Scope

- FX conversion (explicitly out of scope per AGENTS.md). Entries are **restricted
  to the profile display currency** — no per-entry currency picker.
- Synchronizing accounts/holdings/transactions into net worth.
- Manual snapshot creation (snapshots are recorded automatically by a trigger and
  are read-only to the client).
- Delete-mutation failure UI feedback (same class as existing accounts/holdings
  deletes; a known follow-up, not this feature).

## Decisions

1. **Single entries table with a `type` discriminator.** Mirrors how the codebase
   uses string CHECK constraints (`account_type`, `transaction_type`,
   `asset_type`). One table, one hook, one form, one RLS policy set, one query
   filtered by `entry_type` — versus two near-identical tables.
2. **Snapshot mechanism: DB trigger.** `record_net_worth_snapshot()` fires AFTER
   INSERT/UPDATE/DELETE on `net_worth_entries`, recomputes the user's totals, and
   inserts a snapshot row only when the net worth differs from the latest
   snapshot (dedupe). Runs `SECURITY DEFINER` in the same transaction as the
   write, so history is guaranteed accurate for every write path. The equivalent
   dedupe/totals logic is mirrored in `lib/net-worth/math.ts` and unit-tested.
3. **Currency restricted to display currency.** At creation the hook stores the
   current profile display currency on the row; the UI never exposes a currency
   field. Totals and the chart are always labeled in the current display
   currency. If the user later changes display currency, existing values are
   re-labeled (not converted), consistent with existing app behavior.
4. **Migration number** `008_net_worth.sql` (007 exists; 006/007 are not yet
   applied remotely — 008 is independent of them).

## Database Schema

### `net_worth_entries`

| column      | type                       | notes                                    |
| ----------- | -------------------------- | ---------------------------------------- |
| id          | uuid PK default gen_random_uuid() |                                 |
| user_id     | uuid NOT NULL              | FK profiles(id) ON DELETE CASCADE        |
| entry_type  | text NOT NULL              | CHECK IN ('asset', 'liability')          |
| name        | text NOT NULL              |                                          |
| description | text                       | optional                                 |
| value       | numeric NOT NULL           | magnitude ≥ 0; liabilities subtracted in net worth |
| currency    | text NOT NULL default 'USD'| set to display currency at creation; not a UI field |
| created_at  | timestamptz default now()  |                                          |
| updated_at  | timestamptz default now()  | bumped by existing `set_updated_at()` trigger |

- Index: `idx_net_worth_entries_user_type` on `(user_id, entry_type)`.

### `net_worth_snapshots`

| column            | type                       | notes                             |
| ----------------- | -------------------------- | --------------------------------- |
| id                | uuid PK default gen_random_uuid() |                             |
| user_id           | uuid NOT NULL              | FK profiles(id) ON DELETE CASCADE |
| total_assets      | numeric NOT NULL           |                                   |
| total_liabilities | numeric NOT NULL           |                                   |
| net_worth         | numeric NOT NULL           | total_assets - total_liabilities  |
| recorded_at       | timestamptz default now()  |                                   |

- Index: `idx_net_worth_snapshots_user_date` on `(user_id, recorded_at)`.

### Snapshot trigger

`record_net_worth_snapshot()`:

- `SECURITY DEFINER` (owned by the migration owner) so RLS does not block the
  aggregate read over the user's rows.
- AFTER INSERT/UPDATE/DELETE on `net_worth_entries`; derives the acting user from
  `NEW.user_id` (or `OLD.user_id` for DELETE).
- Computes `SUM(value)` for assets and liabilities for that user.
- Inserts `(user_id, total_assets, total_liabilities, net_worth)` only if there
  is no latest snapshot, or if `net_worth` differs from the user's latest
  snapshot. The first-ever write always records the initial snapshot.
- Runs in the same transaction as the triggering write (atomic).

### RLS

- Enable RLS on both tables.
- `Users can manage own net worth entries` — `FOR ALL USING (auth.uid() = user_id)`.
- `Users can manage own net worth snapshots` — `FOR ALL USING (auth.uid() = user_id)`.
- `auth.uid()` on both INSERT/UPDATE/DELETE means a user can never read or modify
  another user's rows, and can never create a row belonging to another user.

## Logic Layer (`lib/net-worth/math.ts`)

Pure functions, no DB access (modeled on `lib/portfolio/math.ts`):

- `computeTotals(entries)` → `{ totalAssets, totalLiabilities }` — sums by
  `entry_type`; liabilities summed as positive magnitudes.
- `computeNetWorth(entries)` → `totalAssets - totalLiabilities`.
- `shouldRecordSnapshot(latest, totalAssets, totalLiabilities)` → `boolean` —
  true when `latest` is null or the net worth differs; mirrors trigger dedupe.
- `sortSnapshotsChronologically(snapshots)` → ascending by `recorded_at`, tie-break
  on `id`.
- `buildNetWorthSeries(snapshots, currency)` → chart-ready points
  `{ label, value, assets, liabilities }` (`value` = net worth, used as the
  Recharts `dataKey`; `assets`/`liabilities` feed the tooltip breakdown), sorted
  ascending, sampled down to at most ~366 points if history is very large.
- `monthDelta(netWorth, snapshots, now)` →
  `{ amount, percent } | null` — current net worth minus the snapshot recorded
  before the start of the current month; `null` when no baseline exists.

### Tests (`lib/net-worth/math.test.ts`)

- Asset total, liability total, net worth calculation.
- Net worth with zero assets / zero liabilities / multiple entries.
- Snapshot dedupe: record when changed, skip when unchanged, always record first.
- Chronological ordering of snapshots.
- Chart series assembly and downsampling.
- Month-delta baseline logic.

## Hooks (`hooks/use-net-worth.ts`)

One hook file mirroring `useAccounts`/`useCategories`. Components never call
Supabase directly. Mutations resolve `user_id` internally via `auth.getUser()`.

- `useNetWorth()` — fetches `net_worth_entries` (ordered by `name`) and
  `net_worth_snapshots` (ordered by `recorded_at`); derives and returns `entries`,
  `assets`, `liabilities`, `snapshots`, `totals` (`totalAssets`,
  `totalLiabilities`, `netWorth`), `netWorthSeries`, and `monthDelta`.
- `createEntry({ entry_type, name, description?, value })` — inserts with
  `currency` set to the current display currency and `value` clamped ≥ 0.
- `updateEntry({ id, ...updates })` — partial update; re-clamps `value`.
- `deleteEntry(id)`.

Each mutation uses optimistic `onMutate` (snapshot / apply / return previous),
`onError` rollback, and `onSettled` invalidation of **both** the entries and
snapshots queries so the chart reflects new history.

Snapshots are read-only to the client (no mutation exposed), which prevents
fabricating history.

`entry_type` is `Tables<"net_worth_entries">["entry_type"]` (string per generated
types) with local `'asset' | 'liability'` constants used by forms/UI.

## UI

### Route

`app/dashboard/net-worth/page.tsx` — server component rendering
`<NetWorthOverview />` inside `animate-fade-in-up`, like the other dashboard pages.

### Navigation

Add `{ href: "/dashboard/net-worth", label: "Net Worth" }` to `navItems` in
`components/dashboard/header.tsx` after Portfolio.

### Components (`components/net-worth/`)

#### `net-worth-overview.tsx`

Page composition: page header ("Net Worth" title + subtitle), Add Asset /
Add Liability buttons, `<NetWorthSummary />`, `<NetWorthChart />`, then Assets and
Liabilities sections (`<EntryList entryType="asset" />`,
`<EntryList entryType="liability" />`). Renders the whole-page independent empty
state when both types are empty: "Build your net worth" + "Add your first asset"
CTA, matching the account/holding empty-state styling.

#### `net-worth-summary.tsx`

Prominent net-worth figure in `font-mono tabular-nums` (money styling per
AGENTS.md), display-currency symbol, `monthDelta` line ("+€4,250 this month",
leaf/ember tone). Below: an Assets card (teal tint) and a Liabilities card
(ember tint) showing total + count, split in a 2-column grid on larger screens.

#### `net-worth-chart.tsx`

Recharts `AreaChart` cloned from `portfolio-chart.tsx` (navy/teal gradient,
CartesianGrid, currency Y-axis via `getCurrencySymbol`, responsive height,
hover tooltip). Tooltip shows Net Worth plus the assets/liabilities breakdown from
the snapshot row. Empty state: "Your net worth history will appear here as you
update your assets and liabilities." — no misleading zero chart.

#### `entry-list.tsx`

One component with an `entryType` prop. Table columns: Name (+ optional
description), Value (`font-mono tabular-nums`), row dropdown (Edit / Delete),
matching `account-list.tsx`. Header shows "Assets"/"Liabilities", entry count, and
the total. Per-type empty state ("No assets yet" / CTA). Delete uses the
AlertDialog confirm pattern. Responsive: hide secondary columns on small screens.

#### `entry-form.tsx`

Shared Dialog form for both types, cloned from `account-form.tsx`: Name
(required), Description (optional), Value (number, ≥ 0). No currency field. Used
for create and edit (title "Add Asset"/"Edit Asset"/"Add Liability"/"Edit
Liability"). Inline `submitError` box.

### Currency caveat

Entries are restricted to the display currency, so no "values are not converted"
messaging is needed — totals and the chart are inherently in the display currency.

## Error Handling

- Form submit errors render in the inline `submitError` box (account-form pattern).
- Mutations: optimistic update, rollback on error, invalidation on settle.
- Snapshot trigger failure surfaces as a write error on the triggering mutation
  (same transaction), flowing through the rollback path.

## Verification

1. `npm test` — new `lib/net-worth/math.test.ts` plus existing suite.
2. `npm run build` — type-checks and prerenders the new route.
3. Manual: responsive tables, empty states (page + chart), optimistic
   update/rollback, RLS policy spot-check.
4. Update `AGENTS.md` (architecture map + migration state + conventions).

## AGENTS.md Updates (durable only)

- Architecture map: `hooks/use-net-worth.ts`, `components/net-worth/`,
  `lib/net-worth/math.ts`, route `/dashboard/net-worth`.
- Migration state: `008_net_worth.sql` — entries + snapshots tables, snapshot
  trigger, RLS; not yet applied remotely.
- Conventions: net worth entries restricted to display currency (no FX);
  snapshots recorded automatically by DB trigger with net-worth dedupe; entries
  share a single `entry_type` table.
- Known follow-ups: display-currency changes re-label (not convert) stored
  values; snapshot history reflects only values as of each recorded write.
