"use client";

import { use } from "react";
import { CurrentUserContext, type CurrentUserState } from "@/components/CurrentUserProvider";

/** The signed-in user's LendLoop profile, shared by every component. */
export function useCurrentUser(): CurrentUserState {
  const state = use(CurrentUserContext);
  if (state === null) {
    throw new Error("useCurrentUser must be used inside <CurrentUserProvider>.");
  }
  return state;
}
