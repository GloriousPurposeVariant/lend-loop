"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import { AuthLoading, Authenticated, Unauthenticated } from "convex/react";
import Link from "next/link";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export function SiteHeader() {
  const state = useCurrentUser();
  const isAdmin = state.status === "ready" && state.user.role === "admin";

  return (
    <header className="border-b border-gray-200">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold">
          LendLoop
        </Link>
        <AuthLoading>
          <span className="text-sm text-gray-500">Loading…</span>
        </AuthLoading>
        <Unauthenticated>
          <SignInButton mode="modal">
            <button
              type="button"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
            >
              Sign in to lend or borrow
            </button>
          </SignInButton>
        </Unauthenticated>
        <Authenticated>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/my-listings" className="hover:underline">
              My listings
            </Link>
            {isAdmin && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium">
                Admin
              </span>
            )}
            <UserButton />
          </nav>
        </Authenticated>
      </div>
    </header>
  );
}
