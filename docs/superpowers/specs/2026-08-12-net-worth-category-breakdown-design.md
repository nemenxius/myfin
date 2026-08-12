# Net Worth: Assets by Category Breakdown

Date: 2026-08-12

## Goal

On the Net Worth page, show a breakdown of total assets by category — each
category's total and its percentage of total assets — alongside a donut chart
of those percentages.

## Scope

- Assets only. Liabilities have no categories and are excluded.
- Uncategorized assets are grouped into an "Uncategorized" row/slice so totals
  always sum to 100%.
- Hover-synced donut + table, matching the dashboard's By-category card.
- Single combined card placed after the summary cards and before the Net Worth
  Evolution chart.

## Approach

Option A: a new component plus a pure, unit-tested math helper. No DB changes,
no new hooks, no new dependencies.

## Data Model Notes

- `net_worth_entries` (assets) have an optional `category_id` referencing
  `net_worth_categories` (global `user_id IS NULL` defaults + user custom).
- Each entry's current value is the latest `net_worth_entry_values` row
  (`entryCurrentValue` in `lib/net-worth/math.ts`).
- Entries with no value rows are skipped.

## Math Helper

Add `computeCategoryBreakdown(entries, categories)` to `lib/net-worth/math.ts`:

- Input: asset entries (`NetWorthEntryLike[]`) and a category map
  (`Map<string, { name: string; icon: string }>`).
- Uses `entryCurrentValue()` per entry; entries with `null` current value are
  skipped.
- Groups by `category_id`; `null` groups into an `Uncategorized` bucket
  (icon `Tag`).
- Returns rows `{ id, name, icon, amount, percent }` sorted by `amount`
  descending. `percent = amount / totalAssets * 100`.
- Pure function; unit-tested in `lib/net-worth/math.test.ts`.

## Component

New `components/net-worth/net-worth-category-breakdown.tsx`:

- Card titled "Assets by category".
- Uses `useNetWorth()` (assets, isLoading), `useNetWorthCategories()`
  (category names/icons), `usePrimaryCurrency()` (currency).
- Left: Recharts donut (`Pie` + `Sector` active-slice shape, `paddingAngle`,
  `strokeWidth 0`) using the `side-panel.tsx` color palette
  (`--chart-1..5`, `--leaf`, `--ember`).
- Right: full table/legend — color dot + `CategoryIcon` + name, amount, and
  percentage per row.
- Hover-synced via shared `activeIndex` state (donut slice ↔ row), same
  pattern as `components/dashboard/side-panel.tsx`.
- Loading state ("Loading…") and empty state ("No assets yet…") handled.
- Responsive: donut + list stack vertically below `sm`.

## Placement

In `components/net-worth/net-worth-overview.tsx`, render the new card between
`<NetWorthSummary />` and `<NetWorthChart />`.

## Tests

`computeCategoryBreakdown` unit tests in `lib/net-worth/math.test.ts`:

- grouping by category
- uncategorized bucket
- percentage math (sums to 100)
- sorting by amount descending
- empty input
- entries without values skipped

## Out of Scope

- Liabilities breakdown.
- Server-side aggregation.
- Generalizing the dashboard donut into a shared component.
- Any DB schema changes.