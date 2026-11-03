import type { Metadata } from "next";
import { MyRequests } from "@/components/MyRequests";
import { PageShell } from "@/components/PageShell";
import { RequireSignIn } from "@/components/RequireSignIn";

export const metadata: Metadata = {
  title: "My requests · LendLoop",
};

export default function MyRequestsPage() {
  return (
    <PageShell title="My requests" description="Tools you have asked to borrow.">
      <RequireSignIn>
        <MyRequests />
      </RequireSignIn>
    </PageShell>
  );
}
