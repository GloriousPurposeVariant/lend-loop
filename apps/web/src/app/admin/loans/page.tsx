import type { Metadata } from "next";
import { AdminLoans } from "@/components/AdminLoans";

export const metadata: Metadata = {
  title: "Loans · LendLoop admin",
};

export default function AdminLoansPage() {
  return <AdminLoans />;
}
