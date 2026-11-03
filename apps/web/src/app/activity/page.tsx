import type { Metadata } from "next";
import { ActivityFeed } from "@/components/ActivityFeed";
import { PageShell } from "@/components/PageShell";
import { RequireSignIn } from "@/components/RequireSignIn";

export const metadata: Metadata = {
  title: "Activity · LendLoop",
};

export default function ActivityPage() {
  return (
    <PageShell
      title="Activity"
      description="Everything that happened with your loans, including the emails we sent."
    >
      <RequireSignIn>
        <ActivityFeed />
      </RequireSignIn>
    </PageShell>
  );
}
