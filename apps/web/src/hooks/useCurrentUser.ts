"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/errors";

export type CurrentUser = NonNullable<FunctionReturnType<typeof api.users.me>>;

export type CurrentUserState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "error"; message: string }
  | { status: "ready"; user: CurrentUser };

/**
 * The signed-in user's LendLoop profile. On first sign-in it asks Convex to create
 * the profile; the `me` query then updates by itself once the row exists.
 */
export function useCurrentUser(): CurrentUserState {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const ensureCurrent = useMutation(api.users.ensureCurrent);
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    ensureCurrent().catch((error: unknown) => setSyncError(getErrorMessage(error)));
  }, [isAuthenticated, ensureCurrent]);

  if (isLoading) {
    return { status: "loading" };
  }
  if (!isAuthenticated) {
    return { status: "signedOut" };
  }
  if (syncError !== null) {
    return { status: "error", message: syncError };
  }
  // undefined = query loading, null = profile not created yet. Both mean "wait".
  if (me === undefined || me === null) {
    return { status: "loading" };
  }
  return { status: "ready", user: me };
}
