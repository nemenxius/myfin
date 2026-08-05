import { MonthSelector } from "@/components/dashboard/month-selector";
import { SidePanel } from "@/components/dashboard/side-panel";
import { SpendingChart } from "@/components/dashboard/spending-chart";
import { StatCards } from "@/components/dashboard/stat-cards";
import { TransactionList } from "@/components/transactions/transaction-list";
import { parseMonthParam } from "@/lib/month";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const month = parseMonthParam(monthParam);

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up">
        <MonthSelector month={month} />
        <div className="mt-4">
          <StatCards month={month} />
        </div>
      </div>
      <div
        className="grid animate-fade-in-up grid-cols-1 gap-4 lg:grid-cols-3"
        style={{ animationDelay: "60ms" }}
      >
        <div className="lg:col-span-2">
          <SpendingChart />
        </div>
        <SidePanel />
      </div>
      <div
        className="animate-fade-in-up"
        style={{ animationDelay: "120ms" }}
      >
        <TransactionList month={month} />
      </div>
    </div>
  );
}
