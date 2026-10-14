/**
 * VibeBreak — the one allowed "vibe break" (design-standard §2):
 * a single all-caps word + ambient visual. No copy, no CTA.
 * Palate cleanser between proof and features.
 *
 * Animation: transform/opacity keyframes only, reduced-motion gated.
 */

import { motion } from "framer-motion";
import { useHidden, EASE_OUT } from "./reveal";

const TOKENS = {
  bg: "#121110",
  amber: "#FFB224",
  textDark: "#FFF9EF",
};

export default function VibeBreak() {
  const hidden = useHidden(60);
  return (
    <section
      aria-hidden="true"
      style={{
        background: TOKENS.bg,
        padding: "18vh 24px",
        overflow: "hidden",
        position: "relative",
        textAlign: "center",
      }}
    >
      <style>{`
        @keyframes vibe-ring {
          0%   { transform: scale(0.6); opacity: 0.9; }
          100% { transform: scale(1.9); opacity: 0; }
        }
        @keyframes vibe-scan {
          0%   { transform: translateX(-60%); opacity: 0; }
          50%  { opacity: 1; }
          100% { transform: translateX(60%); opacity: 0; }
        }
        .vibe-ring {
          transform-box: fill-box;
          transform-origin: center;
          animation: vibe-ring 3.2s ease-out infinite;
        }
        .vibe-ring.r2 { animation-delay: 1.05s; }
        .vibe-ring.r3 { animation-delay: 2.1s; }
        .vibe-scanline { animation: vibe-scan 5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .vibe-ring, .vibe-scanline { animation: none; opacity: 0.25; }
        }
      `}</style>

      {/* ambient visual: expanding pass-stamp rings + a slow scan line */}
      <svg
        width="420"
        height="220"
        viewBox="0 0 420 220"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          opacity: 0.5,
          pointerEvents: "none",
          maxWidth: "90vw",
        }}
      >
        <circle className="vibe-ring" cx="210" cy="110" r="34" fill="none" stroke={TOKENS.amber} strokeWidth="1.5" />
        <circle className="vibe-ring r2" cx="210" cy="110" r="34" fill="none" stroke={TOKENS.amber} strokeWidth="1.5" />
        <circle className="vibe-ring r3" cx="210" cy="110" r="34" fill="none" stroke={TOKENS.amber} strokeWidth="1.5" />
        <circle cx="210" cy="110" r="7" fill={TOKENS.amber} opacity="0.9" />
        <rect className="vibe-scanline" x="60" y="106" width="300" height="2" fill={TOKENS.amber} opacity="0.35" />
      </svg>

      <motion.h2
        initial={hidden}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: EASE_OUT }}
        style={{
          position: "relative",
          margin: 0,
          color: TOKENS.textDark,
          fontWeight: 900,
          fontSize: "clamp(64px, 14vw, 160px)",
          letterSpacing: "0.02em",
          lineHeight: 0.95,
        }}
      >
        BOUNCER
      </motion.h2>
    </section>
  );
}
