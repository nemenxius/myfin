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
  Landmark,
  Wallet,
} from "lucide-react";

const cashFlow = [
  { month: "Jan", value: 3200 },
  { month: "Feb", value: 4100 },
  { month: "Mar", value: 3800 },
  { month: "Apr", value: 5200 },
  { month: "May", value: 4700 },
  { month: "Jun", value: 6100 },
];

const transactions = [
  { name: "Salary", amount: "+$3,200", type: "income" },
  { name: "Groceries", amount: "-$84.20", type: "expense" },
  { name: "Utilities", amount: "-$120.00", type: "expense" },
];

const balances = [
  { name: "Checking", value: "$12,480", color: "bg-blue-600" },
  { name: "Savings", value: "$28,900", color: "bg-teal-500" },
  { name: "Brokerage", value: "$54,120", color: "bg-amber-500" },
];

export function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-lg [perspective:1400px]">
      {/* Floating accent elements */}
      <div className="absolute -left-4 top-10 z-30 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200 bg-white/80 shadow-lg backdrop-blur">
        <Coins className="h-5 w-5 text-amber-500" />
      </div>
      <div className="absolute -right-3 top-24 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-blue-200 bg-white/80 shadow-lg backdrop-blur">
        <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
      </div>
      <div className="absolute -bottom-4 left-10 z-30 flex h-11 w-11 items-center justify-center rounded-2xl border border-teal-200 bg-white/80 shadow-lg backdrop-blur">
        <Landmark className="h-5 w-5 text-teal-600" />
      </div>

      {/* Isometric app panel */}
      <div className="relative [transform:rotateX(10deg)_rotateY(-12deg)] [transform-style:preserve-3d]">
        <div className="rounded-3xl border border-zinc-100 bg-white/70 p-6 shadow-2xl shadow-zinc-300/40 backdrop-blur-xl">
          {/* App bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900">
                <Wallet className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-semibold text-zinc-900">MyFin</span>
            </div>
            <div className="flex gap-1.5">
              <span className="h-2 w-2 rounded-full bg-zinc-200" />
              <span className="h-2 w-2 rounded-full bg-zinc-200" />
              <span className="h-2 w-2 rounded-full bg-zinc-200" />
            </div>
          </div>

          {/* Account Balances */}
          <div className="mt-5 rounded-2xl border border-zinc-100 bg-white/80 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Account Balances
            </p>
            <div className="mt-3 space-y-2.5">
              {balances.map((account) => (
                <div
                  key={account.name}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${account.color}`}
                    />
                    <span className="text-sm text-zinc-600">{account.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-zinc-900">
                    {account.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly Cash Flow */}
          <div className="mt-4 rounded-2xl border border-zinc-100 bg-white/80 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Monthly Cash Flow
              </p>
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <ArrowUpRight className="h-3.5 w-3.5" /> +18%
              </span>
            </div>
            <div className="mt-2 h-28">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={cashFlow}
                  margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="flowFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: "#a1a1aa" }}
                    dy={4}
                  />
                  <YAxis hide domain={[0, 7000]} />
                  <Tooltip
                    cursor={{ stroke: "#e4e4e7" }}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e4e4e7",
                      fontSize: 12,
                    }}
                    formatter={(value) => [`$${value}`, "Cash flow"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#2563eb"
                    strokeWidth={2}
                    fill="url(#flowFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="mt-4 rounded-2xl border border-zinc-100 bg-white/80 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Recent Transactions
            </p>
            <div className="mt-3 space-y-2.5">
              {transactions.map((transaction) => (
                <div
                  key={transaction.name}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm text-zinc-600">
                    {transaction.name}
                  </span>
                  <span
                    className={`flex items-center gap-1 text-sm font-semibold ${
                      transaction.type === "income"
                        ? "text-emerald-600"
                        : "text-red-500"
                    }`}
                  >
                    {transaction.type === "income" ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    )}
                    {transaction.amount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}