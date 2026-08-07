import Link from "next/link";
import { HeroVisual } from "./hero-visual";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section
      id="about"
      className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 px-6 pb-24 pt-10 lg:grid-cols-2 lg:pt-16"
    >
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          MyFin: Your Finances,{" "}
          <span className="text-primary">Simplified.</span>
        </h1>
        <p className="mt-5 max-w-md text-lg leading-relaxed text-muted-foreground">
          An account-based expense tracker with powerful visual insights. Track
          income and spending across accounts, all in one place.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button
            render={<Link href="/auth?mode=signup" />}
            nativeButton={false}
            className="h-12 rounded-xl bg-primary px-6 text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            Create free account
          </Button>
          <Button
            render={<Link href="/auth?mode=signin" />}
            nativeButton={false}
            variant="outline"
            className="h-12 rounded-xl border-border bg-background px-6 shadow-sm hover:bg-muted"
          >
            Sign in
          </Button>
        </div>
      </div>

      <HeroVisual />
    </section>
  );
}
