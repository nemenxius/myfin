import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      {/* Subtle geometric mesh background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(24, 24, 27, 0.045) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(24, 24, 27, 0.045) 1px, transparent 1px),
            radial-gradient(circle at 75% 20%, rgba(37, 99, 235, 0.06), transparent 40%),
            radial-gradient(circle at 15% 80%, rgba(20, 184, 166, 0.05), transparent 40%)
          `,
          backgroundSize: "44px 44px, 44px 44px, 100% 100%, 100% 100%",
        }}
      />
      <Header />
      <Hero />
    </div>
  );
}