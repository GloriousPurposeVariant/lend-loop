import type { Metadata } from "next";
import { AdminUsers } from "@/components/AdminUsers";

export const metadata: Metadata = {
  title: "Members · LendLoop admin",
};

export default function AdminUsersPage() {
  return <AdminUsers />;
}
