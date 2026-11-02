import type { Metadata } from "next";
import { RequireSignIn } from "@/components/RequireSignIn";
import { SiteHeader } from "@/components/SiteHeader";
import { ToolBrowser } from "@/components/ToolBrowser";

export const metadata: Metadata = {
  title: "Browse tools · LendLoop",
};

export default function BrowseToolsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-bold">Browse tools</h1>
        <div className="mt-6">
          <RequireSignIn>
            <ToolBrowser />
          </RequireSignIn>
        </div>
      </main>
    </>
  );
}
