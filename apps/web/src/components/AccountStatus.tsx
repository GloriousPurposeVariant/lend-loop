"use client";

import { useCurrentUser } from "@/hooks/useCurrentUser";

// Temporary panel that proves sign-in, profile creation and roles work end to end.
export function AccountStatus() {
  const state = useCurrentUser();

  switch (state.status) {
    case "loading":
      return <p className="text-sm text-gray-500">Loading your account…</p>;
    case "signedOut":
      return <p className="text-sm text-gray-500">You are browsing as a guest.</p>;
    case "error":
      return (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      );
    case "ready":
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            Signed in as <strong>{state.user.displayName}</strong>
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium">
            {state.user.role}
          </span>
          {state.user.isTrustedLender && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
              Trusted Lender
            </span>
          )}
        </div>
      );
  }
}
