import type { Metadata } from "next";
import { AdminCategories } from "@/components/AdminCategories";

export const metadata: Metadata = {
  title: "Categories · LendLoop admin",
};

export default function AdminCategoriesPage() {
  return (
    <>
      <p className="mb-4 text-sm text-gray-600">
        Deactivated categories disappear from the listing form. Tools already in them keep them.
      </p>
      <AdminCategories />
    </>
  );
}
