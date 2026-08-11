"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function DemoBanner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, signOut } = useAuth();

  // Safety net: after a hard reload the anonymous session may exist without
  // seeded data. seed_demo_data is idempotent, so re-calling it is harmless.
  useEffect(() => {
    if (!user?.is_anonymous) return;
    let active = true;

    void supabaseClient
      .rpc("seed_demo_data")
      .then(
        () => {
          if (active) void queryClient.invalidateQueries();
        },
        () => undefined
      );

    return () => {
      active = false;
    };
  }, [user?.is_anonymous, queryClient]);

  if (!user?.is_anonymous) return null;

  const handleExit = async () => {
    await signOut(); // anonymous: purges the sandbox permanently
    router.push("/");
    router.refresh();
  };

  return (
    <div className="border-b border-border bg-secondary/60 px-4 py-2">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
        <p className="text-xs text-muted-foreground">
          You&apos;re exploring a temporary MyFin demo. Changes you make here
          won&apos;t be saved permanently.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExit}
          className="shrink-0"
        >
          Exit demo
        </Button>
      </div>
    </div>
  );
}
