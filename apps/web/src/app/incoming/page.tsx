import type { Metadata } from "next";
import { IncomingRequests } from "@/components/IncomingRequests";
import { RequireSignIn } from "@/components/RequireSignIn";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Incoming requests · LendLoop",
};

export default function IncomingRequestsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-bold">Incoming requests</h1>
        <p className="mt-1 text-sm text-gray-600">People who want to borrow your tools.</p>
        <div className="mt-6">
          <RequireSignIn>
            <IncomingRequests />
          </RequireSignIn>
        </div>
      </main>
    </>
  );
}
