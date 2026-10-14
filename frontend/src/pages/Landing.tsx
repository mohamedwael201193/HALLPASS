/**
 * Landing — assembles the full HALLPASS landing page in section order:
 * Nav → Hero → Problem → Metaphor → HowItWorks → LiveProof → VibeBreak
 * → Features → Builders → Faq → Cta → Footer.
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
import VibeBreak from "../components/landing/VibeBreak";
import Features from "../components/landing/Features";
import Builders from "../components/landing/Builders";
import Faq from "../components/landing/Faq";
import Cta from "../components/landing/Cta";
import Footer from "../components/landing/Footer";

/** A calm hairline between dark sections — amber, barely there. */
function SectionDivider() {
  return (
    <div aria-hidden className="bg-[#121110]">
      <div className="mx-auto max-w-6xl px-6 md:px-10">
        <div className="h-px bg-[#FFB224]/10" />
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <main
      style={{
        background: "#121110",
        minHeight: "100vh",
      }}
    >
      <style>{`
        section[id] { scroll-margin-top: 84px; }
      `}</style>
      <Nav />
      <Hero />
      <Problem />
      <SectionDivider />
      <Metaphor />
      <SectionDivider />
      <HowItWorks />
      <SectionDivider />
      <LiveProof />
      <VibeBreak />
      <SectionDivider />
      <Features />
      <SectionDivider />
      <Builders />
      <SectionDivider />
      <Faq />
      <Cta />
      <Footer />
    </main>
  );
}
