import { DashboardHeader } from "@/components/dashboard/header";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { OnboardingGate } from "@/components/auth/onboarding-gate";
import { DemoBanner } from "@/components/demo/demo-banner";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="min-h-screen bg-background">
      <OnboardingGate>
        <DemoBanner />
        <DashboardHeader />
        <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 md:pb-10 md:pt-8">
          {children}
        </div>
        <MobileNav />
      </OnboardingGate>
    </main>
  );
}
