# Net Worth Value History — Design

Date: 2026-08-07

## Overview

Extend the Net Worth module with per-entry value history. Today, an asset or
liability holds a single current `value`; the historical chart comes from
database snapshots that are only recorded at write time. Users who have past
net-worth information (e.g. "my bank account was worth €20k in May, €21k in
June") cannot reproduce that history in the app.

This change replaces the single-value + snapshot model with **dated value rows
per entry**. Each asset/liability has a timeline of `(as_of date, value)`
points. Net worth at any date is reconstructed by summing each entry's latest
value at-or-before that date. The snapshots table and trigger are removed
entirely; history is computed deterministically from value rows.

## Scope

- Database: migration `009_net_worth_value_history.sql` that (1) wipes existing
  008 test data, (2) drops the snapshots table + `record_net_worth_snapshot()`
  trigger/function, (3) drops `net_worth_entries.value`, and (4) adds the
  `net_worth_entry_values` table with RLS.
- Logic: rewrite `lib/net-worth/math.ts` helpers to reconstruct from value rows;
  rewrite its Vitest suite.
- Data hooks: extend `hooks/use-net-worth.ts` with value-row CRUD
  (`addValue` / `updateValue` / `deleteValue`) and metadata-only entry updates.
- UI: repurpose `entry-form.tsx` as a value-history editor (single dialog with
  Name/Description fields plus a dated value-rows table).
- Types: hand-edit `types/database.ts` (Supabase CLI is not installed).

## Out of Scope

- FX conversion (unchanged; entries remain restricted to the display currency).
- Linking accounts/transactions/portfolio into net worth.
- Backfilling historical data from external sources.
- Any migration of real user data: the 009 TRUNCATE intentionally wipes 008
  test data only (user confirmed only test data exists).

## Decisions

1. **Value history is a separate one-to-many table.** `net_worth_entry_values`
   (entry_id, as_of, value) — one row per dated value point, UNIQUE
   `(entry_id, as_of)`. Mirrors how the codebase keeps child tables
   (`holding_transactions`) and keeps the entry row itself light.
2. **Current value is derived, not stored.** An entry's current value is the
   latest `as_of` value row. There is no separate "current value" field.
3. **History is reconstructed, not snapshotted.** The `net_worth_snapshots`
   table, the `record_net_worth_snapshot()` SECURITY DEFINER trigger, and the
   snapshot helpers (`shouldRecordSnapshot`, `sortSnapshotsChronologically`)
   are removed. The chart is computed from value rows, which makes backfilling
   past dates work naturally.
4. **Reconstruction model:** for every unique `as_of` date across all of a
   user's value rows, net worth = sum over entries of each entry's latest value
   at-or-before that date. Entries with no value at-or-before a date contribute
   nothing at that date. This is deterministic and unit-testable.
5. **RLS on the values table checks the parent entry.** Policies use
   `EXISTS (SELECT 1 FROM net_worth_entries e WHERE e.id = entry_id AND
   e.user_id = auth.uid())`. The client never sends `user_id`.
6. **Value rows use full dates.** `as_of` is a `date`, not a month, so
   intra-month updates are precise; the chart can still group by month.
7. **Creating an entry requires a first value row.** The create form collects
   Name, Description, and an initial date (default today) + value. No
   "entry with no values" empty state exists.
8. **One dialog for editing.** The value-history editor is a single dialog:
   Name + Description at the top, the dated value-rows table below with
   add/edit/delete row actions.
9. **Migration numbering.** 008 is already applied remotely, so this change is
   migration `009_net_worth_value_history.sql`. The user will run it via the
   Supabase dashboard SQL editor.

## Database Schema (after 009)

### `net_worth_entries` (modified)

| column      | type                       | notes                                    |
| ----------- | -------------------------- | ---------------------------------------- |
| id          | uuid PK default gen_random_uuid() |                                 |
| user_id     | uuid NOT NULL              | FK profiles(id) ON DELETE CASCADE        |
| entry_type  | text NOT NULL              | CHECK IN ('asset', 'liability')          |
| name        | text NOT NULL              |                                          |
| description | text                       | optional                                 |
| currency    | text NOT NULL default 'USD'| set to display currency at creation; not a UI field |
| created_at  | timestamptz default now()  |                                          |
| updated_at  | timestamptz default now()  | bumped by `set_updated_at()` trigger     |

`value` column is **dropped**.

### `net_worth_entry_values` (new)

| column      | type                       | notes                             |
| ----------- | -------------------------- | --------------------------------- |
| id          | uuid PK default gen_random_uuid() |                             |
| entry_id    | uuid NOT NULL              | FK net_worth_entries(id) ON DELETE CASCADE |
| as_of       | date NOT NULL              | the date this value applies to    |
| value       | numeric NOT NULL           | magnitude ≥ 0; clamped app-side    |
| created_at  | timestamptz default now()  |                                   |
| updated_at  | timestamptz default now()  | bumped by `set_updated_at()` trigger |

- UNIQUE `(entry_id, as_of)` — one value per item per date.
- Index `idx_net_worth_entry_values_entry_date` on `(entry_id, as_of)`.
- Index on `(as_of)` optional for chart reconstruction scans.

### Migration 009 steps (in order)

1. `TRUNCATE net_worth_snapshots; TRUNCATE net_worth_entries;` — wipes 008 test
   data (user-confirmed).
2. `DROP TRIGGER net_worth_entries_record_snapshot ON net_worth_entries;`
   `DROP FUNCTION record_net_worth_snapshot();` `DROP TABLE net_worth_snapshots;`
3. `ALTER TABLE net_worth_entries DROP COLUMN value;`
4. `CREATE TABLE net_worth_entry_values (...);` with UNIQUE constraint, indexes,
   and the `set_updated_at` BEFORE UPDATE trigger.
5. Enable RLS; add policies:
   - `Users can manage own entry values` — `FOR ALL USING (EXISTS (SELECT 1 FROM
     net_worth_entries e WHERE e.id = entry_id AND e.user_id = auth.uid()))`
   - (INSERT/UPDATE/DELETE enforce the same EXISTS via the USING clause.)
6. Indexes as above.

## Logic Layer (`lib/net-worth/math.ts`)

Pure functions, no DB access. Rewritten from snapshot-based to value-row-based.

```ts
interface ValueRowLike {
  entry_id: string;
  as_of: string; // YYYY-MM-DD
  value: number;
}

interface NetWorthEntryLike {
  id: string;
  entry_type: string; // 'asset' | 'liability'
  values: ValueRowLike[];
}
```

- `entryCurrentValue(entry)` → the latest `as_of` value row's value; `null` when
  the entry has no rows.
- `valueAsOf(entry, date)` → the entry's value at-or-before `date`; `null` when
  none exists.
- `computeTotals(entries, asOf = today)` → `{ totalAssets, totalLiabilities }`
  summing each entry's `valueAsOf(entry, asOf)` (entries with no value at or
  before `asOf` contribute nothing).
- `computeNetWorth(entries, asOf = today)` → `totalAssets - totalLiabilities`.
- `collectValueDates(entries)` → sorted unique `as_of` dates across all entries.
- `buildNetWorthSeries(entries)` → for each unique date (ascending), compute
  assets/liabilities/net-worth as of that date → `{ label, value, assets,
  liabilities }[]`, downsampled to ≤ 366 points if history is very large.
- `monthDelta(entries, now = new Date())` → `{ amount, percent } | null` —
  current net worth minus the series point at the last date strictly before the
  current month start; `null` when no baseline exists.

Removed: `shouldRecordSnapshot`, `sortSnapshotsChronologically`,
`NetWorthSnapshotLike`. `NetWorthSeriesPoint` and `MonthDelta` shapes are
unchanged.

### Tests (`lib/net-worth/math.test.ts`, rewritten)

- `entryCurrentValue` (latest row; no rows → null; tie on date → deterministic).
- `valueAsOf` (at-or-before lookup; before-first-date → null).
- `computeTotals`/`computeNetWorth` with a given as-of date, with and without
  `asOf`, mixed entry types, entries with no applicable value.
- `collectValueDates` ordering and dedupe.
- `buildNetWorthSeries` reconstruction correctness and downsampling.
- `monthDelta` baseline logic (prior-month baseline, no baseline → null).

## Hooks (`hooks/use-net-worth.ts`)

Same public surface for consumers; internals switch from snapshots to value rows.

- `useNetWorth()` — fetches `net_worth_entries` (ordered by `name`) and
  `net_worth_entry_values` (ordered by `as_of`), joins client-side by
  `entry_id`. Returns `entries` (each with nested `values` sorted by `as_of`),
  `assets`, `liabilities`, `totals`, `netWorth`, `netWorthSeries`, `monthDelta`.
- `createEntry({ entry_type, name, description?, initialValue, initialAsOf })` —
  inserts the entry (currency = display currency, value clamped ≥ 0) **and** its
  first value row atomically.
- `updateEntry({ id, name, description? })` — metadata only; value editing is
  via the value-row mutations.
- `deleteEntry(id)` — value rows cascade via FK.
- `addValue(entryId, { as_of, value })` — appends a history row.
- `updateValue({ id, as_of, value })` — edits an existing row's date/value.
- `deleteValue(id)` — removes a row.

All mutations use optimistic `onMutate` (snapshot / apply / return previous),
`onError` rollback, and `onSettled` invalidation of the combined entries+values
key so the chart reflects new history. `user_id` is resolved internally via
`auth.getUser()`; callers never pass it.

## UI

### `entry-form.tsx` → value-history editor

Repurposed as the single dialog for create and edit:

- **Create mode:** Name (required), Description (optional), and a first value
  row — Date (default today) + Value (number, ≥ 0). Submit creates the entry
  with its first value row.
- **Edit mode:** Name + Description fields at the top, plus a table of value
  rows (Date, Value, row actions). Rows can be added, edited inline, or
  deleted. At least one row must remain (or the entry can be deleted from the
  list).
- Dialog title reflects mode/type: "Add Asset", "Edit Asset", "Add Liability",
  "Edit Liability". Inline per-field errors + `submitError` box, matching the
  `account-form.tsx` pattern.

### `entry-list.tsx`

Unchanged structure (Name, current value, Edit/Delete dropdown). Current value
comes from `entryCurrentValue()`. "Edit" opens the value-history editor.

### `net-worth-overview.tsx`, `net-worth-summary.tsx`, `net-worth-chart.tsx`

Unchanged; they consume the same hook surface. The chart now renders the
reconstructed history line. Empty states unchanged.

## Error Handling

- Form submit errors render in the inline `submitError` box (account-form
  pattern).
- Mutations: optimistic update, rollback on error, invalidation on settle.
- FK/UNIQUE conflicts (e.g. duplicate `(entry_id, as_of)`) surface as mutation
  errors flowing through the rollback path.

## Verification

1. `npm test` — rewritten `lib/net-worth/math.test.ts` plus existing suite.
2. `npm run build` — type-checks and prerenders `/dashboard/net-worth`.
3. Manual smoke: create asset with first row; add/edit/delete history rows;
   chart shows reconstructed line; current value = latest row; delete entry
   cascades rows; mobile layout; nav active state.
4. Run migration 009 remotely via the Supabase dashboard SQL editor.
5. Update `AGENTS.md` (migration state + architecture map + feature state).

## AGENTS.md Updates (durable only)

- Migration state: `009_net_worth_value_history.sql` — replaces 008's snapshot
  model with `net_worth_entry_values`; TRUNCATEs existing test data; drops
  snapshots table/trigger and `entries.value`; not yet applied remotely. 008 is
  already applied remotely.
- Architecture map: `hooks/use-net-worth.ts`, `components/net-worth/`,
  `lib/net-worth/math.ts`, route `/dashboard/net-worth` (unchanged paths).
- Feature state: net worth uses per-entry dated value rows; history is
  reconstructed client-side; no snapshots.
- Known follow-ups: display-currency changes re-label (not convert) stored
  values; entries with no value rows render as "no value yet" only during
  optimistic create.
