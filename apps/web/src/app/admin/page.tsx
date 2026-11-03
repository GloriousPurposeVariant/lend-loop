import { redirect } from "next/navigation";

// /admin has no page of its own; Loans is the first tab.
export default function AdminIndexPage() {
  redirect("/admin/loans");
}
