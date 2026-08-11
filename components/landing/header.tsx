import Link from "next/link";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TryDemoButton } from "@/components/demo/try-demo-button";

export function Header() {
  return (
    <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
      <Link href="/" className="flex items-center gap-2.5">
        <Wallet className="h-6 w-6 text-foreground sm:h-7 sm:w-7" strokeWidth={1.5} />
        <span className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          MyFin
        </span>
      </Link>

      <div className="flex items-center gap-2 sm:gap-3">
        <Button
          render={<Link href="/auth?mode=signup" />}
          nativeButton={false}
          variant="outline"
          className="rounded-full border-border bg-background px-4 text-foreground hover:bg-muted sm:px-5"
        >
          Create Account
        </Button>
        <div className="hidden sm:block">
          <TryDemoButton
            className="rounded-full border-border bg-background px-4 text-foreground hover:bg-muted sm:px-5"
          />
        </div>
        <Button
          render={<Link href="/auth?mode=signin" />}
          nativeButton={false}
          className="rounded-full bg-primary px-4 text-primary-foreground hover:bg-primary/90 sm:px-5"
        >
          Sign In
        </Button>
      </div>
    </header>
  );
}
