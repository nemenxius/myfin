"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function TryDemoButton({
  variant = "outline",
  className,
}: {
  variant?: "outline" | "ghost" | "default";
  className?: string;
}) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (loading) return;
    setError(null);

    // Defensive guard: never start an anonymous session over a real one.
    if (user || isLoading) return;

    setLoading(true);

    const { error: signInError } = await supabaseClient.auth.signInAnonymously();
    if (signInError) {
      setLoading(false);
      setError(signInError.message);
      return;
    }

    let seedError: { message: string } | null = null;
    try {
      const { error } = await supabaseClient.rpc("seed_demo_data");
      seedError = error;
    } catch {
      seedError = {
        message: "Couldn't reach the server. Check your connection and try again.",
      };
    }
    if (seedError) {
      // Best-effort cleanup: don't strand an empty sandbox. Errors here are
      // swallowed; the visitor sees the ORIGINAL seed error.
      try {
        await supabaseClient.rpc("purge_demo_user");
      } catch {
        // ignore cleanup errors
      }
      await supabaseClient.auth.signOut().catch(() => undefined);
      setLoading(false);
      setError(seedError.message);
      return;
    }

    setLoading(false);
    router.push("/dashboard");
  };

  if (isLoading) return null;

  if (user?.is_anonymous) {
    return (
      <Button
        render={<Link href="/dashboard" />}
        nativeButton={false}
        variant={variant}
        className={className}
      >
        Continue demo
      </Button>
    );
  }

  if (user) return null;

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        onClick={handleClick}
        disabled={loading}
        className={className}
      >
        {loading ? "Setting up demo…" : "Try demo"}
      </Button>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
