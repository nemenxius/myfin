"use client";

import { useMemo, useState } from "react";
import {
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
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
import { useNetWorth, type EntryType, type EntryWithValues } from "@/hooks/use-net-worth";
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
import { useNetWorthCategories } from "@/hooks/use-net-worth-categories";
import { CategoryIcon } from "@/components/categories/category-icons";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { entryCurrentValue } from "@/lib/net-worth/math";

interface EntryListProps {
  entryType: EntryType;
  onAdd: () => void;
  onEdit: (entry: EntryWithValues) => void;
}

export function EntryList({ entryType, onAdd, onEdit }: EntryListProps) {
  const { assets, liabilities, deleteEntry, isLoading } = useNetWorth();
  const { currency } = usePrimaryCurrency();
  const { data: categories } = useNetWorthCategories();
  const [deleting, setDeleting] = useState<EntryWithValues | null>(null);

  const entries = entryType === "asset" ? assets : liabilities;
  const title = entryType === "asset" ? "Assets" : "Liabilities";
  const singular = entryType === "asset" ? "asset" : "liability";
  const plural = entryType === "asset" ? "assets" : "liabilities";
  const Icon = entryType === "asset" ? TrendingUp : TrendingDown;

  const total = useMemo(
    () =>
      entries.reduce(
        (sum, entry) => sum + (entryCurrentValue(entry) ?? 0),
        0
      ),
    [entries]
  );

  const categoryMap = useMemo(() => {
    const map = new Map<string, { name: string; icon: string }>();
    for (const c of categories ?? []) {
      map.set(c.id, { name: c.name, icon: c.icon });
    }
    return map;
  }, [categories]);

  const confirmDelete = () => {
    if (deleting) deleteEntry.mutate(deleting.id);
    setDeleting(null);
  };

  return (
    <Card className="border-border/50 bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="font-display text-xl font-medium text-foreground">
            {title}
          </CardTitle>
          <p className="mt-0.5 text-xs text-fog">
            {isLoading
              ? "Loading…"
              : `${entries.length} ${entries.length === 1 ? singular : plural} · ${formatCurrency(total, currency)} total`}
          </p>
        </div>
        <Button onClick={onAdd}>
          <Plus />
          Add {singular}
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
            <span
              className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                entryType === "asset"
                  ? "bg-[#18848c]/10"
                  : "bg-[#c0392b]/10"
              }`}
            >
              <Icon
                className={`h-6 w-6 ${
                  entryType === "asset" ? "text-[#18848c]" : "text-[#c0392b]"
                }`}
              />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">
                No {plural} yet
              </p>
              <p className="mt-1 text-sm text-fog">
                Add your first {singular} to start tracking.
              </p>
            </div>
            <Button onClick={onAdd}>
              <Plus />
              Add {singular}
            </Button>
          </div>
        ) : (
          <>
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                {entryType === "asset" && <TableHead>Category</TableHead>}
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow
                  key={entry.id}
                  className="transition-colors hover:bg-muted/40"
                >
                  <TableCell>
                    <div className="font-medium text-foreground">{entry.name}</div>
                    {entry.description && (
                      <div className="text-xs text-fog">
                        {entry.description}
                      </div>
                    )}
                  </TableCell>
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
                          />
                          {categoryMap.get(entry.category_id)?.name ??
                            "Uncategorized"}
                        </Badge>
                      ) : null}
                    </TableCell>
                  )}
                  <TableCell className="text-right font-mono tabular-nums text-foreground">
                    {formatCurrency(entryCurrentValue(entry) ?? 0, currency)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" />}
                        aria-label={`${title} actions`}
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => onEdit(entry)}>
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleting(entry)}
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>

          <ul className="space-y-2 md:hidden">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-xl border border-border/60 bg-card p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {entry.name}
                    </p>
                    {entry.description && (
                      <p className="truncate text-xs text-fog">
                        {entry.description}
                      </p>
                    )}
                    {entryType === "asset" && entry.category_id && (
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                        <CategoryIcon
                          slug={categoryMap.get(entry.category_id)?.icon ?? "Tag"}
                          className="h-3.5 w-3.5"
                        />
                        {categoryMap.get(entry.category_id)?.name ??
                          "Uncategorized"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                      {formatCurrency(entryCurrentValue(entry) ?? 0, currency)}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" />}
                        aria-label={`${title} actions`}
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(entry)}>
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleting(entry)}
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          </>
        )}
      </CardContent>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the {singular} from your records.
              This action cannot be undone.
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
