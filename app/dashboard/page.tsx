import { SpendingChart } from "@/components/dashboard/spending-chart";
import { PortfolioChart } from "@/components/portfolio/portfolio-chart";
import { NetWorthChart } from "@/components/net-worth/net-worth-chart";
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
      <div className="animate-fade-in-up space-y-6" style={{ animationDelay: "60ms" }}>
        <SpendingChart month={month} />
        <PortfolioChart />
        <NetWorthChart />
      </div>
    </div>
  );
}
