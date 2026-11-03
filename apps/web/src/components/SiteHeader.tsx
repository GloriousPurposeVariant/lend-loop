"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import { AuthLoading, Authenticated, Unauthenticated } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonStyles } from "@/components/ui";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const NAV_LINKS = [
  { href: "/tools", label: "Browse" },
  { href: "/my-listings", label: "My listings" },
  { href: "/requests", label: "My requests" },
  { href: "/incoming", label: "Incoming" },
  { href: "/activity", label: "Activity" },
] as const;

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
        isActive ? "bg-emerald-50 text-emerald-700" : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {label}
    </Link>
  );
}

/** Name and role next to the avatar. Until the profile loads, just the avatar. */
function UserSummary() {
  const state = useCurrentUser();
  if (state.status !== "ready") {
    return <UserButton />;
  }
  const { user } = state;
  const roleLabel =
    user.role === "admin" ? "Admin" : user.isTrustedLender ? "Trusted Lender" : "Member";
  return (
    <div className="flex items-center gap-3">
      <div className="text-right leading-tight">
        <p className="text-sm font-medium">{user.displayName}</p>
        <p className="text-xs text-gray-500">{roleLabel}</p>
      </div>
      <UserButton />
    </div>
  );
}

export function SiteHeader() {
  const state = useCurrentUser();
  const isAdmin = state.status === "ready" && state.user.role === "admin";

  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-5xl px-4">
        <div className="flex items-center justify-between gap-3 py-3">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <span
              aria-hidden="true"
              className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-white"
            >
              L
            </span>
            LendLoop
          </Link>
          <AuthLoading>
            <span className="text-sm text-gray-500">Loading…</span>
          </AuthLoading>
          <Unauthenticated>
            <SignInButton mode="modal">
              <button type="button" className={buttonStyles.primary}>
                Sign in to lend or borrow
              </button>
            </SignInButton>
          </Unauthenticated>
          <Authenticated>
            <UserSummary />
          </Authenticated>
        </div>

        <Authenticated>
          {/* Scrolls sideways on narrow phones instead of wrapping onto many lines. */}
          <nav aria-label="Main" className="-mx-1 flex gap-1 overflow-x-auto pb-2">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.href} {...link} />
            ))}
            {isAdmin && <NavLink href="/admin" label="Admin" />}
          </nav>
        </Authenticated>
      </div>
    </header>
  );
}
