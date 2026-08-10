"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { HoldingForm } from "./holding-form";
import { HoldingsTable } from "./holdings-table";
import { PortfolioChart } from "./portfolio-chart";
import { PortfolioStats } from "./portfolio-stats";

export function PortfolioOverview() {
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium text-foreground">
            Portfolio
          </h1>
          <p className="mt-0.5 text-sm text-fog">
            Track your investments.
          </p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setFormOpen(true)}>
          <Plus />
          Add Holding
        </Button>
      </div>

      <PortfolioStats />
      <PortfolioChart />
      <HoldingsTable onAddHolding={() => setFormOpen(true)} />
      <HoldingForm open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}