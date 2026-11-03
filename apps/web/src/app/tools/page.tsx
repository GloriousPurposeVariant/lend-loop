import type { Metadata } from "next";
import { ToolBrowser } from "@/components/ToolBrowser";
import { PageShell } from "@/components/PageShell";
import { RequireSignIn } from "@/components/RequireSignIn";

export const metadata: Metadata = {
  title: "Browse tools · LendLoop",
};

export default function BrowseToolsPage() {
  return (
    <PageShell title="Browse tools" description="Find something to borrow and pick your dates.">
      <RequireSignIn>
        <ToolBrowser />
      </RequireSignIn>
    </PageShell>
  );
}
