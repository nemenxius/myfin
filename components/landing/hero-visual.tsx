"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Coins,
  PieChart,
  Wallet,
} from "lucide-react";

const cashFlow = [
  { day: "1", value: 120 },
  { day: "5", value: 240 },
  { day: "9", value: 180 },
  { day: "13", value: 360 },
  { day: "17", value: 290 },
  { day: "21", value: 420 },
  { day: "25", value: 310 },
  { day: "28", value: 260 },
];

const statCards = [
  { label: "Income", value: "$5,240" },
  { label: "Spending", value: "$1,920" },
  { label: "Net", value: "+$3,320" },
];

const ledger: Array<{
  name: string;
  meta: string;
  amount: string;
  balance: string;
  tone: "positive" | "negative";
}> = [
  {
    name: "Salary",
    meta: "Today",
    amount: "+$3,200",
    balance: "$12,480",
    tone: "positive",
  },
  {
    name: "Groceries",
    meta: "Yesterday",
    amount: "−$84.20",
    balance: "$9,280",
    tone: "negative",
  },
  {
    name: "Utilities",
    meta: "Sep 2",
    amount: "−$120.00",
    balance: "$9,364",
    tone: "negative",
  },
];

const toneClasses = {
  positive: "text-leaf",
  negative: "text-ember",
};

export function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-lg">
      {/* Soft brand glow behind the window */}
      <div
        aria-hidden
        className="absolute -inset-8 rounded-[2.5rem] opacity-50 blur-2xl"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, rgba(24,132,140,0.18), transparent 55%), radial-gradient(circle at 80% 85%, rgba(8,52,88,0.16), transparent 50%)",
        }}
      />

      {/* Floating accent chips */}
      <div className="absolute -left-5 top-1/2 z-30 hidden -translate-y-1/2 items-center gap-2 rounded-2xl border border-border/60 bg-card/85 px-3 py-2 shadow-lg backdrop-blur sm:flex">
        <span className="relative flex h-7 w-7 items-center justify-center">
          <svg viewBox="0 0 32 32" className="h-7 w-7 -rotate-90">
            <circle
              cx="16"
              cy="16"
              r="12"
              fill="none"
              stroke="var(--border)"
              strokeWidth="7"
            />
            <circle
              cx="16"
              cy="16"
              r="12"
              fill="none"
              stroke="var(--chart-2)"
              strokeWidth="7"
              strokeDasharray="45 30"
              strokeLinecap="round"
            />
            <circle
              cx="16"
              cy="16"
              r="12"
              fill="none"
              stroke="var(--leaf)"
              strokeWidth="7"
              strokeDasharray="30 100"
              strokeDashoffset="-45"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-fog">
            By category
          </p>
          <p className="text-xs font-semibold text-foreground">
            72% to savings
          </p>
        </div>
      </div>
      <div className="absolute -right-4 top-1/3 z-30 hidden h-11 w-11 items-center justify-center rounded-2xl border border-border/60 bg-card/85 shadow-lg backdrop-blur sm:flex">
        <Coins className="h-5 w-5 text-[var(--chart-2)]" />
      </div>

      {/* App window — a faithful preview of the dashboard */}
      <div className="relative rounded-2xl border border-border/60 bg-card/85 p-4 shadow-2xl shadow-black/15 backdrop-blur-xl sm:p-5">
        {/* App bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Wallet className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground">MyFin</span>
          </div>
          <div className="flex gap-1.5">
            <span className="h-2 w-2 rounded-full bg-muted" />
            <span className="h-2 w-2 rounded-full bg-muted" />
            <span className="h-2 w-2 rounded-full bg-muted" />
          </div>
        </div>

        {/* Stat cards */}
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-border/60 bg-card p-2.5"
            >
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-fog">
                {card.label}
              </p>
              <p
                className={`mt-0.5 truncate font-mono text-sm font-semibold tabular-nums sm:text-base ${
                  card.label === "Net" ? "text-leaf" : "text-foreground"
                }`}
              >
                {card.value}
              </p>
            </div>
          ))}
        </div>

        {/* Monthly spending chart */}
        <div className="mt-3 rounded-xl border border-border/60 bg-card/80 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-fog">
              Monthly Spending
            </p>
            <span className="flex items-center gap-0.5 text-[11px] font-semibold text-leaf">
              <ArrowUpRight className="h-3 w-3" />
              +12%
            </span>
          </div>
          <div className="mt-2 h-24">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={cashFlow}
                margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="heroSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  hide
                  tickLine={false}
                  axisLine={false}
                  interval={2}
                />
                <YAxis hide domain={[0, 500]} />
                <Tooltip
                  cursor={{ stroke: "var(--border)" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    fontSize: 12,
                    background: "var(--popover)",
                    color: "var(--foreground)",
                  }}
                  formatter={(value) => [`$${value}`, "Spent"]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#heroSpend)"
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent transactions ledger */}
        <div className="mt-3 rounded-xl border border-border/60 bg-card/80 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-fog">
              Recent Transactions
            </p>
            <PieChart className="h-3.5 w-3.5 text-fog" />
          </div>
          <div className="mt-1 divide-y divide-border/50">
            {ledger.map((row) => (
              <div
                key={row.name}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                    {row.tone === "positive" ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">
                      {row.name}
                    </p>
                    <p className="text-[11px] text-fog">{row.meta}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`font-mono text-xs font-semibold tabular-nums ${
                      toneClasses[row.tone]
                    }`}
                  >
                    {row.amount}
                  </p>
                  <p className="font-mono text-[11px] tabular-nums text-fog">
                    Bal {row.balance}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
