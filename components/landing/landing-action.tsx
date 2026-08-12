"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";

export function LandingAction({
  children,
  className,
  hideForAnonymous = false,
}: {
  children: ReactNode;
  className: string;
  hideForAnonymous?: boolean;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <span aria-hidden className={`${className} animate-pulse bg-muted`} />;
  }

  if (hideForAnonymous && user?.is_anonymous) return null;

  return <>{children}</>;
}
