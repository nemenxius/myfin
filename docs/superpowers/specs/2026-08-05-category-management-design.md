# Design: Category Management in Settings

**Date:** 2026-08-05
**Status:** Approved (design review)

## 1. Goal

Let users manage the categories used on transactions — create, edit, and delete their own custom categories — from a new **Categories** card on the settings page. Seeded **global** categories (Food, Rent, Utilities, Salary, Investment Income) remain read-only and shared across all users.

## 2. Scope

- New: `components/categories/category-icons.ts`, `components/categories/category-form.tsx`, `components/categories/category-list.tsx`, `supabase/migrations/004_category_manage.sql`.
- Modified: `hooks/use-categories.ts` (add CRUD mutations), `app/dashboard/settings/page.tsx` (add Categories card), `AGENTS.md` (feature log + roadmap note).
- **No column or table changes.** Only two new RLS policies.
- **Out of scope:** rendering category icons in the transaction form dropdown or side-panel donut (later change; icons are stored now so distinct ones exist when display lands). Dark mode, CSV export, default-account preference, and the rest of the settings roadmap are captured as a roadmap note only.

## 3. Schema Change (RLS only) — `004_category_manage.sql`

Add UPDATE and DELETE policies to `categories`, scoped to the user's own rows:

```sql
CREATE POLICY "Users can update own custom categories" ON categories
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own custom categories" ON categories
FOR DELETE USING (auth.uid() = user_id);
```

Existing policies already cover: SELECT (global `user_id IS NULL` OR own), INSERT (`auth.uid() = user_id`). Global rows have no UPDATE/DELETE policy, so they are read-only even at the DB layer.

**Remote apply required:** the Supabase CLI is not installed in this dev environment, so migration `004` must be applied to the remote DB via the Supabase dashboard SQL editor (same as migrations `002` and `003`). Flag this in AGENTS.md.

## 4. Data Layer — `useCategories` CRUD

Extend `hooks/use-categories.ts` with optimistic mutations mirroring `useAccounts` exactly (pattern: `useMutation` with `onMutate` snapshot + optimistic set, `onError` rollback to `previous`, `onSettled` → `invalidateQueries({ queryKey })`).

- `createCategory({ name, icon }): Promise<Category>` — resolves `user_id` internally via `auth.getUser()` (callers pass everything except `user_id`), inserts, returns the inserted row. Optimistic row uses a `temp-${Date.now()}` id.
- `updateCategory({ id, name, icon }): Promise<Category>` — update by id, optimistic merge onto existing row.
- `deleteCategory(id): Promise<void>` — delete by id, optimistic removal.

Query key stays `["categories"]`, ordered by name ascending. The list component handles grouping/display ordering.

## 5. Components

### 5.1 `components/categories/category-icons.ts` (shared constants)

- `CATEGORY_ICONS: { value: string; label: string }[]` — ~20 curated Lucide icon slugs spanning the seeded ones (Utensils, Home, Zap, Banknote, TrendingUp) plus common finance icons (e.g. ShoppingCart, Car, Coffee, Plane, Gift, HeartPulse, Briefcase, GraduationCap, Film, Shirt, PiggyBank, Wallet, Phone, Wifi, Droplets, Stethoscope, Sparkles).
- `categoryIconMap: Record<string, LucideIcon>` — slug → Lucide component.
- `CategoryIcon({ slug, className }: { slug: string; className?: string })` — renders the mapped icon or a `Tag` fallback for unknown/legacy slugs.

### 5.2 `components/categories/category-form.tsx` (client, Dialog)

Props: `{ open, onOpenChange, category?: Category | null }` (`null` = create mode).

- **Name** — `Input`, required; inline error "Name is required." when empty on submit.
- **Icon** — a grid of `CATEGORY_ICONS` rendered as selectable buttons; the selected one is highlighted. If editing a category whose slug is not in `CATEGORY_ICONS`, nothing is preselected (fallback icon renders in the list); the user can pick a new one.
- Footer: Cancel + "Add category" / "Save changes".
- Uses `mutateAsync` (the hardened pattern from the account-form 409 fix): on failure, the dialog stays open with an error banner; on success, `onOpenChange(false)`.

### 5.3 `components/categories/category-list.tsx` (client)

Renders on the settings Categories card:

- **Global categories** group — read-only rows (`CategoryIcon` + name + "Global" tag), no actions.
- **Your categories** group — `CategoryIcon` + name + Edit (pencil) / Delete (trash) actions.
- Top-right **"Add category"** button → opens the form dialog in create mode.
- Edit → opens the dialog pre-filled (edit mode).
- Delete → AlertDialog confirmation: *"Delete {name}? Transactions using this category will become Uncategorized. This action cannot be undone."* → confirm calls `deleteCategory`.
- Empty state when the user has no custom categories: "No custom categories yet."

## 6. Settings Page Integration

Add a `<Card>` titled **Categories** with description "Custom categories appear in the transaction form and charts." placed between the Password card and the Sign out card. Hosts `<CategoryList />`. All other settings cards remain unchanged.

## 7. Data Flow

All mutations update the `["categories"]` TanStack Query cache optimistically. Because the transaction form dropdown and side-panel donut consume the same query, new/renamed categories appear immediately; deleted categories disappear from the dropdown and their transactions render as "Uncategorized" (side panel already maps missing categories to "Uncategorized").

## 8. Error Handling

- create/update/delete throw on Supabase errors → create/edit show an error banner in the dialog; delete failures surface via the list (rollback restores the row). All optimistic mutations roll back to the pre-mutation snapshot on error.

## 9. Edge Cases

- Empty name → inline "Name is required." error, no submit.
- Duplicate names → allowed (no unique constraint); both rows show. Uniqueness is intentionally YAGNI.
- Delete in-use category → transactions' `category_id` becomes NULL (`ON DELETE SET NULL`); AlertDialog copy warns explicitly.
- Unknown/legacy icon slug → `CategoryIcon` falls back to `Tag`; edit form preselects nothing.
- Optimistic failure → rollback; dialog stays open with error banner (create/edit).

## 10. Verification

- `npm run build` (type gate) and `npm test` (existing Vitest suite must stay green — 10 tests).
- Manual: create → appears in transaction form dropdown and side panel; edit → renames everywhere; delete → transactions become Uncategorized; global rows show no actions.
- RLS migration cannot be tested locally (no local DB); remote apply is a documented manual step.

## 11. Non-Goals

- No icon rendering in transaction form/side panel (future change).
- No category uniqueness validation.
- No merging/reassigning categories on delete (transactions go Uncategorized).
- No changes to global category seed data.
- No other settings features (dark mode, CSV export, default account, etc.) — captured as an AGENTS.md roadmap note.
