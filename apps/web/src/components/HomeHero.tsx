"use client";

import { SignInButton } from "@clerk/nextjs";
import { Authenticated, Unauthenticated } from "convex/react";
import Link from "next/link";

// Buttons made for the green banner. They don't extend the shared button styles,
// because two Tailwind classes for the same property (e.g. two backgrounds) clash.
const onBanner =
  "inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50";
const onBannerGhost =
  "inline-flex items-center rounded-lg bg-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/25";

/** The home page call to action: sign in when signed out, browse or lend when signed in. */
export function HomeHero() {
  return (
    <section className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 px-6 py-12 text-white sm:px-10">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">LendLoop</h1>
      <p className="mt-2 text-lg text-emerald-50">
        Borrow what you need. Lend what you don&apos;t.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Unauthenticated>
          <SignInButton mode="modal">
            <button type="button" className={onBanner}>
              Sign in to lend or borrow
            </button>
          </SignInButton>
        </Unauthenticated>
        <Authenticated>
          <Link href="/tools" className={onBanner}>
            Browse tools
          </Link>
          <Link href="/my-listings" className={onBannerGhost}>
            Lend a tool
          </Link>
        </Authenticated>
      </div>
    </section>
  );
}
