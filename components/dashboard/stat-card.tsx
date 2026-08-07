import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  delta?: string;
  deltaTone?: "positive" | "negative" | "neutral";
  children?: React.ReactNode;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  deltaTone = "neutral",
  children,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-shadow hover:shadow-md",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
          {label}
        </span>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#18848c]/10">
          <Icon className="h-3.5 w-3.5 text-[#18848c]" />
        </span>
      </div>
      <p className="font-mono text-2xl font-medium tracking-tight text-foreground tabular-nums">
        {value}
      </p>
      {delta ? (
        <p
          className={cn(
            "text-xs",
            deltaTone === "positive" && "text-leaf",
            deltaTone === "negative" && "text-ember",
            deltaTone === "neutral" && "text-fog"
          )}
        >
          {delta}
        </p>
      ) : null}
      {children}
    </div>
  );
}
