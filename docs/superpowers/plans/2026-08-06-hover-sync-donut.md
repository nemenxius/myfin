# Donut Chart / Legend Hover-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize hover highlighting between the dashboard's Recharts donut chart and its category legend list so hovering either side highlights both sides.

**Architecture:** Both the donut chart and the top-3 category list already live in one client component, `components/dashboard/side-panel.tsx`. A single local `activeIndex` state drives both sides: the `Pie`'s `onMouseEnter`/`onMouseLeave` sets/clears it, each `Cell` and each `<li>` reads it to compute active/inactive styling. No prop drilling or new files needed.

**Tech Stack:** React 19, Recharts, Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-08-06-hover-sync-donut-design.md`

## Global Constraints

- Browser data uses hooks from `hooks/`; never call Supabase directly in components.
- Brand colors come from `DONUT_COLORS` in the file; do not change them.
- The legend list intentionally shows only the top 3 categories (`byCategory.slice(0, 3)`); do not change that.
- `activeIndex` is `number | null`; `null` means nothing is hovered and everything renders at full opacity.
- Verification is `npm run build` (type-check + prerender) and `npm test` (existing Vitest suite, 10 tests). Do not run `npm run lint` (broken `next lint` script).
- Do not add comments to code.

---

### Task 1: Add shared hover state and chart→legend wiring

**Files:**
- Modify: `components/dashboard/side-panel.tsx` (imports, component body, Pie/Sector block)

**Interfaces:**
- Consumes: nothing new (existing `SidePanel({ month })`, `byCategory` array with `id`/`name`/`icon`/`amount` fields).
- Produces: `activeIndex: number | null` state + `setActiveIndex` — consumed by Task 2.

**Recharts 3 note:** This repo runs Recharts 3.10.1. Per-`Cell` geometry props like `outerRadius` no longer exist — `Cell` is deprecated to `fill`/`stroke` only. Per-sector styling uses the `Pie`'s `shape` prop, which is called with `PieSectorShapeProps` (contains `index`, `fill`, `cx`, `cy`, `innerRadius`, `outerRadius`, `startAngle`, `endAngle`, `cornerRadius`). The `shape` is an inline closure over `activeIndex`, so it re-renders when the state changes. Destructure only the props `Sector` needs to avoid passing unknown attributes to the SVG path.

- [ ] **Step 1: Add `useState` import, `Sector` import, and shared hover state**

In `components/dashboard/side-panel.tsx`, change the first import line from:

```tsx
import { useMemo } from "react";
```

to:

```tsx
import { useMemo, useState } from "react";
```

Change the recharts import line (currently `import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";`) to:

```tsx
import { Cell, Pie, PieChart, ResponsiveContainer, Sector } from "recharts";
```

Then add the state line inside the `SidePanel` component, after the existing `const { currency } = usePrimaryCurrency();` line:

```tsx
const [activeIndex, setActiveIndex] = useState<number | null>(null);
```

- [ ] **Step 2: Wire chart hover events and per-slice active styling via the `shape` prop**

Replace the `<Pie …>` … `</Pie>` block (currently lines ~72-87) with:

```tsx
                    <Pie
                      data={byCategory}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius={34}
                      outerRadius={52}
                      paddingAngle={2}
                      strokeWidth={0}
                      onMouseEnter={(_, index) => setActiveIndex(index)}
                      onMouseLeave={() => setActiveIndex(null)}
                      shape={(props) => {
                        const isActive =
                          activeIndex === null || props.index === activeIndex;
                        return (
                          <Sector
                            cx={props.cx}
                            cy={props.cy}
                            innerRadius={props.innerRadius}
                            outerRadius={isActive ? 56 : 52}
                            startAngle={props.startAngle}
                            endAngle={props.endAngle}
                            cornerRadius={props.cornerRadius}
                            fill={props.fill}
                            opacity={isActive ? 1 : 0.35}
                            className="transition-opacity duration-200"
                          />
                        );
                      }}
                    >
                      {byCategory.map((entry, i) => (
                        <Cell
                          key={entry.id}
                          fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                        />
                      ))}
                    </Pie>
```

`Cell` now carries only the fill color (all it supports in Recharts 3). The `shape` closure renders each sector: the active slice grows from `outerRadius` 52 → 56 and stays full opacity; inactive slices dim to `0.35`.

- [ ] **Step 3: Run the production build to verify chart-side wiring**

Run: `npm run build`
Expected: build succeeds (type-checks and prerenders). This confirms Recharts accepts `onMouseEnter` on `Pie` and `shape`/`Sector` typing.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/side-panel.tsx
git commit -m "feat: sync donut chart hover to shared active index"
```

### Task 2: Wire legend→chart and dim inactive rows

**Files:**
- Modify: `components/dashboard/side-panel.tsx` (top-3 `<ul>` list block)

**Interfaces:**
- Consumes: `activeIndex` / `setActiveIndex` from Task 1 (already in scope).
- Produces: nothing new.

- [ ] **Step 1: Add hover handlers and active/inactive styling to legend rows**

Replace the current `<ul className="flex-1 space-y-2">…</ul>` block (currently lines ~91-105) with:

```tsx
              <ul className="flex-1 space-y-2">
                {byCategory.slice(0, 3).map((entry, i) => {
                  const isActive = activeIndex === null || activeIndex === i;
                  return (
                    <li
                      key={entry.id}
                      onMouseEnter={() => setActiveIndex(i)}
                      onMouseLeave={() => setActiveIndex(null)}
                      className={`flex items-center justify-between gap-2 text-sm transition-opacity duration-200 ${
                        isActive ? "opacity-100" : "opacity-35"
                      }`}
                    >
                      <span
                        className={`flex items-center gap-2 ${
                          isActive ? "font-semibold text-ink" : "text-ink"
                        }`}
                      >
                        <span style={{ color: DONUT_COLORS[i % DONUT_COLORS.length] }}>
                          <CategoryIcon slug={entry.icon ?? "Tag"} className="h-4 w-4" />
                        </span>
                        {entry.name}
                      </span>
                      <span className="font-mono tabular-nums text-fog">
                        {formatCurrency(entry.amount, currency)}
                      </span>
                    </li>
                  );
                })}
              </ul>
```

Hovering a row sets the same `activeIndex`, which drives the `Cell` styling added in Task 1 — that is the legend→chart link. Inactive rows dim to `0.35`; the active row name becomes `font-semibold`.

- [ ] **Step 2: Run the production build and test suite**

Run: `npm run build && npm test`
Expected: build succeeds; Vitest reports 10 passing tests.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/side-panel.tsx
git commit -m "feat: sync category legend hover to donut chart"
```
