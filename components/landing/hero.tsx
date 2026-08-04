import { HeroVisual } from "./hero-visual";
import { WaitlistForm } from "./waitlist-form";

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
          An account-based expense tracker with powerful visual insights.
          Launching soon.
        </p>
        <WaitlistForm />
      </div>

      <HeroVisual />
    </section>
  );
}