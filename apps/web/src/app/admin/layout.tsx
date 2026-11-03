import { AdminNav } from "@/components/AdminNav";
import { PageShell } from "@/components/PageShell";
import { RequireAdmin } from "@/components/RequireAdmin";

// Wraps every page under /admin: one title, the admin tabs, and the admin gate.
// Each admin page then only renders its own content.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <PageShell title="Admin" description="Moderate listings, loans, members and categories.">
      <RequireAdmin>
        <AdminNav />
        <div className="mt-6">{children}</div>
      </RequireAdmin>
    </PageShell>
  );
}
