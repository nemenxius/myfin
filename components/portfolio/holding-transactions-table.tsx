"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import { formatCurrency } from "@/lib/format";
import { HoldingForm } from "./holding-form";
import { HOLDING_TRANSACTION_TYPE_LABELS } from "./portfolio-types";
import type { Tables } from "@/types/database";

type HoldingTransaction = Tables<"holding_transactions">;

const TYPE_BADGE_STYLES: Record<string, string> = {
  buy: "bg-secondary text-secondary-foreground",
  sell: "bg-ember/10 text-ember",
  dividend: "bg-leaf/10 text-leaf",
  transfer: "bg-muted/50 text-muted-foreground",
};

export function HoldingTransactionsTable({
  holding,
}: {
  holding: HoldingWithCalculations;
}) {
  const { deleteHoldingTransaction } = useHoldings();

  const [formOpen, setFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<HoldingTransaction | null>(null);
  const [deleting, setDeleting] = useState<HoldingTransaction | null>(null);

  const openAdd = () => {
    setEditingTransaction(null);
    setFormOpen(true);
  };

  const openEdit = (transaction: HoldingTransaction) => {
    setEditingTransaction(transaction);
    setFormOpen(true);
  };

  const confirmDelete = () => {
    if (deleting) deleteHoldingTransaction.mutate(deleting.id);
    setDeleting(null);
  };

  return (
    <Card className="border-border/50 bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-display text-xl font-medium text-foreground">
          Transactions
        </CardTitle>
        <Button onClick={openAdd}>
          <Plus />
          Add Transaction
        </Button>
      </CardHeader>
      <CardContent>
        {holding.transactions.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
            <div>
              <p className="text-sm font-medium text-foreground">
                No transactions yet
              </p>
              <p className="mt-1 text-sm text-fog">
                Log your first buy to start tracking this holding.
              </p>
            </div>
            <Button onClick={openAdd}>
              <Plus />
              Add Transaction
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Price / share
                </TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  Commission
                </TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {holding.transactions.map((transaction) => {
                const total =
                  transaction.shares * transaction.price_per_share;
                const isSell = transaction.type === "sell";
                return (
                  <TableRow
                    key={transaction.id}
                    className="transition-colors hover:bg-muted/40"
                  >
                    <TableCell className="text-muted-foreground">
                      {new Date(
                        transaction.transacted_at
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge
                        variant="outline"
                        className={
                          TYPE_BADGE_STYLES[transaction.type] ??
                          "bg-muted/50 text-muted-foreground"
                        }
                      >
                        {HOLDING_TRANSACTION_TYPE_LABELS[transaction.type] ??
                          transaction.type}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono tabular-nums ${isSell ? "text-ember" : "text-foreground"}`}
                    >
                      {isSell ? "-" : "+"}
                      {transaction.shares.toFixed(
                        transaction.shares % 1 === 0 ? 0 : 4
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums text-fog sm:table-cell">
                      {formatCurrency(
                        transaction.price_per_share,
                        holding.currency
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-foreground">
                      {formatCurrency(total, holding.currency)}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums text-fog md:table-cell">
                      {formatCurrency(transaction.commission, holding.currency)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon-sm" />}
                          aria-label="Transaction actions"
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            onClick={() => openEdit(transaction)}
                          >
                            <Pencil />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleting(transaction)}
                          >
                            <Trash2 />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <HoldingForm
        open={formOpen}
        onOpenChange={setFormOpen}
        holding={holding}
        editingTransaction={editingTransaction}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this transaction from the holding.
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
