# Category Management in Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Categories" card to the settings page where users can create, edit, and delete their own custom transaction categories (with a Lucide icon picker), while seeded global categories stay read-only.

**Architecture:** Extend `useCategories` from read-only to optimistic CRUD (mirroring `useAccounts`), scoped by two new RLS policies (UPDATE/DELETE on own rows) in migration `004`. New `components/categories/` hold the icon constants (`category-icons.ts`), the add/edit Dialog (`category-form.tsx`), and the grouped list with per-row actions + delete confirmation (`category-list.tsx`). The settings page hosts the new card between Password and Sign out.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query v5, Supabase JS client, Base UI `Dialog`/`AlertDialog`/`DropdownMenu`, Lucide React, date-fns (unused here), Vitest (existing suite must stay green).

## Global Constraints

- Verification gate is **`npm run build`**; also run **`npm test`** (existing 10 Vitest tests must stay passing). Never run `npm run lint` (broken in this repo).
- **No column or table changes** — only two new RLS policies. Do not modify the `categories` table schema, seed data, `lib/`, or any existing hook except `hooks/use-categories.ts`.
- Global categories = `categories.user_id IS NULL`; a user's own = `user_id = <their id>`. RLS SELECT already exposes global + own; INSERT already allows own.
- Optimistic mutation pattern (must match `useAccounts` exactly): `useMutation` with `onMutate` (snapshot + optimistic set), `onError` (rollback to snapshot), `onSettled` (`invalidateQueries`). `createCategory` resolves `user_id` internally via `auth.getUser()` — callers pass everything except `user_id`.
- Base UI quirks: `Button` uses a `render` prop (not `asChild`); `DropdownMenuTrigger` uses `render={<Button variant="ghost" size="icon-sm" />}`; `Dialog`/`AlertDialog` structure matches `components/accounts/` exactly.
- New categories always persist an `icon` slug (schema `icon TEXT NOT NULL`); default to `"Tag"` if none picked. Icons are stored but NOT rendered in the transaction form/side panel (out of scope).
- Brand colors in code: teal `#18848c`, navy `#083458` (on `#eaf2f5` badges). Muted text `text-fog`, ink `text-ink`.

---

### Task 1: RLS migration + `useCategories` CRUD

**Files:**
- Create: `supabase/migrations/004_category_manage.sql`
- Modify: `hooks/use-categories.ts`

**Interfaces:**
- Produces:
  - `useCategories()` now returns `{ ...categoriesQuery, createCategory, updateCategory, deleteCategory }`.
  - `createCategory(input: { name: string; icon: string }): Promise<Category>` — resolves `user_id` internally.
  - `updateCategory({ id, name, icon }: { id: string } & Partial<TablesInsert<"categories">>): Promise<Category>`.
  - `deleteCategory(id: string): Promise<void>`.
  - Migration `004` adds UPDATE + DELETE policies for own categories.

- [ ] **Step 1: Create `supabase/migrations/004_category_manage.sql`**

```sql
-- supabase/migrations/004_category_manage.sql

-- Users can update their own custom categories (global categories stay read-only)
CREATE POLICY "Users can update own custom categories" ON categories
FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own custom categories
CREATE POLICY "Users can delete own custom categories" ON categories
FOR DELETE USING (auth.uid() = user_id);
```

Note: this migration must be applied to the remote DB via the Supabase dashboard SQL editor (the CLI is not installed in this environment). It cannot be tested locally.

- [ ] **Step 2: Rewrite `hooks/use-categories.ts` with optimistic CRUD**

Replace the entire file content with:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert } from "@/types/database";

type Category = Tables<"categories">;
type CategoryInsert = TablesInsert<"categories">;
type CategoryInput = Omit<CategoryInsert, "user_id">;

const queryKey = ["categories"] as const;

const fetchCategories = async (): Promise<Category[]> => {
  const { data, error } = await supabaseClient
    .from("categories")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
};

const getCurrentUserId = async (): Promise<string> => {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
};

export function useCategories() {
  const queryClient = useQueryClient();

  const categoriesQuery = useQuery({
    queryKey,
    queryFn: fetchCategories,
  });

  const createCategory = useMutation({
    mutationFn: async (input: CategoryInput): Promise<Category> => {
      const user_id = await getCurrentUserId();
      const { data, error } = await supabaseClient
        .from("categories")
        .insert({ ...input, user_id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async (newCategory) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<Category[]>(queryKey);
      const user_id = await getCurrentUserId();

      const optimistic: Category = {
        id: `temp-${Date.now()}`,
        user_id,
        name: newCategory.name,
        icon: newCategory.icon,
      };

      queryClient.setQueryData<Category[]>(queryKey, (old) => [
        ...(old ?? []),
        optimistic,
      ]);

      return { previous };
    },
    onError: (_error, _newCategory, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const updateCategory = useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: { id: string } & Partial<CategoryInsert>): Promise<Category> => {
      const { data, error } = await supabaseClient
        .from("categories")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<Category[]>(queryKey);

      queryClient.setQueryData<Category[]>(queryKey, (old) =>
        (old ?? []).map((category) =>
          category.id === id ? { ...category, ...updates } : category
        )
      );

      return { previous };
    },
    onError: (_error, _updates, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabaseClient
        .from("categories")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<Category[]>(queryKey);

      queryClient.setQueryData<Category[]>(queryKey, (old) =>
        (old ?? []).filter((category) => category.id !== id)
      );

      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    ...categoriesQuery,
    createCategory,
    updateCategory,
    deleteCategory,
  };
}
```

- [ ] **Step 3: Verify build and tests**

Run: `npm run build`
Expected: BUILD SUCCESSFUL.

Run: `npm test`
Expected: 10 passed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/004_category_manage.sql hooks/use-categories.ts
git commit -m "feat: category CRUD hooks and RLS migration"
```

---

### Task 2: Category icon constants

**Files:**
- Create: `components/categories/category-icons.ts`

**Interfaces:**
- Produces:
  - `CATEGORY_ICONS: { value: string; label: string }[]` — the picker options (all values are real Lucide exports).
  - `CategoryIcon({ slug, className }: { slug: string; className?: string })` — renders the mapped Lucide icon, falling back to `Tag` for unknown slugs.
- Consumes: nothing.

- [ ] **Step 1: Create `components/categories/category-icons.ts`**

```ts
import {
  Banknote,
  Briefcase,
  Car,
  Coffee,
  Droplets,
  Dumbbell,
  Film,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Phone,
  PiggyBank,
  Plane,
  Salad,
  Shirt,
  ShoppingCart,
  Sparkles,
  Stethoscope,
  Tag,
  TrendingUp,
  Utensils,
  Wallet,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const CATEGORY_ICONS: { value: string; label: string }[] = [
  { value: "Utensils", label: "Food" },
  { value: "ShoppingCart", label: "Shopping" },
  { value: "Home", label: "Home" },
  { value: "Car", label: "Car" },
  { value: "Coffee", label: "Coffee" },
  { value: "Zap", label: "Utilities" },
  { value: "Banknote", label: "Money" },
  { value: "TrendingUp", label: "Income" },
  { value: "Plane", label: "Travel" },
  { value: "Gift", label: "Gift" },
  { value: "HeartPulse", label: "Health" },
  { value: "Briefcase", label: "Work" },
  { value: "GraduationCap", label: "Education" },
  { value: "Film", label: "Entertainment" },
  { value: "Shirt", label: "Clothing" },
  { value: "PiggyBank", label: "Savings" },
  { value: "Wallet", label: "Wallet" },
  { value: "Phone", label: "Phone" },
  { value: "Wifi", label: "Internet" },
  { value: "Droplets", label: "Water" },
  { value: "Stethoscope", label: "Medical" },
  { value: "Dumbbell", label: "Fitness" },
  { value: "Salad", label: "Groceries" },
  { value: "Sparkles", label: "Misc" },
];

const categoryIconMap: Record<string, LucideIcon> = {
  Utensils,
  ShoppingCart,
  Home,
  Car,
  Coffee,
  Zap,
  Banknote,
  TrendingUp,
  Plane,
  Gift,
  HeartPulse,
  Briefcase,
  GraduationCap,
  Film,
  Shirt,
  PiggyBank,
  Wallet,
  Phone,
  Wifi,
  Droplets,
  Stethoscope,
  Dumbbell,
  Salad,
  Sparkles,
};

export function CategoryIcon({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  const Icon = categoryIconMap[slug] ?? Tag;
  return <Icon className={className} />;
}
```

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`
Expected: BUILD SUCCESSFUL. (File is not imported anywhere yet — this confirms it type-checks.)

- [ ] **Step 3: Commit**

```bash
git add components/categories/category-icons.ts
git commit -m "feat: add category icon constants and renderer"
```

---

### Task 3: Category add/edit dialog

**Files:**
- Create: `components/categories/category-form.tsx`

**Interfaces:**
- Consumes: `useCategories()` CRUD (Task 1); `CATEGORY_ICONS`, `CategoryIcon` (Task 2).
- Produces: `CategoryForm({ open, onOpenChange, category }: { open: boolean; onOpenChange: (open: boolean) => void; category?: Category | null })` — `null`/undefined = create mode. Used by `CategoryList` (Task 4).

- [ ] **Step 1: Create `components/categories/category-form.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCategories } from "@/hooks/use-categories";
import { CATEGORY_ICONS, CategoryIcon } from "./category-icons";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database";

type Category = Tables<"categories">;

interface CategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category | null;
}

export function CategoryForm({
  open,
  onOpenChange,
  category,
}: CategoryFormProps) {
  const { createCategory, updateCategory } = useCategories();

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [errors, setErrors] = useState<{ name?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSubmitError(null);

    if (category) {
      setName(category.name);
      setIcon(category.icon);
    } else {
      setName("");
      setIcon("");
    }
  }, [open, category]);

  const validate = (): boolean => {
    const next: { name?: string } = {};
    if (!name.trim()) {
      next.name = "Name is required.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitError(null);

    const payload = { name: name.trim(), icon: icon || "Tag" };

    try {
      if (category) {
        await updateCategory.mutateAsync({ id: category.id, ...payload });
      } else {
        await createCategory.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {category ? "Edit Category" : "Add Category"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              type="text"
              placeholder="Groceries"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label>Icon</Label>
            <div className="grid grid-cols-6 gap-1.5">
              {CATEGORY_ICONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-label={option.label}
                  aria-pressed={icon === option.value}
                  onClick={() => setIcon(option.value)}
                  className={cn(
                    "flex h-10 w-full items-center justify-center rounded-lg border text-fog transition-colors hover:bg-muted hover:text-foreground",
                    icon === option.value &&
                      "border-[#18848c] bg-[#18848c]/10 text-[#18848c]"
                  )}
                >
                  <CategoryIcon slug={option.value} className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          {submitError && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {submitError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">
              {category ? "Save Changes" : "Add Category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`
Expected: BUILD SUCCESSFUL. (Component is not mounted anywhere yet — this confirms it type-checks.)

- [ ] **Step 3: Commit**

```bash
git add components/categories/category-form.tsx
git commit -m "feat: add category form dialog with icon picker"
```

---

### Task 4: Category list with grouping and delete confirmation

**Files:**
- Create: `components/categories/category-list.tsx`

**Interfaces:**
- Consumes: `useCategories()` (Task 1); `CategoryIcon` (Task 2); `CategoryForm` (Task 3).
- Produces: `CategoryList()` — no props. Hosted by the settings page (Task 5). Renders "Your categories" and "Global categories" groups; global rows are read-only with a "Global" badge; own rows have Edit/Delete actions; delete is confirmed by an AlertDialog warning about Uncategorized.

- [ ] **Step 1: Create `components/categories/category-list.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCategories } from "@/hooks/use-categories";
import { CategoryForm } from "./category-form";
import { CategoryIcon } from "./category-icons";
import type { Tables } from "@/types/database";

type Category = Tables<"categories">;

export function CategoryList() {
  const { data: categories, isLoading, deleteCategory } = useCategories();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const { globalCategories, userCategories } = useMemo(() => {
    const all = categories ?? [];
    return {
      globalCategories: all.filter((c) => c.user_id === null),
      userCategories: all.filter((c) => c.user_id !== null),
    };
  }, [categories]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditing(category);
    setFormOpen(true);
  };

  const confirmDelete = () => {
    if (deleting) {
      deleteCategory.mutate(deleting.id);
    }
    setDeleting(null);
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-fog">
          {isLoading
            ? "Loading…"
            : `${userCategories.length} custom categor${userCategories.length === 1 ? "y" : "ies"}`}
        </p>
        <Button variant="outline" size="sm" onClick={openCreate}>
          <Plus />
          Add category
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
              Your categories
            </p>
            {userCategories.length === 0 ? (
              <p className="text-sm text-fog">No custom categories yet.</p>
            ) : (
              <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                {userCategories.map((category) => (
                  <li
                    key={category.id}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <span className="flex items-center gap-2.5 text-sm text-ink">
                      <CategoryIcon
                        slug={category.icon}
                        className="h-4 w-4 text-fog"
                      />
                      {category.name}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" />}
                        aria-label={`Actions for ${category.name}`}
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => openEdit(category)}>
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleting(category)}
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-1.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
              Global categories
            </p>
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {globalCategories.map((category) => (
                <li
                  key={category.id}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <span className="flex items-center gap-2.5 text-sm text-ink">
                    <CategoryIcon
                      slug={category.icon}
                      className="h-4 w-4 text-fog"
                    />
                    {category.name}
                  </span>
                  <Badge
                    variant="outline"
                    className="bg-[#eaf2f5] text-[#083458]"
                  >
                    Global
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <CategoryForm
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editing}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Transactions using this category will become Uncategorized. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`
Expected: BUILD SUCCESSFUL. (Component is not mounted yet — this confirms it type-checks.)

- [ ] **Step 3: Commit**

```bash
git add components/categories/category-list.tsx
git commit -m "feat: add category list with grouping and delete confirmation"
```

---

### Task 5: Settings page integration + AGENTS.md

**Files:**
- Modify: `app/dashboard/settings/page.tsx`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `CategoryList` (Task 4).
- Produces: the settings page shows a "Categories" card; AGENTS.md gains a feature-log entry plus a settings roadmap note.

- [ ] **Step 1: Add the Categories card to the settings page**

In `app/dashboard/settings/page.tsx`:
1. Add `import { CategoryList } from "@/components/categories/category-list";` to the imports.
2. Insert a new `<Card>` between the Password card (`{!isGoogleUser && (...)}` block) and the Sign out card, matching the existing card markup:

```tsx
      <Card className="border-border/50 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-medium">Categories</CardTitle>
          <CardDescription>
            Custom categories appear in the transaction form and charts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryList />
        </CardContent>
      </Card>
```

- [ ] **Step 2: Update AGENTS.md**

In `AGENTS.md`, under `## 5. Current Status & Recent Progress Log`, append a dated entry (matching the existing style):

```markdown
**Category management in settings (2026-08-05):**
- New "Categories" card on `/dashboard/settings` — users can create, edit, and delete their own custom transaction categories via a Dialog with a Lucide icon picker; seeded global categories are read-only.
- `useCategories` extended from read-only to optimistic CRUD (`createCategory`/`updateCategory`/`deleteCategory`, mirrors `useAccounts`). New `components/categories/`: `category-icons.ts` (CATEGORY_ICONS + CategoryIcon renderer with Tag fallback), `category-form.tsx` (Dialog), `category-list.tsx` (grouped list + AlertDialog delete). Icons are stored but not yet rendered in the transaction form / side panel (future change).
- **Schema change:** migration `004_category_manage.sql` (UPDATE + DELETE policies for own categories). **Must be applied to the remote DB** (dashboard SQL editor) — same as migrations 002/003.
- **Settings roadmap (not yet built):** dark mode/theme, default account for new transactions, CSV export, display name, week/month-start preferences, MFA/session management, delete account. Icons in transaction dropdown + side panel donut.
- Commit: feature commits on top of `b2fa6a4`.
```

- [ ] **Step 3: Verify build and tests**

Run: `npm run build`
Expected: BUILD SUCCESSFUL.

Run: `npm test`
Expected: 10 passed.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open `/dashboard/settings` signed in.
- "Categories" card appears between Password and Sign out.
- Global categories (Food, Rent, Utilities, Salary, Investment Income) show with a "Global" badge and NO actions.
- "No custom categories yet." shows when the user has none.
- "Add category" opens the dialog; empty name shows "Name is required."; picking an icon and submitting adds the category to "Your categories" and to the transaction form dropdown.
- Edit pre-fills name + icon; saving renames it in the dropdown and side panel.
- Delete on an in-use category warns "Transactions using this category will become Uncategorized."; after confirm the category disappears and its transactions show as Uncategorized in the side panel.
- Global rows have no edit/delete actions.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/settings/page.tsx AGENTS.md
git commit -m "feat: add category management card to settings page"
```

---

### Task 6: Whole-branch verification

**Files:**
- None (verification only).

**Interfaces:**
- Consumes: the complete feature from Tasks 1–5.

- [ ] **Step 1: Run the full build and tests**

Run: `npm run build`
Expected: BUILD SUCCESSFUL.

Run: `npm test`
Expected: 10 passed.

- [ ] **Step 2: End-to-end browser check**

Run: `npm run dev`, open `/dashboard/settings` signed in.
1. Categories card renders with both groups; global rows read-only.
2. Create → edit → delete a custom category; verify the transaction form dropdown and side-panel donut reflect each change (create shows it, rename updates it, delete removes it and marks its transactions Uncategorized).
3. Dialog error path: submit an empty name → inline error, dialog stays open.
4. No regression to the existing currency/password/sign-out cards.

- [ ] **Step 3: Review the commit list**

Run: `git log --oneline -8`
Expected: five feature commits on top of the spec commit (`b2fa6a4`), each with a `feat:` prefix as described in Tasks 1–5.

- [ ] **Step 4: Commit any final fixes**

If the end-to-end check surfaced issues, fix them in focused commits with clear messages. If clean, no commit needed.

- [ ] **Step 5: Report**

Summarize for the user: what shipped, the commit SHAs, the verification evidence (build + tests + browser checks), and note that (a) migration `004` must be applied to the remote DB, and (b) nothing was pushed (push only on request).
