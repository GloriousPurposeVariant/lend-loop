"use client";

import { SignInButton } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

// A convenience for the UI only. Convex still checks the caller on every call,
// so skipping this gate in the browser would not expose anything.
export function RequireSignIn({ children }: { children: ReactNode }) {
  const state = useCurrentUser();

  switch (state.status) {
    case "loading":
      return <p className="text-sm text-gray-500">Loading your account…</p>;
    case "error":
      return (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      );
    case "signedOut":
      return (
        <div className="rounded-lg border border-gray-200 p-6 text-center">
          <p className="text-gray-700">Sign in to see this page.</p>
          <SignInButton mode="modal">
            <button
              type="button"
              className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
            >
              Sign in to lend or borrow
            </button>
          </SignInButton>
        </div>
      );
    case "ready":
      return children;
  }
}
