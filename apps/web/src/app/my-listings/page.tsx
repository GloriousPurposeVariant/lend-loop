import type { Metadata } from "next";
import { MyListings } from "@/components/MyListings";
import { NewToolForm } from "@/components/NewToolForm";
import { PageShell } from "@/components/PageShell";
import { RequireSignIn } from "@/components/RequireSignIn";

export const metadata: Metadata = {
  title: "My listings · LendLoop",
};

export default function MyListingsPage() {
  return (
    <PageShell title="My listings" description="Lend your tools to neighbours.">
      <RequireSignIn>
        <div className="space-y-8">
          <NewToolForm />
          <MyListings />
        </div>
      </RequireSignIn>
    </PageShell>
  );
}
