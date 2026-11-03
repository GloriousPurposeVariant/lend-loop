import type { Metadata } from "next";
import { AdminAutomations } from "@/components/AdminAutomations";

export const metadata: Metadata = {
  title: "Automations · LendLoop admin",
};

export default function AdminAutomationsPage() {
  return <AdminAutomations />;
}
