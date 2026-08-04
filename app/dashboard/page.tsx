import { BalanceOverview } from "@/components/dashboard/balance-overview";
import { SpendingChart } from "@/components/dashboard/spending-chart";
import { TransactionList } from "@/components/transactions/transaction-list";

export default function Dashboard() {
  return (
    <main className="space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <BalanceOverview />
      <SpendingChart />
      <TransactionList />
    </main>
  );
}