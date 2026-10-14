/**
 * Cta — the final ask. Amber band, confident but restrained.
 *
 * Design-standard §6: the page's single primary CTA belongs to the hero,
 * so this band uses ghost/outline buttons only — no competing primary.
 */

import { motion } from "framer-motion";
import { useHidden, EASE_OUT } from "./reveal";

const TOKENS = {
  amber: "#FFB224",
};

export default function Cta() {
  const hidden = useHidden(48);
  return (
    <section
      style={{
        background: TOKENS.amber,
        color: "#121110",
        padding: "clamp(72px, 8vw, 96px) 24px",
        textAlign: "center",
      }}
    >
      <style>{`
        .cta-btn { transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease; }
        .cta-btn-solid:hover { background: #121110 !important; color: #FFB224 !important; }
        .cta-btn-ghost:hover { border-color: #121110 !important; background: rgba(18,17,16,0.08); }
      `}</style>
      <motion.div
        initial={hidden}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: EASE_OUT }}
        style={{ maxWidth: 820, margin: "0 auto" }}
      >
        <h2
          style={{
            fontSize: "clamp(28px, 4.5vw, 48px)",
            lineHeight: 1.18,
            letterSpacing: "-0.01em",
            fontWeight: 800,
            margin: "0 0 16px",
          }}
        >
          Your agent goes to work tomorrow. Give it a hall pass — not your keys.
        </h2>
        <p
          style={{
            fontSize: 17,
            lineHeight: 1.6,
            maxWidth: 620,
            margin: "0 auto 36px",
            color: "rgba(18,17,16,0.72)",
          }}
        >
          Install the plugin, set the bounds, hand your agent the session key.
          Every spend inside the policy goes through; everything else reverts
          on-chain. Verify the whole flow yourself first.
        </p>
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <a
            href="#live-proof"
            className="cta-btn cta-btn-solid"
            style={{
              display: "inline-block",
              background: "transparent",
              color: "#121110",
              fontWeight: 700,
              fontSize: 16,
              padding: "15px 32px",
              borderRadius: 12,
              textDecoration: "none",
              border: "2px solid #121110",
            }}
          >
            Verify the live proof
          </a>
          <a
            href="#faq"
            className="cta-btn cta-btn-ghost"
            style={{
              display: "inline-block",
              background: "transparent",
              color: "#121110",
              fontWeight: 700,
              fontSize: 16,
              padding: "15px 32px",
              borderRadius: 12,
              textDecoration: "none",
              border: "2px solid rgba(18,17,16,0.45)",
            }}
          >
            Read the FAQ
          </a>
        </div>
      </motion.div>
    </section>
  );
}
