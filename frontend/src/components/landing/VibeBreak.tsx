/**
 * VibeBreak — the one allowed "vibe break" (design-standard §2):
 * a single word + a quiet ambient mark. No copy, no CTA.
 * Palate cleanser between proof and features.
 *
 * Restraint pass: smaller word, one slow breathing ring, no scanline,
 * no strobing keyframes. Static fallback under reduced motion.
 */

import { motion } from "framer-motion";
import { useHidden, EASE_OUT } from "./reveal";

const TOKENS = {
  bg: "#121110",
  amber: "#FFB224",
  textDark: "#FFF9EF",
};

export default function VibeBreak() {
  const hidden = useHidden(48);
  return (
    <section
      aria-hidden="true"
      style={{
        background: TOKENS.bg,
        padding: "12vh 24px",
        overflow: "hidden",
        position: "relative",
        textAlign: "center",
      }}
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
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          opacity: 0.5,
          pointerEvents: "none",
          maxWidth: "80vw",
        }}
      >
        <circle className="vibe-breathe" cx="180" cy="90" r="52" fill="none" stroke={TOKENS.amber} strokeWidth="1.5" />
        <circle cx="180" cy="90" r="30" fill="none" stroke={TOKENS.amber} strokeWidth="1" opacity="0.5" />
        <circle cx="180" cy="90" r="5" fill={TOKENS.amber} opacity="0.8" />
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
          fontSize: "clamp(44px, 9vw, 104px)",
          letterSpacing: "0.02em",
          lineHeight: 0.95,
          opacity: 0.92,
        }}
      >
        BOUNCER
      </motion.h2>
    </section>
  );
}
