"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { createContext, useEffect, useState, type ReactNode } from "react";
import { getErrorMessage } from "@/lib/errors";

export type CurrentUser = NonNullable<FunctionReturnType<typeof api.users.me>>;

export type CurrentUserState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "error"; message: string }
  | { status: "ready"; user: CurrentUser };

export const CurrentUserContext = createContext<CurrentUserState | null>(null);

/**
 * Works out the signed-in user's LendLoop profile once for the whole app. On first
 * sign-in it asks Convex to create the profile; the live `me` query then updates
 * by itself once the row exists.
 */
export function CurrentUserProvider({ children }: { children: ReactNode }) {
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

  let state: CurrentUserState;
  if (isLoading) {
    state = { status: "loading" };
  } else if (!isAuthenticated) {
    state = { status: "signedOut" };
  } else if (syncError !== null) {
    state = { status: "error", message: syncError };
  } else if (me === undefined || me === null) {
    // undefined = query loading, null = profile not created yet. Both mean "wait".
    state = { status: "loading" };
  } else {
    state = { status: "ready", user: me };
  }

  return <CurrentUserContext value={state}>{children}</CurrentUserContext>;
}
