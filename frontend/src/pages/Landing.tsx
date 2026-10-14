/**
 * Landing — assembles the full HALLPASS landing page in section order:
 * Nav → Hero → Problem → Metaphor → HowItWorks → LiveProof → Features
 * → Builders → Faq → Cta → Footer.
 *
 * Sections owned elsewhere are imported cleanly as defaults; they are
 * expected at ../components/landing/<Name>.tsx.
 */

import Nav from "../components/landing/Nav";
import Hero from "../components/landing/Hero";
import Problem from "../components/landing/Problem";
import Metaphor from "../components/landing/Metaphor";
import HowItWorks from "../components/landing/HowItWorks";
import LiveProof from "../components/landing/LiveProof";
import Features from "../components/landing/Features";
import Builders from "../components/landing/Builders";
import Faq from "../components/landing/Faq";
import Cta from "../components/landing/Cta";
import Footer from "../components/landing/Footer";

export default function Landing() {
  return (
    <main
      style={{
        background: "#121110",
        minHeight: "100vh",
        fontFamily:
          "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <Nav />
      <Hero />
      <Problem />
      <Metaphor />
      <HowItWorks />
      <LiveProof />
      <Features />
      <Builders />
      <Faq />
      <Cta />
      <Footer />
    </main>
  );
}
