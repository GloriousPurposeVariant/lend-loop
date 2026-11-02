import type { Metadata } from "next";
import { MyRequests } from "@/components/MyRequests";
import { RequireSignIn } from "@/components/RequireSignIn";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "My requests · LendLoop",
};

export default function MyRequestsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-bold">My requests</h1>
        <p className="mt-1 text-sm text-gray-600">Tools you have asked to borrow.</p>
        <div className="mt-6">
          <RequireSignIn>
            <MyRequests />
          </RequireSignIn>
        </div>
      </main>
    </>
  );
}
