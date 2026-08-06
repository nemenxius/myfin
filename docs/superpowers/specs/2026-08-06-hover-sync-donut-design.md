# Hover-Synchronized Donut Chart and Category Legend

Date: 2026-08-06

## Goal

Synchronize hover highlighting between the Recharts donut chart and its category legend list in the dashboard side panel. Hovering either side should highlight the matching element on both sides.

## Context

Both the donut chart and the category list live in a single client component, `components/dashboard/side-panel.tsx`. The chart renders all `byCategory` entries; the legend list renders only the top 3 (`byCategory.slice(0, 3)`). Because both derive from the same sorted `byCategory` array, array indices are the shared key.

## Design

### State

Add local state to `SidePanel`:

```ts
const [activeIndex, setActiveIndex] = useState<number | null>(null);
```

`null` means nothing is hovered. An index means either that slice or that legend row is hovered.

### Chart → Legend

- On the `Pie`, add `onMouseEnter={(_, index) => setActiveIndex(index)}` and `onMouseLeave={() => setActiveIndex(null)}`.
- On each `Cell`, compute `isActive = activeIndex === null || activeIndex === i`:
  - `opacity={isActive ? 1 : 0.35}`
  - `outerRadius={isActive ? 56 : 52}` (active slice grows slightly)
  - add `transition-opacity` for a smooth dim/fade.

### Legend → Chart

- On each `<li>` in the top-3 list, add `onMouseEnter={() => setActiveIndex(i)}` and `onMouseLeave={() => setActiveIndex(null)}`.
- Active row: name gets `font-semibold` and the row keeps full color.
- Inactive rows (when `activeIndex !== null && activeIndex !== i`): `opacity-35`.
- The `Cell`s react automatically because they read the same `activeIndex`.

### Edge cases

- Hovering a slice beyond the top-3 list: no legend row exists to highlight; the chart's other slices simply dim. Expected behavior.
- Nothing hovered (`activeIndex === null`): all slices and legend rows render at full opacity.

## Verification

- `npm run build` (type-check + prerender).
- `npm test` (existing Vitest suite; no test changes expected).
