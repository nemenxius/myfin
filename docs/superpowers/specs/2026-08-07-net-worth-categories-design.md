# Net Worth Asset Categories — Design

Date: 2026-08-07

## Overview

Add optional **categories** to Net Worth **assets**. The module ships with four
read-only global default categories — Money, P2P, Stock Exchange, PPR — and each
user can create/edit/delete their own custom categories. A category is a label
(icon + name) shown as a badge on each asset row and picked in the add/edit
asset dialog. Liabilities are unaffected.

This mirrors the existing transaction `categories` pattern: a dedicated table
where `user_id IS NULL` means global/read-only and non-null means user-owned.

## Scope

- Database: migration `010_net_worth_categories.sql` that (1) creates
  `net_worth_categories`, (2) adds nullable `category_id` to
  `net_worth_entries`, (3) tightens `net_worth_entries` RLS so `category_id`
  must be global or owned, and (4) adds global default rows to `seed.sql`.
- Data hooks: new `hooks/use-net-worth-categories.ts` (CRUD, mirrors
  `use-categories`).
- UI: category Select in `entry-form.tsx` (assets only), Category badge column
  in `entry-list.tsx` (assets only), and a Net Worth categories card in
  Settings with a `NetWorthCategoryList` component.
- Types: hand-edit `types/database.ts` (Supabase CLI is not installed).

## Out of Scope

- Categories for Liabilities.
- Grouping/sorting assets by category, category subtotals, or filtering.
- Changes to the net worth chart or summary (categories are labels only).
- FX conversion (unchanged).

## Decisions

1. **Dedicated `net_worth_categories` table.** Do not reuse `categories` — the
   two taxonomies are unrelated, and reuse would leak transaction categories
   (Food, Rent, …) into the asset picker and require filtering everywhere.
2. **`user_id IS NULL` = global/read-only.** Same semantics as `categories`.
   The four defaults are global rows, shown read-only with a "Global" badge.
3. **`category_id` is nullable with `ON DELETE SET NULL`.** Category is optional;
   deleting a category leaves its assets uncategorized instead of deleting them.
4. **Categories are assets-only.** The `net_worth_categories` table has no
   `entry_type` column; every category is an asset category. Liability entries
   never reference one.
5. **RLS hardening on `net_worth_entries`.** Existing policy is
   `FOR ALL USING (auth.uid() = user_id)`. Add a `WITH CHECK` clause (on
   INSERT/UPDATE) so `category_id`, when set, must reference a global category
   (`user_id IS NULL`) or one owned by `auth.uid()`. Cheap here because the
   migration is not yet applied remotely; addresses a long-standing follow-up
   for this table.
6. **Default icons.** Money→`Banknote`, P2P→`Handshake`, Stock Exchange→
   `CandlestickChart`, PPR→`PiggyBank` (verified present in installed
   `lucide-react`). Users picking a custom category reuse the existing Lucide
   icon picker from `category-form.tsx`.
7. **Seeding lives in `seed.sql`.** Consistent with the existing global
   `categories` seed. Global rows are inserted idempotently via `ON CONFLICT
   DO NOTHING` on a unique `name` guard.
8. **Migration numbering.** 009 is not yet applied remotely, so this change is
   migration `010_net_worth_categories.sql`, applied after 009 via the Supabase
   dashboard SQL editor.

## Database Schema (after 010)

### `net_worth_categories` (new)

| column     | type                        | notes                                |
| ---------- | --------------------------- | ------------------------------------ |
| id         | uuid PK default gen_random_uuid() |                                |
| user_id    | uuid nullable               | NULL = global default; FK profiles(id) ON DELETE CASCADE |
| name       | text NOT NULL               |                                      |
| icon       | text NOT NULL               | Lucide slug                          |
| created_at | timestamptz default now()   |                                      |
| updated_at | timestamptz default now()   | bumped by `set_updated_at()`         |

- Index `idx_net_worth_categories_user_id` on `(user_id)`.
- RLS:
  - `Users can read global and own net worth categories` — `FOR SELECT USING
    (user_id IS NULL OR user_id = auth.uid())`.
  - `Users can create own net worth categories` — `FOR INSERT WITH CHECK
    (user_id = auth.uid())`.
  - `Users can update own net worth categories` — `FOR UPDATE USING
    (user_id = auth.uid())`.
  - `Users can delete own net worth categories` — `FOR DELETE USING
    (user_id = auth.uid())`.
- `set_updated_at` BEFORE UPDATE trigger.

### `net_worth_entries` (modified)

| column      | type                        | notes                                |
| ----------- | --------------------------- | ------------------------------------ |
| …           | (existing columns unchanged)|                                      |
| category_id | uuid nullable               | FK net_worth_categories(id) ON DELETE SET NULL |

- Existing `FOR ALL USING (auth.uid() = user_id)` policy gains a `WITH CHECK`
  clause (INSERT/UPDATE): `category_id IS NULL OR category_id IN (SELECT id
  FROM net_worth_categories WHERE user_id IS NULL OR user_id = auth.uid())`.
  Implemented by replacing the single ALL policy with separate INSERT / SELECT
  / UPDATE / DELETE policies so the INSERT/UPDATE `WITH CHECK` can differ from
  the SELECT/UPDATE `USING`.

### Seed (`supabase/seed.sql`)

```sql
INSERT INTO net_worth_categories (name, icon)
SELECT name, icon FROM (VALUES
  ('Money', 'Banknote'),
  ('P2P', 'Handshake'),
  ('Stock Exchange', 'CandlestickChart'),
  ('PPR', 'PiggyBank')
) AS defaults(name, icon)
WHERE NOT EXISTS (
  SELECT 1 FROM net_worth_categories
  WHERE user_id IS NULL AND name = defaults.name
);
```

The `WHERE NOT EXISTS` guard (matched on global `user_id IS NULL` + name) keeps
re-running seed.sql idempotent without needing a unique constraint.

## Data Layer

### `hooks/use-net-worth-categories.ts` (new)

Mirrors `use-categories.ts`:

- `fetchNetWorthCategories` — SELECT all, ordered by `name`.
- `createNetWorthCategory({ name, icon })` — inserts with `user_id` resolved
  internally via `auth.getUser()`; optimistic `onMutate`/`onError`/`onSettled`.
- `updateNetWorthCategory({ id, name, icon })` — updates own row; optimistic.
- `deleteNetWorthCategory(id)` — deletes own row; optimistic.
- Returns `{ data, isLoading, error, createNetWorthCategory,
  updateNetWorthCategory, deleteNetWorthCategory }`.

`hooks/use-net-worth.ts`:

- `EntryWithValues`/`EntryInput` gain `category_id: string | null`. `createEntry`
  and `updateEntry` accept and persist `category_id` (create: nullable FK insert;
  update: metadata update includes `category_id` when provided).

## UI

### `entry-form.tsx`

- When `entryType === "asset"`, show a **Category** Select above Description:
  optional, placeholder "No category", options = global + own categories with
  `CategoryIcon` (matching the transaction-form dropdown style).
- When `entryType === "liability"`, no category field.
- Persist `category_id` on create and edit.

### `entry-list.tsx`

- Add a **Category** column between Name and Value, rendered only for the asset
  list. Each cell shows a small badge (icon + name) using `CategoryIcon`; rows
  with `category_id = null` render an empty cell (no badge).
- Liability list keeps the existing Name / Value / actions columns.

### Settings — Net Worth categories card

- New `components/net-worth/net-worth-category-list.tsx`, modeled on
  `components/categories/category-list.tsx`:
  - "Your categories" section: user custom categories with edit/delete
    dropdown (reuse `CategoryForm`-style icon picker via a small
    `NetWorthCategoryForm` dialog or reuse the existing pattern).
  - "Global categories" section: the four defaults, read-only, with a
    "Global" badge.
- New card in `app/dashboard/settings/page.tsx` between Categories and Sign
  out, titled "Net Worth categories".

## Error Handling

- Form submit errors render inline (`submitError` box pattern).
- Mutations: optimistic update, rollback on error, invalidation on settle.
- Deleting a custom category: assets referencing it become uncategorized via
  `ON DELETE SET NULL`; the delete mutation invalidates net worth queries so
  the asset list re-renders without the category.

## Verification

1. `npx tsc --noEmit` — new hook + UI types.
2. `npm test` — existing suite (50 tests) still passes; no math changes.
3. `npm run build` — type-checks and prerenders `/dashboard/net-worth` and
   `/dashboard/settings`.
4. Manual smoke: defaults visible read-only in Settings; create/edit/delete a
   custom category; create asset with category; edit asset category; delete a
   custom category → asset becomes uncategorized; liability form has no
   category field.
5. Apply migration 010 remotely (after 009) via the Supabase dashboard SQL
   editor.
6. Update `AGENTS.md` (migration state + architecture map + feature state).

## AGENTS.md Updates (durable only)

- Migration state: `010_net_worth_categories.sql` — new
  `net_worth_categories` table (global + user rows), nullable
  `net_worth_entries.category_id` (ON DELETE SET NULL), tightened
  INSERT/UPDATE RLS on `net_worth_entries`; defaults seeded in `seed.sql`.
- Architecture map: `hooks/use-net-worth-categories.ts`,
  `components/net-worth/net-worth-category-list.tsx`.
- Feature state: net worth assets support optional categories (4 read-only
  defaults + user custom), badge in asset list, picker in asset form,
  management in Settings; liabilities unaffected.
