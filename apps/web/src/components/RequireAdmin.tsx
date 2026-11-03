"use client";

import type { ReactNode } from "react";
import { RequireSignIn } from "@/components/RequireSignIn";
import { EmptyState } from "@/components/ui";
import { useCurrentUser } from "@/hooks/useCurrentUser";

// A convenience for the UI only. Every admin function in Convex calls requireAdmin.
export function RequireAdmin({ children }: { children: ReactNode }) {
  const state = useCurrentUser();

  if (state.status === "ready" && state.user.role !== "admin") {
    return <EmptyState title="Only admins can see this page." />;
  }
  return <RequireSignIn>{children}</RequireSignIn>;
}
