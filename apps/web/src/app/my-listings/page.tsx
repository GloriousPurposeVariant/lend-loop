import type { Metadata } from "next";
import { MyListings } from "@/components/MyListings";
import { NewToolForm } from "@/components/NewToolForm";
import { RequireSignIn } from "@/components/RequireSignIn";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "My listings · LendLoop",
};

export default function MyListingsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-bold">My listings</h1>
        <div className="mt-6">
          <RequireSignIn>
            <div className="space-y-8">
              <NewToolForm />
              <MyListings />
            </div>
          </RequireSignIn>
        </div>
      </main>
    </>
  );
}
