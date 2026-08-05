import { monthWindow } from "./month";
import type { Tables } from "@/types/database";

type Transaction = Tables<"transactions">;
export type LedgerRow = Transaction & { balance: number };

export function buildLedger(
  transactions: Transaction[],
  month: string
): LedgerRow[] {
  const { start, end } = monthWindow(month);
  const startTs = start.getTime();
  const endTs = end.getTime();

  let seed = 0;
  const inMonth: Transaction[] = [];
  for (const t of transactions) {
    const ts = new Date(t.date).getTime();
    if (ts < startTs) {
      if (t.transaction_type === "Transfer") continue;
      seed += t.amount;
    } else if (ts < endTs) {
      inMonth.push(t);
    }
  }

  const chronological = [...inMonth].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  let running = seed;
  const withBalance = chronological.map((t) => {
    if (t.transaction_type !== "Transfer") {
      running += t.amount;
    }
    return { ...t, balance: running };
  });
  return withBalance.reverse();
}
