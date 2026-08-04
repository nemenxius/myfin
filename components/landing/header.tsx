import Link from "next/link";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
      <Link href="/" className="flex items-center gap-2.5">
        <Wallet className="h-7 w-7 text-zinc-800" strokeWidth={1.5} />
        <span className="text-xl font-semibold tracking-tight text-zinc-900">
          MyFin
        </span>
      </Link>

      <nav className="hidden items-center gap-8 text-sm font-medium text-zinc-600 sm:flex">
        <a href="#about" className="transition-colors hover:text-zinc-900">
          About
        </a>
        <a href="#waitlist" className="transition-colors hover:text-zinc-900">
          Waitlist
        </a>
      </nav>

      <Button
        render={<Link href="/login" />}
        className="rounded-full bg-zinc-800 px-5 text-white hover:bg-zinc-700"
      >
        Sign In
      </Button>
    </header>
  );
}