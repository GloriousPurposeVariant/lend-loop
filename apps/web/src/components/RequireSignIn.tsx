"use client";

import { SignInButton } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { buttonStyles, EmptyState, ErrorText, ListSkeleton } from "@/components/ui";
import { useCurrentUser } from "@/hooks/useCurrentUser";

// A convenience for the UI only. Convex still checks the caller on every call,
// so skipping this gate in the browser would not expose anything.
export function RequireSignIn({ children }: { children: ReactNode }) {
  const state = useCurrentUser();

  switch (state.status) {
    case "loading":
      return <ListSkeleton />;
    case "error":
      return <ErrorText message={state.message} />;
    case "signedOut":
      return (
        <EmptyState title="Sign in to see this page.">
          <SignInButton mode="modal">
            <button type="button" className={buttonStyles.primary}>
              Sign in to lend or borrow
            </button>
          </SignInButton>
        </EmptyState>
      );
    case "ready":
      return children;
  }
}
