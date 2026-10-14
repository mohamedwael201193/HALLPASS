import { useEffect, useState } from "react";
import { motion, MotionConfig } from "framer-motion";
import Logo from "./Logo";
import heroImg from "@/assets/hero.png";

type Stats = {
  pluginsInstalled: number;
  spendsAllowed: number;
  spendsBlocked: number;
};

/**
 * Live stats are rendered ONLY when the API returns real values.
 * Per design law §3: no real stat → the row is omitted. Never zeros-with-caption.
 */
function useLiveStats(): Stats | null {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats")
      .then((r) => {
        if (!r.ok) throw new Error("stats unavailable");
        return r.json();
      })
      .then((data: Stats) => {
        const vals = [data.pluginsInstalled, data.spendsAllowed, data.spendsBlocked];
        if (!cancelled && vals.every((v) => Number.isFinite(v))) setStats(data);
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

export default function Hero() {
  const stats = useLiveStats();

  return (
    <MotionConfig reducedMotion="user">
      <section id="top" className="relative overflow-hidden bg-[#121110] text-[#FFF9EF]">
        {/* film-grain texture — near-zero risk, encouraged by §4 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22/></filter><rect width=%22120%22 height=%22120%22 filter=%22url(%23n)%22 opacity=%220.6%22/></svg>')]"
        />

        {/* ---- 1. small brand mark ---- */}
        <div className="relative z-10 mx-auto flex max-w-7xl items-center justify-center gap-3 px-6 pt-32">
          <Logo size={28} />
          <span className="text-sm font-extrabold uppercase tracking-[0.35em] text-[#FFF9EF]/80">
            Hall&nbsp;Pass
          </span>
        </div>

        {/* ---- 2. ambient visual — melts into #121110 (edge-matched PNG + radial mask) ---- */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2 }}
          className="relative z-0 mx-auto mt-8 w-full max-w-5xl px-6"
          aria-hidden="true"
        >
          <motion.div
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="[mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black_60%,transparent_100%)]"
          >
            <img
              src={heroImg}
              alt=""
              draggable={false}
              className="h-auto w-full select-none"
            />
          </motion.div>
        </motion.div>

        {/* ---- 3. full-bleed marquee ticker ---- */}
        <div
          className="ticker relative z-10 mt-10 overflow-hidden border-y border-[#FFB224]/15 py-4"
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

        {/* ---- 4. giant 3-line all-caps headline ---- */}
        <div className="relative z-10 mx-auto max-w-7xl px-6 pt-16 text-center lg:px-10">
          <h1 className="text-[clamp(4rem,10vw,7.5rem)] font-black uppercase leading-[0.9] tracking-tight">
            {HEADLINE_LINES.map((line, li) => (
              <span key={li} className="block">
                {line.words.map((word, wi) => (
                  <motion.span
                    key={wi}
                    initial={{ opacity: 0, y: 28 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.5,
                      ease: "easeOut",
                      delay: 0.15 + (li * 2 + wi) * 0.09,
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

          {/* ---- subline: one line, sentence case, below the headline ---- */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7, ease: "easeOut" }}
            className="mx-auto mt-8 max-w-[60ch] text-lg leading-[1.6] text-[#FFF9EF]/70"
          >
            Session-key policy plugins for agent smart wallets — spend inside the
            bounds you set, everything else reverts on-chain.
          </motion.p>

          {/* ---- 5. ONE CTA row: one primary + one ghost ---- */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.85, ease: "easeOut" }}
            className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <a
              href="/app"
              className="rounded-full bg-[#FFB224] px-10 py-4 text-base font-bold text-[#121110] transition-transform hover:scale-[1.04] active:scale-[0.98]"
            >
              Install the plugin
            </a>
            <a
              href="#live-proof"
              className="rounded-full border border-[#FFF9EF]/30 px-10 py-4 text-base font-semibold text-[#FFF9EF] transition-colors hover:border-[#FFB224] hover:text-[#FFB224]"
            >
              See live proof
            </a>
          </motion.div>

          {/* ---- 6. live-stats row: real values only — omitted otherwise ---- */}
          {stats !== null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
              className="mx-auto mt-16 grid max-w-3xl grid-cols-3 gap-6 border-t border-[#FFF9EF]/10 pb-24 pt-8"
              aria-live="polite"
            >
              {(
                [
                  { value: stats.pluginsInstalled, label: "plugins installed" },
                  { value: stats.spendsAllowed, label: "spends allowed" },
                  { value: stats.spendsBlocked, label: "spends blocked" },
                ] as const
              ).map((s) => (
                <div key={s.label}>
                  <div className="text-4xl font-extrabold tabular-nums text-[#FFF9EF] md:text-5xl">
                    {s.value.toLocaleString()}
                  </div>
                  <div className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-[#FFF9EF]/50">
                    {s.label}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
          {stats === null && <div className="pb-24" aria-hidden="true" />}
        </div>
      </section>
    </MotionConfig>
  );
}
