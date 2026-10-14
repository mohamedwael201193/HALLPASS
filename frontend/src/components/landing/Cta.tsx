/**
 * Cta — the final ask, carry-exact.
 * Dark section shell; headline in Satoshi 400; the single gradient-border
 * primary CTA + outline ghost. All copy byte-identical.
 */

import { motion } from "framer-motion";
import { useHidden, EASE_OUT } from "./reveal";
import { GradientCta } from "./carry/Section";

export default function Cta() {
  const hidden = useHidden(48);
  return (
    <section className="relative mx-auto w-full max-w-7xl border-x border-t border-dashed border-white/20 bg-[#050505] px-6 py-20 text-center md:py-28">
      <style>{`
        .cta-ghost { transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease; }
        .cta-ghost:hover { border-color: #4da2ff !important; background: rgba(77,162,255,0.08) !important; color: #4da2ff !important; }
      `}</style>
      <motion.div
        initial={hidden}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: EASE_OUT }}
        className="mx-auto max-w-3xl"
      >
        <h2 className="text-4xl font-normal leading-[1.18] tracking-tight text-white md:text-6xl">
          Your agent goes to work tomorrow. Give it a hall pass — not your keys.
        </h2>
        <p className="mx-auto mb-10 mt-6 max-w-xl text-[17px] font-light leading-[1.6] text-gray-400">
          Install the plugin, set the bounds, hand your agent the session key.
          Every spend inside the policy goes through; everything else reverts
          on-chain. Verify the whole flow yourself first.
        </p>
        <div className="flex flex-col items-center justify-center gap-6 sm:flex-row">
          <GradientCta href="#live-proof">Verify the live proof</GradientCta>
          <a
            href="#faq"
            className="cta-ghost inline-flex min-h-[44px] items-center justify-center rounded-none border border-white/20 bg-white/5 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-white no-underline"
          >
            Read the FAQ
          </a>
        </div>
      </motion.div>
    </section>
  );
}
