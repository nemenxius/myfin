import { BalanceOverview } from "@/components/dashboard/balance-overview";
import { InsightBanner } from "@/components/dashboard/insight-banner";
import { SpendingChart } from "@/components/dashboard/spending-chart";
import { TransactionList } from "@/components/transactions/transaction-list";

export default function Dashboard() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in-up">
        <BalanceOverview />
      </div>
      <div className="animate-fade-in-up" style={{ animationDelay: "60ms" }}>
        <InsightBanner />
      </div>
      <div
        className="animate-fade-in-up"
        style={{ animationDelay: "120ms" }}
      >
        <SpendingChart />
      </div>
      <div
        className="animate-fade-in-up"
        style={{ animationDelay: "180ms" }}
      >
        <TransactionList />
      </div>
    </div>
  );
}
