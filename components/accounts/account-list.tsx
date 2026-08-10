"use client";

import { useMemo, useState } from "react";
import { Landmark, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import { useAccounts } from "@/hooks/use-accounts";
import { useTransactions } from "@/hooks/use-transactions";
import { usePrimaryCurrency } from "@/hooks/use-primary-currency";
import { formatCurrency } from "@/lib/format";
import { AccountForm } from "./account-form";
import { ACCOUNT_TYPE_LABELS } from "./account-types";
import type { Tables } from "@/types/database";

type Account = Tables<"accounts">;

interface AccountWithBalance extends Account {
  balance: number;
  transactionCount: number;
}

export function AccountList() {
  const { data: accounts, isLoading, deleteAccount } = useAccounts();
  const { data: transactions } = useTransactions();
  const { currency } = usePrimaryCurrency();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState<AccountWithBalance | null>(null);

  const rows = useMemo<AccountWithBalance[]>(() => {
    const totals = new Map<string, number>();
    const counts = new Map<string, number>();
    for (const transaction of transactions ?? []) {
      totals.set(
        transaction.account_id,
        (totals.get(transaction.account_id) ?? 0) + transaction.amount
      );
      counts.set(
        transaction.account_id,
        (counts.get(transaction.account_id) ?? 0) + 1
      );
    }
    return (accounts ?? []).map((account) => ({
      ...account,
      balance: account.initial_balance + (totals.get(account.id) ?? 0),
      transactionCount: counts.get(account.id) ?? 0,
    }));
  }, [accounts, transactions]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (account: Account) => {
    setEditing(account);
    setFormOpen(true);
  };

  const confirmDelete = () => {
    if (deleting) {
      deleteAccount.mutate(deleting.id);
    }
    setDeleting(null);
  };

  const totalBalance = rows.reduce((sum, row) => sum + row.balance, 0);

  return (
    <Card className="border-border/50 bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="font-display text-xl font-medium text-foreground">
            Accounts
          </CardTitle>
          <p className="mt-0.5 text-xs text-fog">
            {isLoading
              ? "Loading…"
              : `${rows.length} account${rows.length === 1 ? "" : "s"} · ${formatCurrency(totalBalance, currency)} total`}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus />
          Add Account
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : !accounts || accounts.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#18848c]/10">
              <Landmark className="h-6 w-6 text-[#18848c]" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">No accounts yet</p>
              <p className="mt-1 text-sm text-fog">
                Create your first account to start tracking transactions.
              </p>
            </div>
            <Button onClick={openCreate}>
              <Plus />
              Add Account
            </Button>
          </div>
        ) : (
          <>
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="hidden md:table-cell">Currency</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((account) => (
                <TableRow
                  key={account.id}
                  className="transition-colors hover:bg-muted/40"
                >
                  <TableCell className="font-medium text-foreground">
                    {account.name}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge
                      variant="outline"
                      className="bg-secondary text-secondary-foreground"
                    >
                      {ACCOUNT_TYPE_LABELS[account.account_type] ??
                        account.account_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden font-mono text-fog md:table-cell">
                    {account.currency}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono tabular-nums ${
                      account.balance >= 0 ? "text-foreground" : "text-ember"
                    }`}
                  >
                    {formatCurrency(account.balance, account.currency)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" />}
                        aria-label="Account actions"
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => openEdit(account)}>
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleting(account)}
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
            {rows.map((account) => (
              <li
                key={account.id}
                className="rounded-xl border border-border/60 bg-card p-3 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {account.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-fog">
                      {ACCOUNT_TYPE_LABELS[account.account_type] ??
                        account.account_type}
                      {account.currency ? ` · ${account.currency}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <span
                      className={`font-mono text-sm font-semibold tabular-nums ${
                        account.balance >= 0 ? "text-foreground" : "text-ember"
                      }`}
                    >
                      {formatCurrency(account.balance, account.currency)}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" />}
                        aria-label="Account actions"
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(account)}>
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleting(account)}
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

      <AccountForm
        open={formOpen}
        onOpenChange={setFormOpen}
        account={editing}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleting && deleting.transactionCount > 0
                ? `Delete ${deleting.name} and its transactions?`
                : `Delete ${deleting?.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && deleting.transactionCount > 0 ? (
                <>
                  This account has {deleting.transactionCount} linked
                  transaction{deleting.transactionCount === 1 ? "" : "s"} that
                  will also be permanently deleted. This action cannot be
                  undone.
                </>
              ) : (
                <>
                  This will permanently remove the account from your records.
                  This action cannot be undone.
                </>
              )}
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
