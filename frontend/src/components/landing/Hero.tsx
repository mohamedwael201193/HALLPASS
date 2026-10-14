import { useEffect, useState } from "react";
import { motion, MotionConfig, useReducedMotion } from "framer-motion";
import TagMark from "./Logo";
import { GradientCta } from "./carry/Section";
import { Beams } from "../../vendor/reactbits/Beams/Beams";
import DotGrid from "../../vendor/reactbits/DotGrid/DotGrid";

type Stats = {
  accounts: number;
  spendsAllowed: number;
  spendsBlocked: number;
  source?: string;
};

/**
 * Live stats are rendered ONLY when the API returns real values.
 * Per design law §3: no real stat → the row is omitted. Never zeros-with-caption.
 * "Real" means the API's source field says indexer — any other/degraded
 * response renders NOTHING, not zeros. Endpoint: GET /api/v1/stats
 * (CONTRACT.md §4.5 — real COUNT(*) over the indexer event cache).
 */
function useLiveStats(): Stats | null {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/stats")
      .then((r) => {
        if (!r.ok) throw new Error("stats unavailable");
        return r.json();
      })
      .then((data: Stats) => {
        const vals = [data.accounts, data.spendsAllowed, data.spendsBlocked];
        if (
          !cancelled &&
          data.source === "indexer" &&
          vals.every((v) => Number.isFinite(v))
        )
          setStats(data);
      })
      .catch(() => {
        /* row stays omitted — nothing real to show */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return stats;
}

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, ease: "easeOut" as const, delay },
});

/**
 * Hero — carry grammar, amber identity (2026-10-15). De-cloned from the blue carry-exact pass per founder order.
 *
 * Background: DotGrid (dots tinted #FFB224 at low opacity, radial edge fade)
 * + Beams (color '#FFB224', narrower/softer than the carry pass) as the
 * top-center light beam.
 * Both are dependency-free WebGL; paused={true} under reduced motion.
 *
 * Typography: Satoshi 400 H1 (text-5xl → md:text-6xl → lg:text-[4.5rem],
 * leading 1.05, tracking-tight, white, explicit two-line break), Satoshi 300
 * text-xl gray-400 subcopy. CTA row: gradient-border primary + outline
 * secondary. Microcopy in Geist Mono. No blur() anywhere.
 */
export default function Hero() {
  const stats = useLiveStats();
  const reduceMotion = useReducedMotion();

  return (
    <MotionConfig reducedMotion="user">
      <section
        id="top"
        className="relative mx-auto w-full max-w-7xl overflow-hidden border-x border-dashed border-white/20 px-6 pb-24 pt-16 text-center md:pb-32 md:pt-32"
      >
        {/* living background: amber dot field + top-center light beam */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <DotGrid
            className="absolute inset-0"
            dotSize={4}
            gap={20}
            baseColor="#2a1f0a"
            activeColor="#FFB224"
            fade={0.9}
            opacity={0.55}
            mouseInteraction={false}
            clickShock={false}
            intro={!reduceMotion}
            paused={reduceMotion ?? false}
          />
          <div className="carry-beam-mask absolute inset-x-0 top-0 h-[360px]">
            <Beams
              color="#FFB224"
              beamWidth={80}
              speed={0.4}
              brightness={0.35}
              glow={0.15}
              fillLight={0.05}
              opacity={0.32}
              fade={0.5}
              mouseInteraction={false}
              intro={!reduceMotion}
              paused={reduceMotion ?? false}
            />
          </div>
          {/* dark scrim behind the headline — keeps text on near-black */}
          <div
            aria-hidden
            className="carry-headline-scrim absolute inset-x-0 top-[60px] h-[560px]"
          />
        </div>

        {/* ---- content: centered, minimal ---- */}
        <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center">
          {/* eyebrow */}
          <motion.div
            {...rise(0)}
            className="mb-6 flex items-center gap-3"
          >
            <TagMark size={16} />
            <span className="text-[11px] tracking-[0.3em] text-white/50">
              HALL&nbsp;PASS&nbsp;·&nbsp;ERC-6900&nbsp;POLICY&nbsp;PLUGINS
            </span>
          </motion.div>

          {/* headline — calm, centered, Satoshi 400, explicit two-line break */}
          <motion.h1
            {...rise(0.12)}
            className="mb-6 text-5xl font-normal leading-[1.05] tracking-tight text-white md:text-6xl lg:text-[4.5rem]"
          >
            Give your agent a{" "}<br className="hidden md:block" />
            <span className="text-[#FFB224]">hall&nbsp;pass,</span> not your
            keys.
          </motion.h1>

          {/* subcopy — Satoshi 300, text-xl, gray-400 */}
          <motion.p
            {...rise(0.26)}
            className="mx-auto mb-10 max-w-2xl text-xl font-light leading-relaxed text-gray-400"
          >
            Session-key plugins for agent smart wallets. Set the bounds —
            spend caps, allowed targets, expiry — and everything outside them
            reverts on-chain. Revoke anytime.
          </motion.p>

          {/* CTA row */}
          <motion.div
            {...rise(0.4)}
            className="flex flex-col items-center gap-6 sm:flex-row"
          >
            <GradientCta href="/app">Install the plugin</GradientCta>
            <a
              href="#live-proof"
              className="inline-flex min-h-[44px] items-center justify-center rounded-none border border-white/20 bg-white/5 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-white/15"
            >
              See live proof
            </a>
          </motion.div>

          {/* microcopy */}
          <motion.p
            {...rise(0.52)}
            className="font-geist mt-10 text-[10px] uppercase tracking-[0.25em] text-white/60"
          >
            Proven on Arc mainnet&nbsp;&nbsp;·&nbsp;&nbsp;Revocable
            anytime&nbsp;&nbsp;·&nbsp;&nbsp;No custody
          </motion.p>

          {/* live-stats row: real values only — omitted otherwise */}
          {stats !== null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.65 }}
              className="mt-14 grid w-full max-w-2xl grid-cols-3 gap-6 border-t border-white/10 pt-8 text-center"
              aria-live="polite"
            >
              {(
                [
                  { value: stats.accounts, label: "accounts protected" },
                  { value: stats.spendsAllowed, label: "spends allowed" },
                  { value: stats.spendsBlocked, label: "spends blocked" },
                ] as const
              ).map((s) => (
                <div key={s.label}>
                  <div className="text-3xl font-normal tabular-nums text-white md:text-4xl">
                    {s.value.toLocaleString()}
                  </div>
                  <div className="font-geist mt-2 text-[10px] uppercase tracking-[0.2em] text-white/40">
                    {s.label}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </div>
      </section>
    </MotionConfig>
  );
}
