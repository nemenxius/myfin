# Net Worth Value History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-current-value + DB-snapshot Net Worth model with per-entry dated value rows, so users can backfill historical values and the chart reconstructs history deterministically.

**Architecture:** Entries (`net_worth_entries`) lose their `value` column; a new child table `net_worth_entry_values(entry_id, as_of, value)` stores dated value points (one per item per date). The `net_worth_snapshots` table + `record_net_worth_snapshot()` trigger are dropped entirely. Current value = latest `as_of` row; history is reconstructed client-side in `lib/net-worth/math.ts` by summing each entry's latest value at-or-before each unique date. Migration 009 wipes the existing 008 test data (user-confirmed).

**Tech Stack:** Supabase Postgres + RLS, Next.js 16, React 19, TanStack Query v5, Vitest, date-fns.

## Global Constraints

- Migration 009 is the source of truth for the new schema; `types/database.ts` is hand-edited to match (Supabase CLI not installed).
- Components never call Supabase directly — only hooks in `hooks/`.
- Every mutation: optimistic `onMutate` (snapshot/apply/return previous), `onError` rollback, `onSettled` invalidation of the combined `["net-worth"]` key.
- `user_id` is resolved inside the hook via `auth.getUser()`; callers never pass it.
- `value` is clamped `Math.max(0, value)` app-side; liabilities are stored as positive magnitudes; net worth = assets − liabilities.
- No FX conversion; entries stay restricted to the profile display currency (stored at create time).
- Verification commands: `npx tsc --noEmit` (NOT `npm run lint`), `npm test`, `npm run build`.
- Do NOT touch the unrelated uncommitted working-tree changes: `lib/market-data/providers/yahoo.ts`, `lib/portfolio/math.test.ts`, `lib/market-data/providers/yahoo.test.ts`.
- Migration 009 must NOT be applied to the remote DB until Task 4 lands (the app code still writes the `value` column before then). Applying it is a manual user step.
- `as_of` is a plain `date` (YYYY-MM-DD string in the generated types).
- Task 2 deliberately introduces a transient tsc failure in `hooks/use-net-worth.ts`; Task 3 resolves it. That is expected and documented in Task 2 — do not treat it as an error.

---

### Task 1: Migration 009 + schema

**Files:**
- Create: `supabase/migrations/009_net_worth_value_history.sql`

**Interfaces:**
- Consumes: migration 008 (already applied remotely) and `set_updated_at()` from migration 007 (already applied remotely).
- Produces: the DB schema that Tasks 3–4 and `types/database.ts` will match. The new table's client-facing shape (used by Task 3's hook) is `{ id, entry_id, as_of (string date), value (number), created_at, updated_at }`; the entry row after this migration is `{ id, user_id, entry_type, name, description, currency, created_at, updated_at }` (no `value`).

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/009_net_worth_value_history.sql` with exactly:

```sql
-- supabase/migrations/009_net_worth_value_history.sql

-- 1. WIPE EXISTING 008 TEST DATA (user-confirmed: only test data exists)
TRUNCATE TABLE net_worth_snapshots;
TRUNCATE TABLE net_worth_entries;

-- 2. DROP THE SNAPSHOT MODEL
DROP TRIGGER IF EXISTS net_worth_entries_record_snapshot ON net_worth_entries;
DROP FUNCTION IF EXISTS record_net_worth_snapshot();
DROP TABLE net_worth_snapshots;

-- 3. DROP THE SINGLE-VALUE COLUMN
ALTER TABLE net_worth_entries DROP COLUMN value;

-- 4. VALUE HISTORY TABLE
CREATE TABLE net_worth_entry_values (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID REFERENCES net_worth_entries(id) ON DELETE CASCADE NOT NULL,
  as_of DATE NOT NULL,
  value NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  CONSTRAINT net_worth_entry_values_entry_as_of_key UNIQUE (entry_id, as_of)
);

CREATE INDEX idx_net_worth_entry_values_entry_date ON net_worth_entry_values(entry_id, as_of);

-- 5. RLS
ALTER TABLE net_worth_entry_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own entry values" ON net_worth_entry_values
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM net_worth_entries e
    WHERE e.id = entry_id AND e.user_id = auth.uid()
  )
);

-- 6. updated_at trigger (requires set_updated_at() from 007, already applied remotely)
CREATE TRIGGER net_worth_entry_values_set_updated_at
BEFORE UPDATE ON net_worth_entry_values
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- [ ] **Step 2: Self-review the SQL**

- The TRUNCATE runs before the table drop and before any FK references the values table, so no `CASCADE` is needed.
- The RLS `FOR ALL USING (EXISTS ...)` uses the parent-entry ownership check, so INSERT/UPDATE/DELETE all verify the parent belongs to `auth.uid()` — the client never sends `user_id`.
- Both the `record_net_worth_snapshot` trigger/function and the `net_worth_snapshots` table are removed; `net_worth_entries.value` is dropped.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/009_net_worth_value_history.sql
git commit -m "feat: net worth value history migration 009"
```

---

### Task 2: Rewrite `lib/net-worth/math.ts` + tests (TDD)

**Files:**
- Rewrite: `lib/net-worth/math.ts`
- Rewrite: `lib/net-worth/math.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces (consumed by Task 3's hook and by entry-list/entry-form):
  - `interface ValueRowLike { as_of: string; value: number }`
  - `interface NetWorthEntryLike { id: string; entry_type: string; values: ValueRowLike[] }`
  - `entryCurrentValue(entry: NetWorthEntryLike): number | null`
  - `valueAsOf(entry: NetWorthEntryLike, date: string): number | null`
  - `computeTotals(entries: NetWorthEntryLike[], asOf?: string): { totalAssets: number; totalLiabilities: number }`
  - `computeNetWorth(entries: NetWorthEntryLike[], asOf?: string): number`
  - `collectValueDates(entries: NetWorthEntryLike[]): string[]`
  - `buildNetWorthSeries(entries: NetWorthEntryLike[]): NetWorthSeriesPoint[]` (unchanged point shape `{ label, value, assets, liabilities }`)
  - `monthDelta(entries: NetWorthEntryLike[], now?: Date): MonthDelta | null` (unchanged `{ amount, percent }`)
  - REMOVED: `shouldRecordSnapshot`, `sortSnapshotsChronologically`, `NetWorthSnapshotLike`.

> **Expected transient tsc failure:** this task removes exports that `hooks/use-net-worth.ts` still imports. That file is fixed in Task 3. Verification for THIS task is `npm test` only — vitest loads the test file independently and does not type-check the app. Do not run/fix the hook here.

- [ ] **Step 1: Write the failing tests**

Rewrite `lib/net-worth/math.test.ts` with exactly:

```ts
import { describe, expect, it } from "vitest";
import {
  buildNetWorthSeries,
  collectValueDates,
  computeNetWorth,
  computeTotals,
  entryCurrentValue,
  monthDelta,
  valueAsOf,
  type NetWorthEntryLike,
  type ValueRowLike,
} from "./math";

const value = (as_of: string, value: number): ValueRowLike => ({ as_of, value });

const entry = (
  id: string,
  entry_type: "asset" | "liability",
  values: ValueRowLike[]
): NetWorthEntryLike => ({ id, entry_type, values });

describe("entryCurrentValue", () => {
  it("returns null when the entry has no value rows", () => {
    expect(entryCurrentValue(entry("a", "asset", []))).toBeNull();
  });

  it("returns the latest dated value", () => {
    const e = entry("a", "asset", [
      value("2026-05-01", 20000),
      value("2026-06-01", 21000),
    ]);
    expect(entryCurrentValue(e)).toBe(21000);
  });
});

describe("valueAsOf", () => {
  it("returns the value at or before the date", () => {
    const e = entry("a", "asset", [
      value("2026-05-01", 20000),
      value("2026-06-01", 21000),
    ]);
    expect(valueAsOf(e, "2026-05-15")).toBe(20000);
    expect(valueAsOf(e, "2026-06-15")).toBe(21000);
  });

  it("returns null before the first dated value", () => {
    const e = entry("a", "asset", [value("2026-06-01", 21000)]);
    expect(valueAsOf(e, "2026-04-01")).toBeNull();
  });
});

describe("computeTotals", () => {
  it("returns zero totals for no entries", () => {
    expect(computeTotals([])).toEqual({ totalAssets: 0, totalLiabilities: 0 });
  });

  it("sums each entry's latest value at or before the given date", () => {
    const bank = entry("a", "asset", [
      value("2026-05-01", 20000),
      value("2026-06-01", 21000),
    ]);
    const loan = entry("l", "liability", [
      value("2026-05-01", 15000),
      value("2026-06-01", 16000),
    ]);
    expect(computeTotals([bank, loan], "2026-05-15")).toEqual({
      totalAssets: 20000,
      totalLiabilities: 15000,
    });
    expect(computeTotals([bank, loan], "2026-06-15")).toEqual({
      totalAssets: 21000,
      totalLiabilities: 16000,
    });
  });

  it("ignores entries with no applicable value as of the date", () => {
    const bank = entry("a", "asset", [value("2026-06-01", 21000)]);
    expect(computeTotals([bank], "2026-04-01")).toEqual({
      totalAssets: 0,
      totalLiabilities: 0,
    });
  });

  it("defaults to today when no asOf is given", () => {
    const bank = entry("a", "asset", [value("2024-01-01", 1000)]);
    expect(computeTotals([bank])).toEqual({
      totalAssets: 1000,
      totalLiabilities: 0,
    });
  });
});

describe("computeNetWorth", () => {
  it("computes assets minus liabilities as of a date", () => {
    const bank = entry("a", "asset", [value("2026-06-01", 21000)]);
    const loan = entry("l", "liability", [value("2026-06-01", 16000)]);
    expect(computeNetWorth([bank, loan], "2026-06-01")).toBe(5000);
  });
});

describe("collectValueDates", () => {
  it("returns sorted unique dates across all entries", () => {
    const bank = entry("a", "asset", [
      value("2026-06-01", 21000),
      value("2026-05-01", 20000),
    ]);
    const loan = entry("l", "liability", [
      value("2026-06-01", 16000),
      value("2026-04-01", 15000),
    ]);
    expect(collectValueDates([bank, loan])).toEqual([
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
    ]);
  });
});

describe("buildNetWorthSeries", () => {
  it("reconstructs net worth at each unique date", () => {
    const bank = entry("a", "asset", [
      value("2026-05-01", 20000),
      value("2026-06-01", 21000),
    ]);
    const loan = entry("l", "liability", [value("2026-06-01", 15000)]);
    expect(buildNetWorthSeries([bank, loan])).toEqual([
      { label: "May 2026", value: 20000, assets: 20000, liabilities: 0 },
      {
        label: "Jun 2026",
        value: 6000,
        assets: 21000,
        liabilities: 15000,
      },
    ]);
  });
});

describe("monthDelta", () => {
  const now = new Date("2026-08-07T12:00:00Z");

  it("returns null when no value date precedes the current month", () => {
    const bank = entry("a", "asset", [value("2026-08-01", 60000)]);
    expect(monthDelta([bank], now)).toBeNull();
  });

  it("computes the change from the last date before the current month", () => {
    const bank = entry("a", "asset", [
      value("2026-07-15", 50000),
      value("2026-08-01", 60000),
    ]);
    expect(monthDelta([bank], now)).toEqual({ amount: 10000, percent: 20 });
  });

  it("returns null percent when the baseline is zero", () => {
    const bank = entry("a", "asset", [
      value("2026-06-01", 0),
      value("2026-08-01", 500),
    ]);
    expect(monthDelta([bank], now)).toEqual({ amount: 500, percent: null });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL (imports like `shouldRecordSnapshot` from the old module no longer exist, or the file fails to compile against the current `math.ts`).

- [ ] **Step 3: Write the new math module**

Rewrite `lib/net-worth/math.ts` with exactly:

```ts
import { format, startOfMonth } from "date-fns";

export interface ValueRowLike {
  as_of: string;
  value: number;
}

export interface NetWorthEntryLike {
  id: string;
  entry_type: string;
  values: ValueRowLike[];
}

export interface NetWorthTotals {
  totalAssets: number;
  totalLiabilities: number;
}

export interface NetWorthSeriesPoint {
  label: string;
  value: number;
  assets: number;
  liabilities: number;
}

export interface MonthDelta {
  amount: number;
  percent: number | null;
}

const MAX_POINTS = 366;

const todayString = (): string => format(new Date(), "yyyy-MM-dd");

export function entryCurrentValue(entry: NetWorthEntryLike): number | null {
  if (entry.values.length === 0) return null;
  const latest = [...entry.values].sort((a, b) =>
    b.as_of.localeCompare(a.as_of)
  )[0];
  return latest.value;
}

export function valueAsOf(
  entry: NetWorthEntryLike,
  date: string
): number | null {
  const applicable = entry.values
    .filter((v) => v.as_of <= date)
    .sort((a, b) => b.as_of.localeCompare(a.as_of))[0];
  return applicable ? applicable.value : null;
}

export function computeTotals(
  entries: NetWorthEntryLike[],
  asOf: string = todayString()
): NetWorthTotals {
  let totalAssets = 0;
  let totalLiabilities = 0;
  for (const entry of entries) {
    const v = valueAsOf(entry, asOf);
    if (v === null) continue;
    if (entry.entry_type === "asset") totalAssets += v;
    else if (entry.entry_type === "liability") totalLiabilities += v;
  }
  return { totalAssets, totalLiabilities };
}

export function computeNetWorth(
  entries: NetWorthEntryLike[],
  asOf: string = todayString()
): number {
  const { totalAssets, totalLiabilities } = computeTotals(entries, asOf);
  return totalAssets - totalLiabilities;
}

export function collectValueDates(entries: NetWorthEntryLike[]): string[] {
  const dates = new Set<string>();
  for (const entry of entries) {
    for (const v of entry.values) dates.add(v.as_of);
  }
  return [...dates].sort((a, b) => a.localeCompare(b));
}

function samplePoints<T>(points: T[]): T[] {
  if (points.length <= MAX_POINTS) return points;
  const step = points.length / MAX_POINTS;
  const sampled: T[] = [];
  for (let i = 0; i < MAX_POINTS; i++) {
    sampled.push(points[Math.floor(i * step)]);
  }
  return sampled;
}

export function buildNetWorthSeries(
  entries: NetWorthEntryLike[]
): NetWorthSeriesPoint[] {
  const dates = collectValueDates(entries);
  return samplePoints(dates).map((date) => {
    const totals = computeTotals(entries, date);
    return {
      label: new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      }),
      value: totals.totalAssets - totals.totalLiabilities,
      assets: totals.totalAssets,
      liabilities: totals.totalLiabilities,
    };
  });
}

export function monthDelta(
  entries: NetWorthEntryLike[],
  now: Date = new Date()
): MonthDelta | null {
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const baselineDate = collectValueDates(entries)
    .filter((d) => d < monthStart)
    .sort((a, b) => b.localeCompare(a))[0];
  if (!baselineDate) return null;
  const currentNet = computeNetWorth(entries);
  const baselineNet = computeNetWorth(entries, baselineDate);
  const amount = currentNet - baselineNet;
  const percent =
    baselineNet !== 0 ? (amount / Math.abs(baselineNet)) * 100 : null;
  return { amount, percent };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — the full suite passes (the new net-worth math tests plus the existing portfolio/ledger/month suites). A known non-failing Vite config warning may appear; ignore it. (tsc failure in `hooks/use-net-worth.ts` is expected here — do NOT fix it in this task.)

- [ ] **Step 5: Commit**

```bash
git add lib/net-worth/math.ts lib/net-worth/math.test.ts
git commit -m "feat: rewrite net worth math for value rows"
```

---

### Task 3: Hand-edit types + rewrite the hook + migrate consumers

**Files:**
- Modify: `types/database.ts` (net_worth_entries block lines ~81–124, remove net_worth_snapshots block lines ~125–159, insert net_worth_entry_values block)
- Rewrite: `hooks/use-net-worth.ts`
- Modify: `components/net-worth/entry-list.tsx`
- Modify: `components/net-worth/entry-form.tsx`
- Modify: `components/net-worth/net-worth-overview.tsx`

**Interfaces:**
- Consumes: Task 1 schema (net_worth_entry_values), Task 2 math (`entryCurrentValue`, `computeTotals`, `buildNetWorthSeries`, `monthDelta`).
- Produces:
  - `useNetWorth()` returns: `{ ...entriesQuery, entries: EntryWithValues[], assets, liabilities, totals, netWorth, netWorthSeries, monthDelta, createEntry, updateEntry, deleteEntry, addValue, updateValue, deleteValue }`. NOTE: `snapshots` is gone from the return shape.
  - `type EntryType = "asset" | "liability"`
  - `type EntryWithValues = Tables<"net_worth_entries"> & { values: Tables<"net_worth_entry_values">[] }`
  - `type EntryInput = { entry_type: EntryType; name: string; description?: string | null; initialValue: number; initialAsOf?: string }`
  - `createEntry(input: EntryInput)` — inserts entry + first value row.
  - `updateEntry({ id, name?, description? })` — metadata only.
  - `deleteEntry(id)` — entries (value rows cascade via FK).
  - `addValue({ entryId, as_of, value })`, `updateValue({ id, as_of, value })`, `deleteValue(id)`.
  - `EntryForm` props (used by overview): `{ open, onOpenChange, entryType: EntryType, entry?: EntryWithValues | null }`.

- [ ] **Step 1: Hand-edit `types/database.ts`**

Open `types/database.ts`. In the `net_worth_entries` block:

- Row: delete the `value: number` line.
- Insert: delete the `value: number` line.
- Update: delete the `value?: number` line.

Then delete the entire `net_worth_snapshots: { ... }` block (Row/Insert/Update/Relationships).

Then insert this new block between the `net_worth_entries` block and the `profiles` block:

```ts
      net_worth_entry_values: {
        Row: {
          as_of: string
          created_at: string
          entry_id: string
          id: string
          updated_at: string
          value: number
        }
        Insert: {
          as_of: string
          created_at?: string
          entry_id: string
          id?: string
          updated_at?: string
          value: number
        }
        Update: {
          as_of?: string
          created_at?: string
          entry_id?: string
          id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "net_worth_entry_values_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "net_worth_entries"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 2: Rewrite `hooks/use-net-worth.ts`**

Replace the entire file with:

```ts
"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase/client";
import { usePrimaryCurrency } from "./use-primary-currency";
import {
  buildNetWorthSeries,
  computeTotals,
  monthDelta,
} from "@/lib/net-worth/math";
import type { Tables } from "@/types/database";

type NetWorthEntry = Tables<"net_worth_entries">;
type NetWorthValue = Tables<"net_worth_entry_values">;

export type EntryType = "asset" | "liability";

export type EntryWithValues = NetWorthEntry & { values: NetWorthValue[] };

export type EntryInput = {
  entry_type: EntryType;
  name: string;
  description?: string | null;
  initialValue: number;
  initialAsOf?: string;
};

export type ValueInput = {
  as_of: string;
  value: number;
};

const netWorthKey = ["net-worth"] as const;
const entriesKey = ["net-worth", "entries"] as const;
const valuesKey = ["net-worth", "values"] as const;

const fetchEntries = async (): Promise<NetWorthEntry[]> => {
  const { data, error } = await supabaseClient
    .from("net_worth_entries")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
};

const fetchValues = async (): Promise<NetWorthValue[]> => {
  const { data, error } = await supabaseClient
    .from("net_worth_entry_values")
    .select("*")
    .order("as_of", { ascending: true });

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

const todayString = (): string => new Date().toISOString().slice(0, 10);

export function useNetWorth() {
  const queryClient = useQueryClient();
  const { currency } = usePrimaryCurrency();

  const entriesQuery = useQuery({
    queryKey: entriesKey,
    queryFn: fetchEntries,
  });

  const valuesQuery = useQuery({
    queryKey: valuesKey,
    queryFn: fetchValues,
  });

  const rawEntries = entriesQuery.data ?? [];
  const rawValues = valuesQuery.data ?? [];

  const entries = useMemo<EntryWithValues[]>(() => {
    const byEntry = new Map<string, NetWorthValue[]>();
    for (const v of rawValues) {
      const list = byEntry.get(v.entry_id) ?? [];
      list.push(v);
      byEntry.set(v.entry_id, list);
    }
    return rawEntries.map((entry) => ({
      ...entry,
      values: (byEntry.get(entry.id) ?? []).sort((a, b) =>
        a.as_of.localeCompare(b.as_of)
      ),
    }));
  }, [rawEntries, rawValues]);

  const assets = useMemo(
    () => entries.filter((entry) => entry.entry_type === "asset"),
    [entries]
  );

  const liabilities = useMemo(
    () => entries.filter((entry) => entry.entry_type === "liability"),
    [entries]
  );

  const totals = useMemo(() => computeTotals(entries), [entries]);
  const netWorth = totals.totalAssets - totals.totalLiabilities;
  const netWorthSeries = useMemo(() => buildNetWorthSeries(entries), [entries]);
  const delta = useMemo(() => monthDelta(entries), [entries]);

  const createEntry = useMutation({
    mutationFn: async (input: EntryInput): Promise<NetWorthEntry> => {
      const user_id = await getCurrentUserId();
      const { data, error } = await supabaseClient
        .from("net_worth_entries")
        .insert({
          entry_type: input.entry_type,
          name: input.name,
          description: input.description ?? null,
          currency: currency || "USD",
          user_id,
        })
        .select()
        .single();

      if (error) throw error;

      const { error: valueError } = await supabaseClient
        .from("net_worth_entry_values")
        .insert({
          entry_id: data.id,
          as_of: input.initialAsOf ?? todayString(),
          value: Math.max(0, input.initialValue),
        });

      if (valueError) throw valueError;
      return data;
    },
    onMutate: async (newEntry) => {
      await queryClient.cancelQueries({ queryKey: netWorthKey });

      const previousEntries =
        queryClient.getQueryData<NetWorthEntry[]>(entriesKey);
      const previousValues =
        queryClient.getQueryData<NetWorthValue[]>(valuesKey);
      const user_id = await getCurrentUserId();
      const now = new Date().toISOString();
      const tempId = `temp-${Date.now()}`;

      const optimisticEntry: NetWorthEntry = {
        id: tempId,
        user_id,
        entry_type: newEntry.entry_type,
        name: newEntry.name,
        description: newEntry.description ?? null,
        currency: currency || "USD",
        created_at: now,
        updated_at: now,
      };

      const optimisticValue: NetWorthValue = {
        id: `temp-${Date.now()}-v`,
        entry_id: tempId,
        as_of: newEntry.initialAsOf ?? todayString(),
        value: Math.max(0, newEntry.initialValue),
        created_at: now,
        updated_at: now,
      };

      queryClient.setQueryData<NetWorthEntry[]>(entriesKey, (old) => [
        ...(old ?? []),
        optimisticEntry,
      ]);
      queryClient.setQueryData<NetWorthValue[]>(valuesKey, (old) => [
        ...(old ?? []),
        optimisticValue,
      ]);

      return { previousEntries, previousValues };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousEntries) {
        queryClient.setQueryData(entriesKey, context.previousEntries);
      }
      if (context?.previousValues) {
        queryClient.setQueryData(valuesKey, context.previousValues);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: netWorthKey }),
  });

  const updateEntry = useMutation({
    mutationFn: async ({
      id,
      ...rest
    }: {
      id: string;
      name?: string;
      description?: string | null;
    }): Promise<NetWorthEntry> => {
      const { data, error } = await supabaseClient
        .from("net_worth_entries")
        .update({
          ...(rest.name !== undefined ? { name: rest.name } : {}),
          ...(rest.description !== undefined
            ? { description: rest.description ?? null }
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

  const deleteEntry = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabaseClient
        .from("net_worth_entries")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: netWorthKey });

      const previousEntries =
        queryClient.getQueryData<NetWorthEntry[]>(entriesKey);
      const previousValues =
        queryClient.getQueryData<NetWorthValue[]>(valuesKey);

      queryClient.setQueryData<NetWorthEntry[]>(entriesKey, (old) =>
        (old ?? []).filter((entry) => entry.id !== id)
      );
      queryClient.setQueryData<NetWorthValue[]>(valuesKey, (old) =>
        (old ?? []).filter((v) => v.entry_id !== id)
      );

      return { previousEntries, previousValues };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousEntries) {
        queryClient.setQueryData(entriesKey, context.previousEntries);
      }
      if (context?.previousValues) {
        queryClient.setQueryData(valuesKey, context.previousValues);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: netWorthKey }),
  });

  const addValue = useMutation({
    mutationFn: async ({
      entryId,
      ...input
    }: { entryId: string } & ValueInput): Promise<NetWorthValue> => {
      const { data, error } = await supabaseClient
        .from("net_worth_entry_values")
        .insert({
          entry_id: entryId,
          as_of: input.as_of,
          value: Math.max(0, input.value),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ entryId, ...input }) => {
      await queryClient.cancelQueries({ queryKey: netWorthKey });

      const previous = queryClient.getQueryData<NetWorthValue[]>(valuesKey);
      const now = new Date().toISOString();

      const optimistic: NetWorthValue = {
        id: `temp-${Date.now()}`,
        entry_id: entryId,
        as_of: input.as_of,
        value: Math.max(0, input.value),
        created_at: now,
        updated_at: now,
      };

      queryClient.setQueryData<NetWorthValue[]>(valuesKey, (old) => [
        ...(old ?? []),
        optimistic,
      ]);

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(valuesKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: netWorthKey }),
  });

  const updateValue = useMutation({
    mutationFn: async ({
      id,
      ...input
    }: { id: string } & ValueInput): Promise<NetWorthValue> => {
      const { data, error } = await supabaseClient
        .from("net_worth_entry_values")
        .update({
          as_of: input.as_of,
          value: Math.max(0, input.value),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, ...input }) => {
      await queryClient.cancelQueries({ queryKey: netWorthKey });

      const previous = queryClient.getQueryData<NetWorthValue[]>(valuesKey);

      queryClient.setQueryData<NetWorthValue[]>(valuesKey, (old) =>
        (old ?? []).map((v) =>
          v.id === id
            ? { ...v, as_of: input.as_of, value: Math.max(0, input.value) }
            : v
        )
      );

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(valuesKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: netWorthKey }),
  });

  const deleteValue = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabaseClient
        .from("net_worth_entry_values")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: netWorthKey });

      const previous = queryClient.getQueryData<NetWorthValue[]>(valuesKey);

      queryClient.setQueryData<NetWorthValue[]>(valuesKey, (old) =>
        (old ?? []).filter((v) => v.id !== id)
      );

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(valuesKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: netWorthKey }),
  });

  return {
    ...entriesQuery,
    entries,
    assets,
    liabilities,
    totals,
    netWorth,
    netWorthSeries,
    monthDelta: delta,
    createEntry,
    updateEntry,
    deleteEntry,
    addValue,
    updateValue,
    deleteValue,
  };
}
```

- [ ] **Step 3: Update `components/net-worth/entry-list.tsx`**

Two changes:

1. Add the import (after the `formatCurrency` import):

```ts
import { entryCurrentValue } from "@/lib/net-worth/math";
```

2. Replace the `total` memo:

```ts
  const total = useMemo(
    () =>
      entries.reduce(
        (sum, entry) => sum + (entryCurrentValue(entry) ?? 0),
        0
      ),
    [entries]
  );
```

3. Replace the value cell:

```tsx
                  <TableCell className="text-right font-mono tabular-nums text-ink">
                    {formatCurrency(entryCurrentValue(entry) ?? 0, currency)}
                  </TableCell>
```

- [ ] **Step 4: Update `components/net-worth/entry-form.tsx`**

Replace the `NetWorthEntry` type alias and `EntryFormProps`:

- Change `import { useNetWorth, type EntryType } from "@/hooks/use-net-worth";` to `import { useNetWorth, type EntryType, type EntryWithValues } from "@/hooks/use-net-worth";`
- Remove `import type { Tables } from "@/types/database";`
- Delete `type NetWorthEntry = Tables<"net_worth_entries">;`
- Change the prop type: `entry?: EntryWithValues | null;`

Update the two value references to derive from the latest value row instead of the deleted `value` column:

1. In the reset `useEffect`, replace:

```ts
      setName(entry.name);
      setDescription(entry.description ?? "");
      setValue(String(entry.value));
```

with:

```ts
      setName(entry.name);
      setDescription(entry.description ?? "");
      setValue(
        String(entry.values.length > 0 ? entry.values[entry.values.length - 1].value : "")
      );
```

(`entry.values` is sorted ascending by `as_of` in the hook, so the last element is the current value.)

2. In the submit payload, replace:

```ts
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      value: Number(value),
    };
```

with:

```ts
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
    };
```

and replace:

```ts
      if (entry) {
        await updateEntry.mutateAsync({ id: entry.id, ...payload });
      } else {
        await createEntry.mutateAsync({ entry_type: entryType, ...payload });
      }
```

with:

```ts
      if (entry) {
        await updateEntry.mutateAsync({ id: entry.id, ...payload });
      } else {
        await createEntry.mutateAsync({
          entry_type: entryType,
          ...payload,
          initialValue: Number(value),
        });
      }
```

(This keeps the app compiling and functional: edit updates metadata only, create seeds the first value row. Task 4 replaces this form with the full value-history editor.)

- [ ] **Step 5: Update `components/net-worth/net-worth-overview.tsx`**

The overview's `editing` state must hold `EntryWithValues` so the entry form receives the value rows:

- Change `import { useNetWorth, type EntryType } from "@/hooks/use-net-worth";` to `import { useNetWorth, type EntryType, type EntryWithValues } from "@/hooks/use-net-worth";`
- Remove `import type { Tables } from "@/types/database";`
- Delete `type NetWorthEntry = Tables<"net_worth_entries">;`
- Change `const [editing, setEditing] = useState<NetWorthEntry | null>(null);` to `const [editing, setEditing] = useState<EntryWithValues | null>(null);`
- Change the `openEdit` handler signature from `(entry: NetWorthEntry)` to `(entry: EntryWithValues)`.

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. This is the first task where the whole app type-checks against the new model.

- [ ] **Step 7: Commit**

```bash
git add types/database.ts hooks/use-net-worth.ts components/net-worth/entry-list.tsx components/net-worth/entry-form.tsx components/net-worth/net-worth-overview.tsx
git commit -m "feat: net worth value row hook, types, and consumers"
```

---

### Task 4: Value-history editor + AGENTS.md

**Files:**
- Rewrite: `components/net-worth/entry-form.tsx`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Task 3 hook (`createEntry`, `updateEntry`, `addValue`, `updateValue`, `deleteValue`), `EntryType`, `EntryWithValues`; existing UI primitives (`Dialog*`, `Button`, `Input`, `Label`, `Table*`); `format` from `date-fns`.
- Produces: the single dialog value-history editor used by `net-worth-overview.tsx`.

- [ ] **Step 1: Rewrite `components/net-worth/entry-form.tsx`**

Replace the entire file with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import {
  useNetWorth,
  type EntryType,
  type EntryWithValues,
} from "@/hooks/use-net-worth";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ValueDraft = {
  id?: string;
  as_of: string;
  value: string;
};

interface EntryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryType: EntryType;
  entry?: EntryWithValues | null;
}

interface FormErrors {
  name?: string;
  rows?: string;
}

const LABELS: Record<EntryType, string> = {
  asset: "Asset",
  liability: "Liability",
};

const todayInput = (): string => format(new Date(), "yyyy-MM-dd");

export function EntryForm({
  open,
  onOpenChange,
  entryType,
  entry,
}: EntryFormProps) {
  const { createEntry, updateEntry, addValue, updateValue, deleteValue } =
    useNetWorth();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<ValueDraft[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const label = LABELS[entryType];
  const isEdit = !!entry;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSubmitError(null);

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
  }, [open, entry]);

  const updateRow = (index: number, patch: Partial<ValueDraft>) => {
    setRows((old) => old.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    setRows((old) => [...old, { as_of: todayInput(), value: "" }]);
  };

  const removeRow = (index: number) => {
    setRows((old) => old.filter((_, i) => i !== index));
  };

  const validate = (): boolean => {
    const next: FormErrors = {};

    if (!name.trim()) {
      next.name = "Please enter a name.";
    }
    if (rows.length === 0) {
      next.rows = "Add at least one value.";
    } else {
      const badRow = rows.some(
        (row) =>
          !row.as_of ||
          row.value === "" ||
          Number.isNaN(Number(row.value)) ||
          Number(row.value) < 0
      );
      if (badRow) {
        next.rows = "Each value needs a date and a number 0 or greater.";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitError(null);

    try {
      if (isEdit && entry) {
        await updateEntry.mutateAsync({
          id: entry.id,
          name: name.trim(),
          description: description.trim() || null,
        });

        const keptIds = new Set(
          rows.filter((r) => r.id).map((r) => r.id as string)
        );

        for (const row of rows) {
          if (row.id) {
            await updateValue.mutateAsync({
              id: row.id,
              as_of: row.as_of,
              value: Number(row.value),
            });
          } else {
            await addValue.mutateAsync({
              entryId: entry.id,
              as_of: row.as_of,
              value: Number(row.value),
            });
          }
        }

        for (const v of entry.values) {
          if (!keptIds.has(v.id)) {
            await deleteValue.mutateAsync(v.id);
          }
        }
      } else {
        const first = rows[0];
        await createEntry.mutateAsync({
          entry_type: entryType,
          name: name.trim(),
          description: description.trim() || null,
          initialValue: Number(first.value),
          initialAsOf: first.as_of,
        });
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${label}` : `Add ${label}`}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              placeholder={entryType === "asset" ? "Main House" : "Mortgage"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              type="text"
              placeholder="A short note about it"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Value history</Label>
              {isEdit && (
                <Button type="button" variant="outline" size="sm" onClick={addRow}>
                  <Plus />
                  Add row
                </Button>
              )}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Date</TableHead>
                  <TableHead>Value</TableHead>
                  {isEdit && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={row.id ?? `new-${index}`}>
                    <TableCell>
                      <Input
                        type="date"
                        value={row.as_of}
                        onChange={(e) =>
                          updateRow(index, { as_of: e.target.value })
                        }
                        aria-label={`Value ${index + 1} date`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={row.value}
                        onChange={(e) =>
                          updateRow(index, { value: e.target.value })
                        }
                        aria-label={`Value ${index + 1}`}
                      />
                    </TableCell>
                    {isEdit && (
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeRow(index)}
                          aria-label={`Remove value ${index + 1}`}
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {errors.rows && (
              <p className="text-xs text-destructive">{errors.rows}</p>
            )}
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
              {isEdit ? "Save Changes" : `Add ${label}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Update `AGENTS.md` (durable information only)**

In section 5 (Supabase and environment), after the `008_net_worth.sql` entry, add:

```text
- `009_net_worth_value_history.sql`: replaces 008's snapshot model — wipes existing 008 test data (TRUNCATE), drops the `net_worth_snapshots` table + `record_net_worth_snapshot()` trigger, drops `net_worth_entries.value`, and adds `net_worth_entry_values` (one dated value per entry/date) with RLS via the parent entry. Not yet run remotely; apply via Supabase dashboard SQL editor.
```

In section 2 (architecture map), update the `lib/` and `hooks/` lines to reflect the new responsibilities:

```text
  use-net-worth.ts          # Net worth entries + value-row CRUD
```

```text
  net-worth/                # Pure net worth value-history helpers + tests
```

In section 6 (current feature state), replace the Net Worth bullet:

```text
- Net Worth (`/dashboard/net-worth`) is fully independent of accounts, transactions, and portfolio data. Each entry (asset/liability) has a timeline of dated value rows (`net_worth_entry_values`); current value = the latest row, and the evolution chart is reconstructed from all value rows (no snapshots). Entries are restricted to the profile display currency (no FX conversion).
```

In section 7 (known follow-ups), replace the Net Worth bullet:

```text
- Net worth: if the user changes their display currency, existing entry values are re-labeled (not converted), matching the app-wide no-FX behavior. Value rows are stored per-entry, so the chart reflects values as of each recorded date.
```

- [ ] **Step 4: Commit**

```bash
git add components/net-worth/entry-form.tsx AGENTS.md
git commit -m "feat: net worth value history editor and docs"
```

---

### Task 5: Final verification

**Files:**
- None (verification only).

**Interfaces:**
- Consumes: everything from Tasks 1–4.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (the rewritten net-worth math suite plus the existing portfolio/ledger/month suites). Known non-failing Vite config warning may appear; ignore it.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds, type-checks, and prerenders `/dashboard/net-worth`.

- [ ] **Step 3: Manual smoke checks (user action)**

- Visit `/dashboard/net-worth`: empty state shows for a fresh user.
- Create an asset with an initial date + value: the list shows it, the summary updates, the chart gains a point.
- Add, edit, and delete value rows on an existing entry: current value = latest row; the chart reflects each dated value; the delete confirm dialog works.
- Edit only the name/description: no new value point is added.
- Backfill a past date (e.g. an entry whose only value is dated 3 months ago): the chart starts at that past date.
- Narrow the viewport: tables/headers remain usable; the summary stacks to one column on mobile.
- Apply migration 009 to the remote DB via the Supabase dashboard SQL editor (wipes 008 test data), then exercise the flows above against real data.

- [ ] **Step 4: Commit any fixes introduced during verification**

```bash
git add -A
git commit -m "fix: net worth value history verification fixes"
```

(Only if Task 5 steps surfaced changes; otherwise skip.)
