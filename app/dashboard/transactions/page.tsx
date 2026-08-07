import { MonthSelector } from "@/components/dashboard/month-selector";
import { StatCards } from "@/components/dashboard/stat-cards";
import { TransactionList } from "@/components/transactions/transaction-list";
import { parseMonthParam } from "@/lib/month";

export default async function TransactionsPage({
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
        className="animate-fade-in-up"
        style={{ animationDelay: "60ms" }}
      >
        <TransactionList month={month} />
      </div>
    </div>
  );
}
