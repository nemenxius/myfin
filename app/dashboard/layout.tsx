import { DashboardHeader } from "@/components/dashboard/header";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="min-h-screen bg-background">
      <DashboardHeader />
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </main>
  );
}
