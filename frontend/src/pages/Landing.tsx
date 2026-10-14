/**
 * Landing — assembles the full HALLPASS landing page in section order:
 * Nav → Hero → Problem → Metaphor → HowItWorks → LiveProof → VibeBreak
 * → Features → Builders → Faq → Cta → Footer.
 *
 * Sections owned elsewhere are imported cleanly as defaults; they are
 * expected at ../components/landing/<Name>.tsx.
 *
 * Carry-exact (2026-10-15): sections carry their own dashed border-top
 * dividers per the carry grammar — no separate divider components.
 */

import "../components/landing/carry/carry.css";
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

export default function Landing() {
  return (
    <main
      className="carry-landing"
      style={{
        background: "#050505",
        minHeight: "100vh",
      }}
    >
      <style>{`
        section[id] { scroll-margin-top: 84px; }
      `}</style>
      <Nav />
      <Hero />
      <Problem />
      <Metaphor />
      <HowItWorks />
      <LiveProof />
      <VibeBreak />
      <Features />
      <Builders />
      <Faq />
      <Cta />
      <Footer />
    </main>
  );
}
