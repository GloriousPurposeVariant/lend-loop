import type { ReactNode } from "react";

// Small shared building blocks, so every page looks and behaves the same.

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const buttonStyles = {
  primary: `${base} bg-emerald-600 text-white hover:bg-emerald-700`,
  secondary: `${base} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50`,
  danger: `${base} border border-red-200 bg-white text-red-700 hover:bg-red-50`,
} as const;

export const inputStyles =
  "mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none";

export const cardStyles = "rounded-xl border border-gray-200 bg-white shadow-sm";

/** Shown instead of an empty list. `children` is an optional next step, e.g. a link. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
      <p className="text-gray-600">{title}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/** Grey placeholder rows while a list loads, so the page does not jump when data arrives. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-200/70" />
      ))}
    </div>
  );
}

/** One line of red text for a failed action. `role="alert"` makes screen readers announce it. */
export function ErrorText({ message }: { message: string | null }) {
  if (message === null) {
    return null;
  }
  return (
    <p role="alert" className="text-sm text-red-600">
      {message}
    </p>
  );
}
