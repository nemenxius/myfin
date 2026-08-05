# Category Icons in Dashboard Design

> **Status:** Approved 2026-08-05
> **Scope:** Show category icons in the side-panel "By category" list and the transaction-form category dropdown. This is a pure presentation change — no schema, no data-layer, no new dependencies.

## Goal

Categories already carry a Lucide icon slug (`categories.icon TEXT NOT NULL`), and a shared `CategoryIcon` renderer exists in `components/categories/category-icons.tsx` (exports `CATEGORY_ICONS` and `CategoryIcon({ slug, className })`, with a `Tag` fallback for unknown slugs). Today those icons are stored but never rendered in the dashboard. This change surfaces them in the two places the roadmap named: the transaction dropdown and the side-panel donut list.

## Approach

**A — Direct integration** (chosen). Wire the existing `CategoryIcon` primitive directly into the two consuming components. No new components, no abstraction before a second consumer exists. Rejected: B (reusable `CategorySelect` — premature, single consumer), C (tinted chip wrappers — visual noise, duplicates donut color coding).

## Component Changes

### 1. `components/dashboard/side-panel.tsx` — "By category" list

Currently the top-3 category rows render a colored dot (`h-2 w-2 rounded-full`) matched to the donut slice color via `DONUT_COLORS[i % DONUT_COLORS.length]`.

Changes:
- In the `useMemo`, build a `catIcon` map (`category.id → category.icon`) alongside the existing `catName` map.
- Add `icon` to each `byCategory` entry: `icon: catIcon.get(id) ?? null`.
- Replace the colored dot span with `CategoryIcon`:
  - Color the icon with the donut slice color via `style={{ color: DONUT_COLORS[i % DONUT_COLORS.length] }}` (Lucide icons use `currentColor`).
  - `slug={entry.icon ?? "Tag"}` so Uncategorized rows fall back to the `Tag` icon in the slice color.
  - `className="h-4 w-4"`.

Donut chart, its colors, and the surrounding card markup: unchanged.

### 2. `components/transactions/transaction-form.tsx` — category dropdown

Two spots change:

1. **Open list items:** inside each `<SelectItem>`, render `<CategoryIcon slug={category.icon} className="h-4 w-4 text-fog" />` before the category name.
2. **Closed trigger (selected value):** replace the static `<SelectValue placeholder="Select category (optional)" />` with a function child that resolves the selected category and renders icon + name, falling back to the placeholder when nothing is selected:

```tsx
<SelectValue>
  {(value) => {
    const cat = categories?.find((c) => c.id === value);
    return cat ? (
      <>
        <CategoryIcon slug={cat.icon} className="h-4 w-4 text-fog" />
        {cat.name}
      </>
    ) : (
      "Select category (optional)"
    );
  }}
</SelectValue>
```

Notes:
- Base UI's `SelectValue` accepts a function child `(value: any) => ReactNode` — confirmed in `node_modules/@base-ui/react/select/value/SelectValue.d.ts`.
- Icon color is muted `text-fog` so the donut remains the single color source in the dashboard.
- Keep the existing `items` prop on the Select — it feeds accessibility and placeholder resolution.

## Edge Cases

- **Uncategorized** (`category_id` null): side panel falls back to `Tag` icon in the slice color; dropdown shows the placeholder when nothing is selected.
- **Unknown/legacy icon slug:** `CategoryIcon` already falls back to `Tag` internally — no new handling.
- **No categories exist:** dropdown just shows the placeholder (unchanged behavior).

## Scope / Non-Goals

- No schema or env changes; no data-layer changes; no new dependencies; no new files.
- `components/categories/category-icons.tsx` is unchanged — it already exports everything needed.
- **Out of scope:** icons in the ledger table (not selected by user), the icon-map drift test (flagged Minor in the category-management review; future pass), tinted-chip treatment (Option C, rejected).
- Icons are not added to the donut slices themselves — the pie chart remains as-is.

## Verification

- `npm run build` green; `npm test` 10/10 (existing Vitest suite; nothing in `lib/` changes).
- Manual browser check signed in:
  - Side-panel "By category" rows show icons tinted to the donut slice color; Uncategorized shows the Tag icon.
  - Transaction form category dropdown shows fog-colored icons in the open list and in the closed trigger for the selected category; placeholder text unchanged when empty.
