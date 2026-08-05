"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { AccountForm } from "@/components/accounts/account-form";
import { UserMenu } from "@/components/auth/user-menu";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/accounts", label: "Accounts" },
];

export function DashboardHeader() {
  const pathname = usePathname();
  const [formOpen, setFormOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2.5 text-primary">
              <Logo className="h-7 w-7" />
              <span className="text-lg font-semibold tracking-tight text-foreground">
                MyFin
              </span>
            </Link>
            <nav className="hidden items-center gap-1 sm:flex">
              {navItems.map((item) => {
                const active =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                      active && "bg-muted text-foreground"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setFormOpen(true)}>
              <Plus />
              Add Account
            </Button>
            <UserMenu />
          </div>
        </div>
      </header>

      <AccountForm open={formOpen} onOpenChange={setFormOpen} />
    </>
  );
}
