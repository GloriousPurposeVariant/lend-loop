import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";

type Props = {
  title: string;
  description?: string;
  children: ReactNode;
};

/** The frame every page shares: header, then a centred column with a title. */
export function PageShell({ title, description, children }: Props) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-gray-600">{description}</p>}
        <div className="mt-6">{children}</div>
      </main>
    </>
  );
}
