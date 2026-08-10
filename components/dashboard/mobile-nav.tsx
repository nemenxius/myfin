"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  LayoutDashboard,
  Scale,
  Settings,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/dashboard/portfolio", label: "Portfolio", icon: TrendingUp },
  { href: "/dashboard/net-worth", label: "Net Worth", icon: Scale },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/80 pb-safe backdrop-blur-md md:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2">
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-fog hover:text-foreground"
              )}
            >
              <Icon
                className={cn("size-5", active && "stroke-2")}
                aria-hidden
              />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
