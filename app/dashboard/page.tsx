import { Logo } from "@/components/brand/logo";
import { BalanceOverview } from "@/components/dashboard/balance-overview";
import { InsightBanner } from "@/components/dashboard/insight-banner";
import { SpendingChart } from "@/components/dashboard/spending-chart";
import { TransactionList } from "@/components/transactions/transaction-list";

export default function Dashboard() {
  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5 text-primary">
            <Logo className="h-7 w-7" />
            <span className="text-lg font-semibold tracking-tight text-foreground">
              MyFin
            </span>
          </div>
          <span className="text-sm text-muted-foreground">Dashboard</span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
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
    </main>
  );
}