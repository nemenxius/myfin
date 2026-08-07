# Net Worth Asset Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional categories to Net Worth assets (4 read-only global defaults + user-custom), shown as badges in the asset list, picked in the asset form, managed in Settings.

**Architecture:** Mirror the existing transaction `categories` pattern: a new `net_worth_categories` table (`user_id IS NULL` = global read-only, non-null = user-owned), a nullable `category_id` FK on `net_worth_entries`, a new TanStack Query hook (`use-net-worth-categories`), and new UI in the asset form/list plus a Settings management card.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query v5, Supabase Postgres + RLS, Tailwind v4, shadcn/Base UI primitives, Lucide React.

## Global Constraints

- Components do **not** call Supabase directly — use TanStack Query hooks in `hooks/`.
- Mutations use optimistic `onMutate` (snapshot/apply/rollback) + `onSettled` invalidation. `user_id` is resolved internally via `auth.getUser()`; callers never pass it.
- Use generated helpers from `types/database.ts`: `Tables<T>` / `TablesInsert<T>`. Do not handwrite DB row aliases.
- Theme-aware classes only: `bg-card`, `bg-secondary`, `text-foreground`, `text-muted-foreground`, `text-fog`, `bg-leaf/10 text-leaf`, `bg-ember/10 text-ember`, `text-destructive`. Never hardcode `bg-white`/`text-ink`/hex colors.
- `CategoryIcon` + `CATEGORY_ICONS` live in `components/categories/category-icons.tsx`; a missing slug falls back to `Tag`.
- Base UI quirks: `Button` uses `render` not `asChild`; Select `onValueChange` passes `string | null`.
- Migration 009 is **not** yet applied remotely; migration 010 depends on it. Migrations are applied via the Supabase dashboard SQL editor (Supabase CLI not installed).
- `types/database.ts` is hand-edited (Supabase CLI not installed).
- Do **not** run `npm run lint` (broken `next lint` script). Use `npx tsc --noEmit`, `npm test`, `npm run build`.

---

### Task 1: Migration 010 + seed + hand-edit types

**Files:**
- Create: `supabase/migrations/010_net_worth_categories.sql`
- Modify: `supabase/seed.sql`
- Modify: `types/database.ts`

**Interfaces:**
- Produces: table `net_worth_categories` (columns `id`, `user_id` nullable, `name`, `icon`, `created_at`, `updated_at`); column `net_worth_entries.category_id` (nullable FK, ON DELETE SET NULL); RLS policies; global seed rows (Money/Banknote, P2P/Handshake, Stock Exchange/CandlestickChart, PPR/PiggyBank). Later tasks rely on these names.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/010_net_worth_categories.sql`:

```sql
-- supabase/migrations/010_net_worth_categories.sql
-- Requires 009 (net_worth_entry_values) to be applied first.

-- 1. NET WORTH CATEGORIES
CREATE TABLE net_worth_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- NULL = global default
  name TEXT NOT NULL,
  icon TEXT NOT NULL, -- Lucide icon name slug
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_net_worth_categories_user_id ON net_worth_categories(user_id);

-- 2. RLS
ALTER TABLE net_worth_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read global and own net worth categories" ON net_worth_categories
FOR SELECT USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Users can create own net worth categories" ON net_worth_categories
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own net worth categories" ON net_worth_categories
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own net worth categories" ON net_worth_categories
FOR DELETE USING (user_id = auth.uid());

-- 3. updated_at trigger
CREATE TRIGGER net_worth_categories_set_updated_at
BEFORE UPDATE ON net_worth_categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. ENTRIES GAIN A CATEGORY
ALTER TABLE net_worth_entries
ADD COLUMN category_id UUID REFERENCES net_worth_categories(id) ON DELETE SET NULL;

-- 5. TIGHTEN ENTRIES RLS (category must be global or owned)
DROP POLICY "Users can manage own net worth entries" ON net_worth_entries;

CREATE POLICY "Users can select own net worth entries" ON net_worth_entries
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own net worth entries" ON net_worth_entries
FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND (
    category_id IS NULL
    OR category_id IN (
      SELECT id FROM net_worth_categories
      WHERE user_id IS NULL OR user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update own net worth entries" ON net_worth_entries
FOR UPDATE USING (auth.uid() = user_id)
WITH CHECK (
  category_id IS NULL
  OR category_id IN (
    SELECT id FROM net_worth_categories
    WHERE user_id IS NULL OR user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own net worth entries" ON net_worth_entries
FOR DELETE USING (auth.uid() = user_id);
```

- [ ] **Step 2: Add the global defaults to seed.sql**

Append to `supabase/seed.sql`:

```sql
-- Global net worth asset categories (user_id NULL) available to all users.
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

- [ ] **Step 3: Add `net_worth_categories` to types/database.ts**

In `types/database.ts`, insert this block directly **before** the `net_worth_entries: {` block (alphabetical order):

```ts
      net_worth_categories: {
        Row: {
          created_at: string
          icon: string
          id: string
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          icon: string
          id?: string
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "net_worth_categories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 4: Add `category_id` to `net_worth_entries` types**

In `types/database.ts`, inside `net_worth_entries`:

- `Row`: insert `category_id: string | null` between `created_at: string` and `currency: string`.
- `Insert`: insert `category_id?: string | null` between `created_at?: string` and `currency?: string`.
- `Update`: insert `category_id?: string | null` between `created_at?: string` and `currency?: string`.
- `Relationships`: prepend the following object at the start of the array:

```ts
          {
            foreignKeyName: "net_worth_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "net_worth_categories"
            referencedColumns: ["id"]
          },
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/010_net_worth_categories.sql supabase/seed.sql types/database.ts
git commit -m "feat: net worth categories schema and types"
```

---

### Task 2: Add Handshake and CandlestickChart to the icon map

**Files:**
- Modify: `components/categories/category-icons.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `CATEGORY_ICONS` entries for `Handshake` and `CandlestickChart`, and both icons registered in the internal `categoryIconMap` so `CategoryIcon` renders them (default categories P2P and Stock Exchange use these slugs).

- [ ] **Step 1: Add imports**

In `components/categories/category-icons.tsx`, add `CandlestickChart` and `Handshake` to the `lucide-react` import block (keep alphabetical):

```tsx
import {
  Banknote,
  Briefcase,
  CandlestickChart,
  Car,
  Coffee,
  Droplets,
  Dumbbell,
  Film,
  Gift,
  GraduationCap,
  Handshake,
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
```

- [ ] **Step 2: Add picker options**

In `CATEGORY_ICONS`, insert two entries (after the `{ value: "Car", label: "Car" }` line to keep rough grouping is fine, but simplest is after `{ value: "Coffee", label: "Coffee" }`):

```tsx
  { value: "CandlestickChart", label: "Stocks" },
  { value: "Handshake", label: "P2P" },
```

- [ ] **Step 3: Register icons in the map**

In `categoryIconMap`, add `CandlestickChart,` and `Handshake,` (keep alphabetical, e.g. after `Car,`):

```tsx
const categoryIconMap: Record<string, LucideIcon> = {
  Utensils,
  ShoppingCart,
  Home,
  Car,
  CandlestickChart,
  Handshake,
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
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/categories/category-icons.tsx
git commit -m "feat: add candlestick and handshake icons for net worth categories"
```

---

### Task 3: `use-net-worth-categories` hook

**Files:**
- Create: `hooks/use-net-worth-categories.ts`

**Interfaces:**
- Consumes: `Tables` from `types/database.ts` (Task 1); `supabaseClient` from `lib/supabase/client.ts`.
- Produces:
  - `useNetWorthCategories()` returns `{ data: NetWorthCategory[] | undefined, isLoading: boolean, error: Error | null, createNetWorthCategory, updateNetWorthCategory, deleteNetWorthCategory }`
  - `createNetWorthCategory(input: { name: string; icon: string })` → `Promise<NetWorthCategory>`
  - `updateNetWorthCategory({ id: string } & Partial<{ name: string; icon: string }>)` → `Promise<NetWorthCategory>`
  - `deleteNetWorthCategory(id: string)` → `Promise<void>`
  - `NetWorthCategory = Tables<"net_worth_categories">`

- [ ] **Step 1: Write the hook**

Create `hooks/use-net-worth-categories.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert } from "@/types/database";

type NetWorthCategory = Tables<"net_worth_categories">;
type NetWorthCategoryInsert = TablesInsert<"net_worth_categories">;
type NetWorthCategoryInput = Omit<NetWorthCategoryInsert, "user_id">;

const queryKey = ["net-worth-categories"] as const;

const fetchNetWorthCategories = async (): Promise<NetWorthCategory[]> => {
  const { data, error } = await supabaseClient
    .from("net_worth_categories")
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

export function useNetWorthCategories() {
  const queryClient = useQueryClient();

  const categoriesQuery = useQuery({
    queryKey,
    queryFn: fetchNetWorthCategories,
  });

  const createNetWorthCategory = useMutation({
    mutationFn: async (input: NetWorthCategoryInput): Promise<NetWorthCategory> => {
      const user_id = await getCurrentUserId();
      const { data, error } = await supabaseClient
        .from("net_worth_categories")
        .insert({ ...input, user_id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async (newCategory) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<NetWorthCategory[]>(queryKey);
      const user_id = await getCurrentUserId();
      const now = new Date().toISOString();

      const optimistic: NetWorthCategory = {
        id: `temp-${Date.now()}`,
        user_id,
        name: newCategory.name,
        icon: newCategory.icon,
        created_at: now,
        updated_at: now,
      };

      queryClient.setQueryData<NetWorthCategory[]>(queryKey, (old) => [
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

  const updateNetWorthCategory = useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: { id: string } & Partial<NetWorthCategoryInsert>): Promise<NetWorthCategory> => {
      const { data, error } = await supabaseClient
        .from("net_worth_categories")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<NetWorthCategory[]>(queryKey);

      queryClient.setQueryData<NetWorthCategory[]>(queryKey, (old) =>
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

  const deleteNetWorthCategory = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabaseClient
        .from("net_worth_categories")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<NetWorthCategory[]>(queryKey);

      queryClient.setQueryData<NetWorthCategory[]>(queryKey, (old) =>
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
    createNetWorthCategory,
    updateNetWorthCategory,
    deleteNetWorthCategory,
  };
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/use-net-worth-categories.ts
git commit -m "feat: net worth categories query hook"
```

---

### Task 4: Extend `use-net-worth` with `category_id`

**Files:**
- Modify: `hooks/use-net-worth.ts`

**Interfaces:**
- Consumes: `NetWorthCategory` types via `types/database.ts` (Task 1); `EntryInput`, `EntryWithValues` from this file.
- Produces:
  - `EntryInput` gains `category_id?: string | null`.
  - `createEntry(input: EntryInput)` persists `category_id`.
  - `updateEntry({ id, name?, description?, category_id? })` persists `category_id` (null clears it).

- [ ] **Step 1: Add `category_id` to `EntryInput`**

In `hooks/use-net-worth.ts`, extend the `EntryInput` type:

```ts
export type EntryInput = {
  entry_type: EntryType;
  name: string;
  description?: string | null;
  category_id?: string | null;
  initialValue: number;
  initialAsOf?: string;
};
```

- [ ] **Step 2: Persist `category_id` in `createEntry`**

In the `createEntry.mutationFn`, add `category_id` to the insert object:

```ts
        .insert({
          entry_type: input.entry_type,
          name: input.name,
          description: input.description ?? null,
          category_id: input.category_id ?? null,
          currency: currency || "USD",
          user_id,
        })
```

In the `createEntry.onMutate`, add `category_id` to the optimistic entry object:

```ts
      const optimisticEntry: NetWorthEntry = {
        id: entryTempId,
        user_id,
        entry_type: newEntry.entry_type,
        name: newEntry.name,
        description: newEntry.description ?? null,
        category_id: newEntry.category_id ?? null,
        currency: currency || "USD",
        created_at: now,
        updated_at: now,
      };
```

- [ ] **Step 3: Persist `category_id` in `updateEntry`**

In `hooks/use-net-worth.ts`, change the `updateEntry` mutation so its input includes `category_id` and both the API call and optimistic update handle it:

```ts
  const updateEntry = useMutation({
    mutationFn: async ({
      id,
      ...rest
    }: {
      id: string;
      name?: string;
      description?: string | null;
      category_id?: string | null;
    }): Promise<NetWorthEntry> => {
      const { data, error } = await supabaseClient
        .from("net_worth_entries")
        .update({
          ...(rest.name !== undefined ? { name: rest.name } : {}),
          ...(rest.description !== undefined
            ? { description: rest.description ?? null }
            : {}),
          ...(rest.category_id !== undefined
            ? { category_id: rest.category_id ?? null }
            : {}),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, ...rest }) => {
      await queryClient.cancelQueries({ queryKey: netWorthKey });

      const previous = queryClient.getQueryData<NetWorthEntry[]>(entriesKey);

      queryClient.setQueryData<NetWorthEntry[]>(entriesKey, (old) =>
        (old ?? []).map((entry) => {
          if (entry.id !== id) return entry;
          return {
            ...entry,
            ...(rest.name !== undefined ? { name: rest.name } : {}),
            ...(rest.description !== undefined
              ? { description: rest.description ?? null }
              : {}),
            ...(rest.category_id !== undefined
              ? { category_id: rest.category_id ?? null }
              : {}),
          };
        })
      );

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(entriesKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: netWorthKey }),
  });
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add hooks/use-net-worth.ts
git commit -m "feat: persist category on net worth entries"
```

---

### Task 5: Category Select in the asset entry form

**Files:**
- Modify: `components/net-worth/entry-form.tsx`

**Interfaces:**
- Consumes: `useNetWorthCategories()` (Task 3), `useNetWorth` (Task 4), `CategoryIcon` + `CATEGORY_ICONS` (Task 2), Base UI `Select` primitives.
- Produces: create/edit asset flows send `category_id`; liabilities show no category field.

- [ ] **Step 1: Add imports**

In `components/net-worth/entry-form.tsx`, add imports:

```tsx
import { useNetWorthCategories } from "@/hooks/use-net-worth-categories";
import { CategoryIcon } from "@/components/categories/category-icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```

- [ ] **Step 2: Add category state and load options**

Inside the `EntryForm` component, after the existing `const [description, setDescription] = useState("");` line, add:

```tsx
  const [categoryId, setCategoryId] = useState("");
  const { data: categories } = useNetWorthCategories();
```

- [ ] **Step 3: Reset category on open**

In the `useEffect` that resets form state on `open`, set the category. Change:

```tsx
    if (entry) {
      setName(entry.name);
      setDescription(entry.description ?? "");
      setRows(
        entry.values.map((v) => ({
          id: v.id,
          as_of: v.as_of,
          value: String(v.value),
        }))
      );
    } else {
      setName("");
      setDescription("");
      setRows([{ as_of: todayInput(), value: "" }]);
    }
```

to:

```tsx
    if (entry) {
      setName(entry.name);
      setDescription(entry.description ?? "");
      setCategoryId(entry.category_id ?? "");
      setRows(
        entry.values.map((v) => ({
          id: v.id,
          as_of: v.as_of,
          value: String(v.value),
        }))
      );
    } else {
      setName("");
      setDescription("");
      setCategoryId("");
      setRows([{ as_of: todayInput(), value: "" }]);
    }
```

Also add `entry.category_id` to the effect's dependency array:

```tsx
  }, [open, entry, entry?.category_id]);
```

- [ ] **Step 4: Render the category Select (assets only)**

In the JSX, insert this block **between** the Name field's closing `</div>` and the Description field's opening `<div className="grid gap-1.5">` (i.e. after the Name grid div, before Description). Only assets show it:

```tsx
          {entryType === "asset" && (
            <div className="grid gap-1.5">
              <Label htmlFor="category">Category</Label>
              <Select
                value={categoryId}
                onValueChange={(value) => value !== null && setCategoryId(value)}
                items={(categories ?? []).map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
              >
                <SelectTrigger id="category" className="w-full">
                  <SelectValue>
                    {(value) => {
                      const cat = categories?.find((c) => c.id === value);
                      return cat ? (
                        <>
                          <CategoryIcon slug={cat.icon} className="h-4 w-4 text-fog" />
                          {cat.name}
                        </>
                      ) : (
                        "No category"
                      );
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No category</SelectItem>
                  {(categories ?? []).map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      <CategoryIcon slug={category.icon} className="h-4 w-4 text-fog" />
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
```

Note: `SelectItem value=""` provides the "No category" option; it must be the first item.

- [ ] **Step 5: Send `category_id` on submit**

In `handleSubmit`, change the `updateEntry` call to include `category_id`:

```tsx
        await updateEntry.mutateAsync({
          id: entry.id,
          name: name.trim(),
          description: description.trim() || null,
          category_id: categoryId || null,
        });
```

And change the `createEntry` call to include `category_id`:

```tsx
        await createEntry.mutateAsync({
          entry_type: entryType,
          name: name.trim(),
          description: description.trim() || null,
          category_id: categoryId || null,
          initialValue: Number(first.value),
          initialAsOf: first.as_of,
        });
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/net-worth/entry-form.tsx
git commit -m "feat: category select in asset entry form"
```

---

### Task 6: Category badge column in the asset list

**Files:**
- Modify: `components/net-worth/entry-list.tsx`

**Interfaces:**
- Consumes: `useNetWorthCategories()` (Task 3), `CategoryIcon` (Task 2), `Badge` from `components/ui/badge`.
- Produces: assets table shows a Category column with icon+name badges; liabilities table is unchanged.

- [ ] **Step 1: Add imports**

In `components/net-worth/entry-list.tsx`, add:

```tsx
import { Badge } from "@/components/ui/badge";
import { useNetWorthCategories } from "@/hooks/use-net-worth-categories";
import { CategoryIcon } from "@/components/categories/category-icons";
```

- [ ] **Step 2: Load categories and build a lookup map**

Inside the `EntryList` component, after `const { currency } = usePrimaryCurrency();`, add:

```tsx
  const { data: categories } = useNetWorthCategories();
```

And after the existing `total` `useMemo`, add:

```tsx
  const categoryMap = useMemo(() => {
    const map = new Map<string, { name: string; icon: string }>();
    for (const c of categories ?? []) {
      map.set(c.id, { name: c.name, icon: c.icon });
    }
    return map;
  }, [categories]);
```

- [ ] **Step 3: Add the header cell (assets only)**

In the `<TableHeader>`, change:

```tsx
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
```

to:

```tsx
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                {entryType === "asset" && <TableHead>Category</TableHead>}
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
```

- [ ] **Step 4: Add the category cell (assets only)**

Inside the map over `entries`, after the `<TableCell>` containing the name/description div and before the value `<TableCell>`, insert:

```tsx
                    {entryType === "asset" && (
                      <TableCell>
                        {entry.category_id ? (
                          <Badge
                            variant="outline"
                            className="bg-secondary text-secondary-foreground"
                          >
                            <CategoryIcon
                              slug={
                                categoryMap.get(entry.category_id)?.icon ?? "Tag"
                              }
                              className="h-3.5 w-3.5"
                            />
                            {categoryMap.get(entry.category_id)?.name ??
                              "Uncategorized"}
                          </Badge>
                        ) : null}
                      </TableCell>
                    )}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/net-worth/entry-list.tsx
git commit -m "feat: category badge column in asset list"
```

---

### Task 7: Net Worth categories management in Settings

**Files:**
- Create: `components/net-worth/net-worth-category-list.tsx`
- Create: `components/net-worth/net-worth-category-form.tsx`
- Modify: `app/dashboard/settings/page.tsx`

**Interfaces:**
- Consumes: `useNetWorthCategories()` (Task 3), `CATEGORY_ICONS` + `CategoryIcon` (Task 2), shadcn primitives (`Dialog`, `DropdownMenu`, `Badge`, `Button`, `Input`, `Label`, `AlertDialog`).
- Produces: `NetWorthCategoryList` component used by the Settings page card.

- [ ] **Step 1: Create the category form dialog**

Create `components/net-worth/net-worth-category-form.tsx`:

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
import { useNetWorthCategories } from "@/hooks/use-net-worth-categories";
import { CATEGORY_ICONS, CategoryIcon } from "@/components/categories/category-icons";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database";

type NetWorthCategory = Tables<"net_worth_categories">;

interface NetWorthCategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: NetWorthCategory | null;
}

export function NetWorthCategoryForm({
  open,
  onOpenChange,
  category,
}: NetWorthCategoryFormProps) {
  const { createNetWorthCategory, updateNetWorthCategory } = useNetWorthCategories();

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
        await updateNetWorthCategory.mutateAsync({ id: category.id, ...payload });
      } else {
        await createNetWorthCategory.mutateAsync(payload);
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
            {category ? "Edit Net Worth Category" : "Add Net Worth Category"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="nwc-name">Name</Label>
            <Input
              id="nwc-name"
              type="text"
              placeholder="Real Estate"
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

- [ ] **Step 2: Create the category list component**

Create `components/net-worth/net-worth-category-list.tsx`:

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
import { useNetWorthCategories } from "@/hooks/use-net-worth-categories";
import { CategoryIcon } from "@/components/categories/category-icons";
import { NetWorthCategoryForm } from "./net-worth-category-form";
import type { Tables } from "@/types/database";

type NetWorthCategory = Tables<"net_worth_categories">;

export function NetWorthCategoryList() {
  const { data: categories, isLoading, deleteNetWorthCategory } = useNetWorthCategories();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<NetWorthCategory | null>(null);
  const [deleting, setDeleting] = useState<NetWorthCategory | null>(null);

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

  const openEdit = (category: NetWorthCategory) => {
    setEditing(category);
    setFormOpen(true);
  };

  const confirmDelete = () => {
    if (deleting) {
      deleteNetWorthCategory.mutate(deleting.id);
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
                    <span className="flex items-center gap-2.5 text-sm text-foreground">
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
                  <span className="flex items-center gap-2.5 text-sm text-foreground">
                    <CategoryIcon
                      slug={category.icon}
                      className="h-4 w-4 text-fog"
                    />
                    {category.name}
                  </span>
                  <Badge
                    variant="outline"
                    className="bg-secondary text-secondary-foreground"
                  >
                    Global
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <NetWorthCategoryForm
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
              Assets using this category will become uncategorized. This action
              cannot be undone.
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

- [ ] **Step 3: Add the Settings card**

In `app/dashboard/settings/page.tsx`:

Add the import:

```tsx
import { NetWorthCategoryList } from "@/components/net-worth/net-worth-category-list";
```

Insert a new card **between** the Categories card (`</Card>` after the CategoryList `CardContent`) and the Sign out card:

```tsx
      <Card className="border-border/50 bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Net Worth categories
          </CardTitle>
          <CardDescription>
            Categorize your assets. Global defaults are read-only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NetWorthCategoryList />
        </CardContent>
      </Card>
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/net-worth/net-worth-category-list.tsx components/net-worth/net-worth-category-form.tsx app/dashboard/settings/page.tsx
git commit -m "feat: net worth category management in settings"
```

---

### Task 8: AGENTS.md + final verification

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update AGENTS.md**

In `AGENTS.md`:

1. In section 5 (Supabase And Environment), under the migration state list, add after the `009_net_worth_value_history.sql` bullet:

```md
- `010_net_worth_categories.sql`: `net_worth_categories` table (global `user_id IS NULL` read-only defaults + user custom), nullable `net_worth_entries.category_id` (ON DELETE SET NULL), tightened INSERT/UPDATE RLS on `net_worth_entries` so `category_id` must be global or owned. Not yet run remotely; apply via Supabase dashboard SQL editor after 009. Defaults (Money, P2P, Stock Exchange, PPR) seeded in `seed.sql`.
```

2. In section 2 (Current Architecture Map), add to the components/ hooks lists:

```txt
hooks/
  use-net-worth-categories.ts   # Net worth asset category CRUD
components/
  net-worth/                    # Net worth summary, evolution chart, entry lists/forms, category management
```

3. In section 6 (Current Feature State), add a bullet under the Net Worth item:

```md
- Net Worth assets support optional categories: four read-only global defaults
  (Money, P2P, Stock Exchange, PPR) plus user-custom categories (managed in
  Settings); assets show a category badge and pick one in the asset form.
  Liabilities are unaffected. RLS validates that an entry's category is global
  or owned by the user.
```

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: no TS errors; 50 tests pass; build completes with `/dashboard/net-worth` and `/dashboard/settings` prerendered.

- [ ] **Step 3: Manual smoke checklist**

1. Settings → Net Worth categories: the 4 defaults visible, read-only, with "Global" badge.
2. Add a custom category (e.g. "Real Estate" / `Home`), verify it appears under "Your categories".
3. Edit the custom category name/icon; verify optimistic update + persistence.
4. Delete the custom category; verify AlertDialog and removal.
5. Net Worth → Add Asset: Category select appears (assets only); pick "Money"; save.
6. Asset row shows the category badge. Edit the asset and change category to a custom one.
7. Delete the custom category that an asset uses → asset row becomes badge-less (uncategorized).
8. Add Liability: confirm there is no Category field; liability rows have no Category column.
9. Toggle dark mode: badges, cards, and dialogs render correctly.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: record net worth categories migration and feature state"
```
