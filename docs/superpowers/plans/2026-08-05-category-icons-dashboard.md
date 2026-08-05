# Category Icons in Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface category icons in two dashboard locations — the side-panel "By category" list (icon replaces the colored dot, tinted to the donut slice color) and the transaction form's category dropdown (fog-colored icons in the open list and closed trigger).

**Architecture:** Pure presentation change. Both consumers import the existing `CategoryIcon` primitive from `components/categories/category-icons.tsx`. The side panel derives an `icon` per category inside its existing `useMemo`; the dropdown uses Base UI's `SelectValue` function-child formatter to render icon + name for the selected value. No schema, data-layer, or dependency changes.

**Tech Stack:** Next.js 16 App Router, React 19, Base UI (`SelectValue` function child), Lucide React, Tailwind v4, Vitest (existing suite must stay green).

## Global Constraints

- Verification gate is **`npm run build`**; also run **`npm test`** (existing 10 Vitest tests must stay passing). Never run `npm run lint` (broken in this repo).
- **Pure presentation change:** no schema, no env, no data-layer changes, no new dependencies, no new files.
- **`components/categories/category-icons.tsx` must remain unchanged** — `CategoryIcon` accepts only `{ slug, className }`. To color an icon, wrap it in a `<span style={{ color: ... }}>`: Lucide icons render with `stroke="currentColor"`, so they inherit the wrapper span's color.
- Brand palette: muted text `text-fog`; donut colors `DONUT_COLORS = ["#083458", "#18848c", "#0e7c5b", "#c0392b", "#2a9d9f", "#4a6a7d"]` (already defined in `side-panel.tsx`).
- Base UI: `SelectValue` accepts a function child `(value) => ReactNode` to format the selected value; keep the Select's existing `items` prop (feeds accessibility + placeholder resolution).
- `byCategory` entries gain an `icon` field typed `string | null`.

---

### Task 1: Side-panel "By category" icons

**Files:**
- Modify: `components/dashboard/side-panel.tsx`

**Interfaces:**
- Consumes: `CategoryIcon({ slug, className })` from `@/components/categories/category-icons` (unchanged); `DONUT_COLORS` (existing constant).
- Produces: `byCategory` entries now carry `icon: string | null`; the top-3 list renders each row's icon tinted to its donut slice color, with `Tag` fallback for Uncategorized. Later tasks do not depend on this; it is the feature's first half.

- [ ] **Step 1: Add the import**

Add this import to the existing import block (after the `formatCurrency` import at the top of the file):

```tsx
import { CategoryIcon } from "@/components/categories/category-icons";
```

- [ ] **Step 2: Extend the `useMemo` to carry each category's icon**

Find this block inside the `useMemo`:

```tsx
    const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));
    const byCategory = [...catTotals.entries()]
      .map(([id, amount]) => ({ id, name: catName.get(id) ?? "Uncategorized", amount }))
      .sort((a, b) => b.amount - a.amount);
```

Replace it with:

```tsx
    const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));
    const catIcon = new Map((categories ?? []).map((c) => [c.id, c.icon]));
    const byCategory = [...catTotals.entries()]
      .map(([id, amount]) => ({
        id,
        name: catName.get(id) ?? "Uncategorized",
        icon: catIcon.get(id) ?? null,
        amount,
      }))
      .sort((a, b) => b.amount - a.amount);
```

- [ ] **Step 3: Replace the colored dot with the tinted icon**

Find this block inside the top-3 list rendering:

```tsx
                    <span className="flex items-center gap-2 text-ink">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                      />
                      {entry.name}
                    </span>
```

Replace it with:

```tsx
                    <span className="flex items-center gap-2 text-ink">
                      <span style={{ color: DONUT_COLORS[i % DONUT_COLORS.length] }}>
                        <CategoryIcon slug={entry.icon ?? "Tag"} className="h-4 w-4" />
                      </span>
                      {entry.name}
                    </span>
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: BUILD SUCCESSFUL. The icon inherits the wrapper span's color because Lucide renders `currentColor`.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/side-panel.tsx
git commit -m "feat: show category icons in side-panel by-category list"
```

---

### Task 2: Transaction-form category dropdown icons

**Files:**
- Modify: `components/transactions/transaction-form.tsx`

**Interfaces:**
- Consumes: `CategoryIcon({ slug, className })` from `@/components/categories/category-icons` (unchanged); `categories` from `useCategories()` (rows carry `icon: string`).
- Produces: the category dropdown shows fog-colored icons in both the open list items and the closed trigger (selected value). Used by the existing form flow; no later task depends on it.

- [ ] **Step 1: Add the import**

Add this import to the existing import block (after the `Landmark` lucide import near the top of the file):

```tsx
import { CategoryIcon } from "@/components/categories/category-icons";
```

- [ ] **Step 2: Add the icon to each open list item**

Find this block inside the category `<SelectContent>`:

```tsx
                {(categories ?? []).map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
```

Replace it with:

```tsx
                {(categories ?? []).map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    <CategoryIcon slug={category.icon} className="h-4 w-4 text-fog" />
                    {category.name}
                  </SelectItem>
                ))}
```

- [ ] **Step 3: Render icon + name in the closed trigger**

Find this line (inside the category `<Select>` block, with `id="category"`):

```tsx
                <SelectValue placeholder="Select category (optional)" />
```

Replace it with:

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
- Base UI passes the raw selected value to the function child; when nothing is selected the value is `""`, `categories?.find` returns `undefined`, and the placeholder text renders — no special null handling needed.
- Do NOT remove the `items` prop on the `<Select>` — it feeds accessibility and placeholder resolution.

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add components/transactions/transaction-form.tsx
git commit -m "feat: show category icons in transaction form dropdown"
```

---

### Task 3: AGENTS.md update + whole-branch verification

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: the completed feature from Tasks 1–2.
- Produces: AGENTS.md reflects that icons now render (the existing category-management entry says "not yet rendered … (future change)", which is now stale), and the settings roadmap no longer lists the icon item.

- [ ] **Step 1: Update the stale AGENTS.md statements**

In `AGENTS.md`, under `## 5. Current Status & Recent Progress Log`, find the category-management entry that contains this text:

```markdown
Icons are stored but not yet rendered in the transaction form / side panel (future change).
```

Replace it with:

```markdown
Icons are rendered in the side-panel by-category list and the transaction-form category dropdown (see the next entry).
```

In the same entry, find the settings roadmap line that ends with this text:

```markdown
MFA/session management, delete account. Icons in transaction dropdown + side panel donut.
```

Replace it with:

```markdown
MFA/session management, delete account.
```

- [ ] **Step 2: Append a new feature-log entry**

At the end of section 5, append this dated entry (matching the existing style):

```markdown
**Category icons in dashboard (2026-08-05):**
- The side-panel "By category" list now renders each category's Lucide icon (from `categories.icon`) tinted to the donut slice color, replacing the plain colored dot; Uncategorized falls back to the Tag icon.
- The transaction form's category dropdown shows fog-colored icons next to category names in both the open list and the closed trigger (via Base UI `SelectValue`'s function-child formatter).
- Pure presentation change — no schema, no env, no data-layer changes, no new dependencies. Spec: `docs/superpowers/specs/2026-08-05-category-icons-dashboard-design.md`.
- Commit: feature commits on top of `6a92015`.
```

- [ ] **Step 3: Verify build and tests**

Run: `npm run build`
Expected: BUILD SUCCESSFUL.

Run: `npm test`
Expected: 10 passed.

- [ ] **Step 4: Manual browser check**

Run: `npm run dev`, open the dashboard signed in.
1. Side-panel "By category" rows show each category's icon tinted to its donut slice color; an Uncategorized row (if any transaction has no category) shows the Tag icon.
2. Transaction form → Category dropdown: the open list shows fog-colored icons before each name; selecting a category shows icon + name in the closed trigger; clearing/empty shows "Select category (optional)".

- [ ] **Step 5: Review the commit list**

Run: `git log --oneline -6`
Expected: two feature commits on top of the spec commit (`6a92015`), each with a `feat:` prefix as described in Tasks 1–2, plus this task's AGENTS.md change.

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md
git commit -m "docs: log category icons in dashboard feature"
```

---

### Task 4: Final verification pass

**Files:**
- None (verification only).

**Interfaces:**
- Consumes: the complete feature from Tasks 1–3.

- [ ] **Step 1: Run the full build and tests**

Run: `npm run build`
Expected: BUILD SUCCESSFUL.

Run: `npm test`
Expected: 10 passed.

- [ ] **Step 2: Report**

Summarize for the user: what shipped, the commit SHAs, the verification evidence (build + tests + browser check), and note that nothing was pushed (push only on request).
