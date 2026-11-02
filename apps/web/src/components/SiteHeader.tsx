"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import { AuthLoading, Authenticated, Unauthenticated } from "convex/react";
import Link from "next/link";

export function SiteHeader() {
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
          <UserButton />
        </Authenticated>
      </div>
    </header>
  );
}
