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

  const confirmDelete = () => {
    if (deleting) deleteEntry.mutate(deleting.id);
    setDeleting(null);
  };

  return (
    <Card className="border-border/50 bg-white shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="font-display text-xl font-medium text-ink">
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
              <p className="text-sm font-medium text-ink">
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
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
                    <div className="font-medium text-ink">{entry.name}</div>
                    {entry.description && (
                      <div className="text-xs text-fog">
                        {entry.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-ink">
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
