import { DashboardHeader } from "@/components/dashboard/header";
import { OnboardingGate } from "@/components/auth/onboarding-gate";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="min-h-screen bg-background">
      <OnboardingGate>
        <DashboardHeader />
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </OnboardingGate>
    </main>
  );
}
