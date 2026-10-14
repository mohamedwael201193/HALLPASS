import { useEffect, useState } from "react";
import { motion, MotionConfig } from "framer-motion";
import Logo from "./Logo";
import Aurora, { TagMark } from "./hero/Aurora";
import "./hero/hero-motion.css";

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

const HEADLINE_LINES: { words: string[]; accent?: boolean }[] = [
  { words: ["KEYS"] },
  { words: ["WITH", "A"] },
  { words: ["BOUNCER."], accent: true },
];

const TICKER = "POLICIES, ENFORCED. · SESSIONS, SCOPED. · REVOCABLE ANYTIME. · PROVEN ON MAINNET. · ";

/**
 * Hero (redesign 2026-10-14 — founder verdict: the 12.5vw headline was too
 * loud, the giant static tag image is gone).
 *
 * Composition: centered, calm, editorial. Eyebrow → confident-but-refined
 * all-caps display headline at ~7.5vw → parenthetical italic subhead →
 * two CTAs. Behind it all, a LIVING background (CSS/SVG only, see
 * hero/Aurora.tsx + hero-motion.css): slow amber aurora drifts, a subtle
 * beam sweep, faint particles, and a ghost stroke-only hall-pass tag —
 * elegant, never a rave. Entrance motion is opacity + translateY ≤0.8s,
 * reduced-motion safe via MotionConfig + the reduced-motion block in
 * hero-motion.css. Marquee anchors the bottom of the hero.
 */
export default function Hero() {
  const stats = useLiveStats();

  return (
    <MotionConfig reducedMotion="user">
      <section id="top" className="relative overflow-hidden bg-[#121110] text-[#FFF9EF]">
        {/* living background: aurora + beam + particles + ghost tag motif */}
        <Aurora />

        {/* film-grain texture */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[5] opacity-[0.05] [background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22/></filter><rect width=%22120%22 height=%22120%22 filter=%22url(%23n)%22 opacity=%220.6%22/></svg>')]"
        />

        {/* ---- content: centered, calm, generous whitespace ---- */}
        <div className="relative z-10 mx-auto flex min-h-[92vh] w-full max-w-4xl flex-col items-center justify-center px-6 pb-20 pt-32 text-center md:pt-36">
          {/* eyebrow */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="flex items-center gap-3"
          >
            <Logo size={26} />
            <span className="text-[13px] font-extrabold uppercase tracking-[0.35em] text-[#FFF9EF]/75">
              Hall&nbsp;Pass&nbsp;&nbsp;·&nbsp;&nbsp;ERC-6900 policy plugins
            </span>
            <TagMark className="h-4 w-4 text-[#FFB224]" />
          </motion.div>

          {/* the headline — confident, not loud */}
          <h1 className="mt-10 font-display text-[clamp(2.75rem,7.5vw,7.5rem)] font-black uppercase leading-[0.92] tracking-tight">
            {HEADLINE_LINES.map((line, li) => (
              <span key={li} className="block">
                {line.words.map((word, wi) => (
                  <motion.span
                    key={wi}
                    initial={{ opacity: 0, y: 26 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.7,
                      ease: "easeOut",
                      delay: 0.12 + (li * 2 + wi) * 0.08,
                    }}
                    className={`inline-block ${line.accent ? "text-[#FFB224]" : ""}`}
                  >
                    {word}
                    {wi < line.words.length - 1 ? " " : ""}
                  </motion.span>
                ))}
              </span>
            ))}
          </h1>

          {/* parenthetical italic subhead */}
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.55, ease: "easeOut" }}
            className="mt-10 max-w-[54ch] text-lg italic leading-[1.6] text-[#FAF6EE]/75 md:text-xl"
          >
            (Session-key plugins for agent smart wallets — your agent spends
            inside the bounds you set, and everything else reverts on-chain.)
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7, ease: "easeOut" }}
            className="mt-12 flex w-full flex-col items-center gap-4 sm:w-auto sm:flex-row sm:items-center"
          >
            <a
              href="/app"
              className="inline-flex min-h-[56px] w-full items-center justify-center rounded-full bg-[#FFB224] px-10 text-base font-bold text-[#121110] transition-transform duration-200 hover:scale-[1.04] active:scale-[0.98] sm:w-auto"
            >
              Install the plugin
            </a>
            <a
              href="#live-proof"
              className="inline-flex min-h-[56px] w-full items-center justify-center rounded-full border border-[#FFF9EF]/30 px-10 text-base font-semibold text-[#FFF9EF] transition-colors hover:border-[#FFB224] hover:text-[#FFB224] sm:w-auto"
            >
              See live proof
            </a>
          </motion.div>

          {/* live-stats row: real values only — omitted otherwise */}
          {stats !== null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-16 grid w-full max-w-3xl grid-cols-3 gap-6 border-t border-[#FFF9EF]/10 pt-8 text-left"
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
                  <div className="font-display text-4xl font-extrabold tabular-nums text-[#FFF9EF] md:text-5xl">
                    {s.value.toLocaleString()}
                  </div>
                  <div className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-[#FFF9EF]/50">
                    {s.label}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </div>

        {/* ---- marquee anchors the hero bottom ---- */}
        <div
          className="ticker relative z-10 overflow-hidden border-y border-[#FFB224]/15 bg-[#121110]/80 py-4 backdrop-blur-sm"
          aria-hidden="true"
        >
          <div className="ticker-track flex w-max whitespace-nowrap">
            {[0, 1].map((i) => (
              <span
                key={i}
                className="pr-4 text-lg font-extrabold uppercase tracking-[0.25em] text-[#FFB224]"
              >
                {TICKER.repeat(4)}
              </span>
            ))}
          </div>
          <style>{`
            .ticker-track { animation: ticker-x 28s linear infinite; }
            .ticker:hover .ticker-track { animation-play-state: paused; }
            @keyframes ticker-x { from { transform: translateX(0); } to { transform: translateX(-50%); } }
            @media (prefers-reduced-motion: reduce) { .ticker-track { animation: none; } }
          `}</style>
        </div>
      </section>
    </MotionConfig>
  );
}
