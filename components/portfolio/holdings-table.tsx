"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus, Trash2, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  useHoldings,
  type HoldingWithCalculations,
} from "@/hooks/use-portfolio";
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HoldingForm } from "./holding-form";
import { ASSET_TYPE_LABELS } from "./portfolio-types";

function signedPercent(value: number | null): string {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function changeClass(value: number): string {
  if (value > 0) return "text-leaf";
  if (value < 0) return "text-ember";
  return "text-fog";
}

export function HoldingsTable({ onAddHolding }: { onAddHolding: () => void }) {
  const router = useRouter();
  const { holdings, isLoading, deleteHolding } = useHoldings();
  const { currency } = usePrimaryCurrency();

  const [formOpen, setFormOpen] = useState(false);
  const [quickHolding, setQuickHolding] =
    useState<HoldingWithCalculations | null>(null);
  const [deleting, setDeleting] = useState<HoldingWithCalculations | null>(null);

  const totals = useMemo(
    () => holdings.reduce((sum, h) => sum + h.currentValue, 0),
    [holdings]
  );

  const openQuickAdd = (holding: HoldingWithCalculations) => {
    setQuickHolding(holding);
    setFormOpen(true);
  };

  const confirmDelete = () => {
    if (deleting) deleteHolding.mutate(deleting.id);
    setDeleting(null);
  };

  return (
    <Card className="border-border/50 bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="font-display text-xl font-medium text-foreground">
            Holdings
          </CardTitle>
          <p className="mt-0.5 text-xs text-fog">
            {isLoading
              ? "Loading…"
              : `${holdings.length} holding${holdings.length === 1 ? "" : "s"} · ${formatCurrency(totals, currency)} total`}
          </p>
        </div>
        <Button onClick={onAddHolding}>
          <Plus />
          Add Holding
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : holdings.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#18848c]/10">
              <TrendingUp className="h-6 w-6 text-[#18848c]" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">
                No holdings added yet. Track your first investment.
              </p>
              <p className="mt-1 text-sm text-fog">
                Add a stock, ETF, or crypto holding to get started.
              </p>
            </div>
            <Button onClick={onAddHolding}>
              <Plus />
              Add Holding
            </Button>
          </div>
        ) : (
          <>
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Holding</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Avg price
                </TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Current
                </TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Cost basis</TableHead>
                <TableHead className="text-right">Daily</TableHead>
                <TableHead className="text-right">Total return</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdings.map((holding) => {
                const hasQuote = holding.quote !== null;
                return (
                  <TableRow
                    key={holding.id}
                    className="cursor-pointer transition-colors hover:bg-muted/40"
                    onClick={() =>
                      router.push(`/dashboard/portfolio/${holding.id}`)
                    }
                  >
                    <TableCell>
                      <div className="font-medium text-foreground">
                        {holding.symbol}
                      </div>
                      {holding.name && (
                        <div className="text-xs text-fog">{holding.name}</div>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge
                        variant="outline"
                        className="bg-secondary text-secondary-foreground"
                      >
                        {ASSET_TYPE_LABELS[holding.asset_type] ??
                          holding.asset_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-foreground">
                      {holding.totalShares.toFixed(
                        holding.totalShares % 1 === 0 ? 0 : 4
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums text-fog sm:table-cell">
                      {formatCurrency(holding.avgPrice, holding.currency)}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">
                      {hasQuote
                        ? formatCurrency(
                            holding.quote!.currentPrice,
                            holding.quote!.currency
                          )
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-foreground">
                      {formatCurrency(holding.currentValue, holding.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-fog">
                      {formatCurrency(holding.costBasis, holding.currency)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono tabular-nums",
                        changeClass(holding.dailyChange)
                      )}
                    >
                      {hasQuote
                        ? `${holding.dailyChange >= 0 ? "+" : ""}${formatCurrency(holding.dailyChange, holding.currency)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "font-mono tabular-nums",
                          changeClass(holding.totalChange)
                        )}
                      >
                        {signedPercent(holding.totalChangePercent)}
                      </span>
                      <span
                        className={cn(
                          "ml-1.5 font-mono text-xs tabular-nums",
                          changeClass(holding.totalChange)
                        )}
                      >
                        {holding.totalChange >= 0 ? "+" : ""}
                        {formatCurrency(holding.totalChange, holding.currency)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div
                        className="flex items-center justify-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openQuickAdd(holding)}
                          aria-label={`Add transaction for ${holding.symbol}`}
                        >
                          <Plus />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={<Button variant="ghost" size="icon-sm" />}
                            aria-label="Holding actions"
                          >
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem
                              onClick={() => router.push(`/dashboard/portfolio/${holding.id}`)}
                            >
                              View details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeleting(holding)}
                            >
                              <Trash2 />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>

          <ul className="space-y-2 md:hidden">
            {holdings.map((holding) => {
              const hasQuote = holding.quote !== null;
              return (
                <li
                  key={holding.id}
                  className="cursor-pointer rounded-xl border border-border/60 bg-card p-3 shadow-sm transition-colors active:bg-muted/50"
                  onClick={() =>
                    router.push(`/dashboard/portfolio/${holding.id}`)
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {holding.symbol}
                      </p>
                      {holding.name && (
                        <p className="truncate text-xs text-fog">
                          {holding.name}
                        </p>
                      )}
                    </div>
                    <div
                      className="flex items-center gap-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                        {formatCurrency(holding.currentValue, holding.currency)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openQuickAdd(holding)}
                        aria-label={`Add transaction for ${holding.symbol}`}
                      >
                        <Plus />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon-sm" />}
                          aria-label="Holding actions"
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              router.push(`/dashboard/portfolio/${holding.id}`)
                            }
                          >
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleting(holding)}
                          >
                            <Trash2 />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/50 pt-2 text-xs text-fog">
                    <span className="truncate">
                      {holding.totalShares.toFixed(
                        holding.totalShares % 1 === 0 ? 0 : 4
                      )}{" "}
                      shares ·{" "}
                      {ASSET_TYPE_LABELS[holding.asset_type] ??
                        holding.asset_type}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          "font-mono tabular-nums",
                          changeClass(holding.totalChange)
                        )}
                      >
                        {signedPercent(holding.totalChangePercent)}
                      </span>
                      {hasQuote && (
                        <span
                          className={cn(
                            "font-mono tabular-nums",
                            changeClass(holding.dailyChange)
                          )}
                        >
                          {holding.dailyChange >= 0 ? "+" : ""}
                          {formatCurrency(holding.dailyChange, holding.currency)}
                        </span>
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          </>
        )}
      </CardContent>

      <HoldingForm
        open={formOpen}
        onOpenChange={setFormOpen}
        holding={quickHolding}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleting?.symbol}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the holding and all of its
              transactions. This action cannot be undone.
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
    </Card>
  );
}