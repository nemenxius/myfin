"use client";

import { useRouter } from "next/navigation";
import { addMonths, format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monthLabel } from "@/lib/month";

export function MonthSelector({
  month,
  maxMonth,
  basePath = "/dashboard/transactions",
}: {
  month: string;
  maxMonth?: string;
  basePath?: string;
}) {
  const router = useRouter();

  const currentMonth = format(new Date(), "yyyy-MM");
  const effectiveMax = maxMonth ?? currentMonth;
  const [year, monthIndex] = month.split("-").map(Number);
  const base = new Date(year, monthIndex - 1, 1);
  const prev = format(addMonths(base, -1), "yyyy-MM");
  const next = format(addMonths(base, 1), "yyyy-MM");

  const canGoNext = next <= effectiveMax;

  const navigate = (target: string) => {
    router.replace(`${basePath}?month=${target}`, { scroll: false });
  };

  const goToday = () => {
    router.replace(basePath, { scroll: false });
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Previous month"
        onClick={() => navigate(prev)}
      >
        <ChevronLeft />
      </Button>
      <span className="w-32 text-center text-sm font-medium text-foreground">
        {monthLabel(month)}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Next month"
        onClick={() => navigate(next)}
        disabled={!canGoNext}
      >
        <ChevronRight />
      </Button>
      {month !== currentMonth ? (
        <Button variant="outline" size="xs" onClick={goToday}>
          Today
        </Button>
      ) : null}
    </div>
  );
}
