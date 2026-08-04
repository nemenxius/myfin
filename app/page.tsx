import { Wallet } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Wallet className="h-12 w-12 text-zinc-500" />
      <h1 className="text-2xl font-semibold text-zinc-900">MyFin</h1>
      <p className="text-sm text-zinc-500">
        Personal finance tracker — coming soon.
      </p>
    </main>
  );
}
