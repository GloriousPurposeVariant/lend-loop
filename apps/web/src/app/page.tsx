import { HomeHero } from "@/components/HomeHero";
import { PublicToolList } from "@/components/PublicToolList";
import { SiteHeader } from "@/components/SiteHeader";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
        <HomeHero />
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-semibold">Tools in the neighbourhood</h2>
          <PublicToolList />
        </section>
      </main>
    </>
  );
}
