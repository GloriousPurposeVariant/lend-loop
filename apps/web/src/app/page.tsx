import { PublicToolList } from "@/components/PublicToolList";
import { SiteHeader } from "@/components/SiteHeader";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <h1 className="text-3xl font-bold">LendLoop</h1>
        <p className="mt-2 text-gray-600">Borrow what you need. Lend what you don&apos;t.</p>
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Tools in the neighbourhood</h2>
          <PublicToolList />
        </section>
      </main>
    </>
  );
}
