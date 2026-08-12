"use client";

import { useState } from "react";
import { Plus, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNetWorth, type EntryType, type EntryWithValues } from "@/hooks/use-net-worth";
import { NetWorthSummary } from "./net-worth-summary";
import { NetWorthCategoryBreakdown } from "./net-worth-category-breakdown";
import { NetWorthChart } from "./net-worth-chart";
import { EntryList } from "./entry-list";
import { EntryForm } from "./entry-form";

export function NetWorthOverview() {
  const { assets, liabilities, isLoading } = useNetWorth();
  const [formOpen, setFormOpen] = useState(false);
  const [formType, setFormType] = useState<EntryType>("asset");
  const [editing, setEditing] = useState<EntryWithValues | null>(null);

  const isEmpty = !isLoading && assets.length === 0 && liabilities.length === 0;

  const openAdd = (type: EntryType) => {
    setFormType(type);
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (type: EntryType) => (entry: EntryWithValues) => {
    setFormType(type);
    setEditing(entry);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium text-foreground">
            Net Worth
          </h1>
          <p className="mt-0.5 text-sm text-fog">
            Track your assets and liabilities.
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={() => openAdd("asset")}
          >
            <Plus />
            Add Asset
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            onClick={() => openAdd("liability")}
          >
            <Plus />
            Add Liability
          </Button>
        </div>
      </div>

      {isEmpty ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-border/60 bg-card px-6 text-center shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#18848c]/10">
            <Scale className="h-6 w-6 text-[#18848c]" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">
              Build your net worth
            </p>
            <p className="mt-1 text-sm text-fog">
              Add your assets and liabilities to get a complete picture of your
              financial position.
            </p>
          </div>
          <Button onClick={() => openAdd("asset")}>
            <Plus />
            Add your first asset
          </Button>
        </div>
      ) : (
        <>
          <NetWorthSummary>
            <NetWorthCategoryBreakdown />
          </NetWorthSummary>
          <NetWorthChart />
          <EntryList
            entryType="asset"
            onAdd={() => openAdd("asset")}
            onEdit={openEdit("asset")}
          />
          <EntryList
            entryType="liability"
            onAdd={() => openAdd("liability")}
            onEdit={openEdit("liability")}
          />
        </>
      )}

      <EntryForm
        open={formOpen}
        onOpenChange={setFormOpen}
        entryType={formType}
        entry={editing}
      />
    </div>
  );
}
