import Link from "next/link";
import { HeroVisual } from "./hero-visual";
import { Button } from "@/components/ui/button";
import { TryDemoButton } from "@/components/demo/try-demo-button";
import { LandingAction } from "./landing-action";

export function Hero() {
  return (
    <section
      id="about"
      className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-4 pb-20 pt-8 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:pb-28 lg:pt-16"
    >
      <div className="max-w-md">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          Your Finances,{" "}
          <span className="text-primary">Simplified.</span>
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          Track income and spending across accounts, investments, and net worth
          — with clear charts and a running-balance ledger, all in one place.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <LandingAction
            hideForAnonymous
            className="h-12 w-44 rounded-xl"
          >
            <Button
              render={<Link href="/auth?mode=signup" />}
              nativeButton={false}
              className="h-12 rounded-xl bg-primary px-6 text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Create free account
            </Button>
          </LandingAction>
          <LandingAction
            hideForAnonymous
            className="h-12 w-24 rounded-xl"
          >
            <Button
              render={<Link href="/auth?mode=signin" />}
              nativeButton={false}
              variant="outline"
              className="h-12 rounded-xl border-border bg-background px-6 shadow-sm hover:bg-muted"
            >
              Sign in
            </Button>
          </LandingAction>
          <LandingAction className="h-12 w-24 rounded-xl">
            <TryDemoButton
              className="h-12 rounded-xl border-border bg-background px-6 shadow-sm hover:bg-muted"
            />
          </LandingAction>
        </div>
      </div>

      <HeroVisual />
    </section>
  );
}
