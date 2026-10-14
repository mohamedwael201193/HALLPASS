import { useEffect, useState } from "react";
import { motion, MotionConfig } from "framer-motion";
import Logo from "./Logo";
import heroImg from "../../assets/hero-tag.png";

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
 * Hero — the giant stacked headline IS the hero (fix 2026-10-14).
 *
 * Composition: eyebrow → massive all-caps display headline (6–10x body
 * scale) → parenthetical italic subhead → two CTAs. The golden tag artwork
 * lives INSIDE the composition — bled behind/beside the type, edges melted
 * into #121110 with a radial mask, never floating alone in empty space.
 * Marquee anchors the bottom of the hero. All motion is opacity +
 * translateY ≤0.8s, reduced-motion safe via MotionConfig.
 */
export default function Hero() {
  const stats = useLiveStats();

  return (
    <MotionConfig reducedMotion="user">
      <section id="top" className="relative overflow-hidden bg-[#121110] text-[#FFF9EF]">
        {/* film-grain texture */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[5] opacity-[0.05] [background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22/></filter><rect width=%22120%22 height=%22120%22 filter=%22url(%23n)%22 opacity=%220.6%22/></svg>')]"
        />

        {/* ---- tag artwork: bled behind the type, edges melted into #121110 ---- */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.4, ease: "easeOut" }}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-[-6%] z-0 w-[75%] select-none md:right-[0%] md:w-[54%] lg:w-[48%]"
        >
          <motion.div
            animate={{ y: [0, -14, 0] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
            className="h-full w-full [mask-image:radial-gradient(ellipse_80%_75%_at_55%_45%,black_60%,transparent_98%)]"
          >
            <img
              src={heroImg}
              alt=""
              draggable={false}
              className="h-full w-full select-none object-cover opacity-95"
            />
          </motion.div>
        </motion.div>
        {/* soft amber glow tying art to type */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-[-10%] top-[10%] z-0 h-[60%] w-[50%] rounded-full bg-[#FFB224]/[0.07] blur-[120px]"
        />

        {/* ---- content: eyebrow → headline → subhead → CTAs ---- */}
        <div className="relative z-10 mx-auto flex min-h-[88vh] w-full max-w-7xl flex-col justify-center px-6 pb-14 pt-32 md:pt-36 lg:px-10">
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
          </motion.div>

          {/* the headline — this IS the hero */}
          <h1 className="mt-8 font-display text-[clamp(4.25rem,12.5vw,11.5rem)] font-black uppercase leading-[0.88] tracking-tight">
            {HEADLINE_LINES.map((line, li) => (
              <span key={li} className="block">
                {line.words.map((word, wi) => (
                  <motion.span
                    key={wi}
                    initial={{ opacity: 0, y: 34 }}
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
            className="mt-8 max-w-[52ch] text-xl italic leading-[1.55] text-[#FAF6EE]/80 md:text-2xl"
          >
            (Session-key plugins for agent smart wallets — your agent spends
            inside the bounds you set, and everything else reverts on-chain.)
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7, ease: "easeOut" }}
            className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center"
          >
            <a
              href="/app"
              className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-[#FFB224] px-10 text-base font-bold text-[#121110] transition-transform duration-200 hover:scale-[1.04] active:scale-[0.98]"
            >
              Install the plugin
            </a>
            <a
              href="#live-proof"
              className="inline-flex min-h-[56px] items-center justify-center rounded-full border border-[#FFF9EF]/30 px-10 text-base font-semibold text-[#FFF9EF] transition-colors hover:border-[#FFB224] hover:text-[#FFB224]"
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
              className="mt-16 grid max-w-3xl grid-cols-3 gap-6 border-t border-[#FFF9EF]/10 pt-8"
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
