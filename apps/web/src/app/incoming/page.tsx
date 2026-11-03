import type { Metadata } from "next";
import { IncomingRequests } from "@/components/IncomingRequests";
import { PageShell } from "@/components/PageShell";
import { RequireSignIn } from "@/components/RequireSignIn";

export const metadata: Metadata = {
  title: "Incoming requests · LendLoop",
};

export default function IncomingRequestsPage() {
  return (
    <PageShell title="Incoming requests" description="People who want to borrow your tools.">
      <RequireSignIn>
        <IncomingRequests />
      </RequireSignIn>
    </PageShell>
  );
}
