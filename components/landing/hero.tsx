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
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl">
          MyFin: Your Finances,{" "}
          <span className="text-blue-700">Simplified.</span>
        </h1>
        <p className="mt-5 max-w-md text-lg leading-relaxed text-zinc-600">
          An account-based expense tracker with powerful visual insights. Track
          income and spending across accounts, all in one place.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button
            render={<Link href="/auth?mode=signup" />}
            nativeButton={false}
            className="h-12 rounded-xl bg-blue-700 px-6 text-white shadow-sm hover:bg-blue-800"
          >
            Create free account
          </Button>
          <Button
            render={<Link href="/auth?mode=signin" />}
            nativeButton={false}
            variant="outline"
            className="h-12 rounded-xl border-zinc-200 bg-white px-6 shadow-sm hover:bg-zinc-50"
          >
            Sign in
          </Button>
        </div>
      </div>

      <HeroVisual />
    </section>
  );
}
