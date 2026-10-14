/**
 * VibeBreak — the one allowed "vibe break": a single word + a quiet ambient
 * mark. No copy, no CTA. Palate cleanser between proof and features.
 * Carry grammar: dark shell with dashed borders, blue breathing ring.
 * Static fallback under reduced motion.
 */

import { motion } from "framer-motion";
import { useHidden, EASE_OUT } from "./reveal";

const BLUE = "#4da2ff";

export default function VibeBreak() {
  const hidden = useHidden(48);
  return (
    <section
      aria-hidden="true"
      className="relative mx-auto w-full max-w-7xl overflow-hidden border-x border-t border-dashed border-white/20 bg-[#050505] px-6 py-[10vh] text-center"
    >
      <style>{`
        @keyframes vibe-breathe {
          0%, 100% { transform: scale(1); opacity: 0.35; }
          50%      { transform: scale(1.12); opacity: 0.15; }
        }
        .vibe-breathe {
          transform-box: fill-box;
          transform-origin: center;
          animation: vibe-breathe 7s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .vibe-breathe { animation: none; opacity: 0.25; }
        }
      `}</style>

      {/* ambient mark: one slow-breathing permission ring */}
      <svg
        width="360"
        height="180"
        viewBox="0 0 360 180"
        className="pointer-events-none absolute left-1/2 top-1/2 max-w-[80vw] -translate-x-1/2 -translate-y-1/2 opacity-50"
      >
        <circle className="vibe-breathe" cx="180" cy="90" r="52" fill="none" stroke={BLUE} strokeWidth="1.5" />
        <circle cx="180" cy="90" r="30" fill="none" stroke={BLUE} strokeWidth="1" opacity="0.5" />
        <circle cx="180" cy="90" r="5" fill={BLUE} opacity="0.8" />
      </svg>

      <motion.h2
        initial={hidden}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: EASE_OUT }}
        className="font-geist relative text-2xl font-normal uppercase tracking-[0.5em] text-white/80 md:text-3xl"
      >
        Bouncer
      </motion.h2>
    </section>
  );
}
