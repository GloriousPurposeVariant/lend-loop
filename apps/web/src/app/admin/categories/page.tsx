import type { Metadata } from "next";
import { AdminCategories } from "@/components/AdminCategories";
import { RequireAdmin } from "@/components/RequireAdmin";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Categories · LendLoop admin",
};

export default function AdminCategoriesPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-bold">Categories</h1>
        <p className="mt-1 text-sm text-gray-600">
          Deactivated categories disappear from the listing form. Tools already in them keep them.
        </p>
        <div className="mt-6">
          <RequireAdmin>
            <AdminCategories />
          </RequireAdmin>
        </div>
      </main>
    </>
  );
}
