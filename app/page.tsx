import { Navbar, Hero, Benchmarks, Problems, HowItWorks, RetrievalPipeline, AppsShowcase, Footer } from "@/components/landing/sections";

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <Benchmarks />
      <Problems />
      <HowItWorks />
      <RetrievalPipeline />
      <AppsShowcase />
      <Footer />
    </main>
  );
}
