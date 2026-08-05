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

      <div className="flex items-center gap-3">
        <Button
          render={<Link href="/auth?mode=signup" />}
          nativeButton={false}
          variant="outline"
          className="rounded-full border-zinc-200 bg-white px-5 text-zinc-800 hover:bg-zinc-50"
        >
          Create Account
        </Button>
        <Button
          render={<Link href="/auth?mode=signin" />}
          nativeButton={false}
          className="rounded-full bg-zinc-800 px-5 text-white hover:bg-zinc-700"
        >
          Sign In
        </Button>
      </div>
    </header>
  );
}
