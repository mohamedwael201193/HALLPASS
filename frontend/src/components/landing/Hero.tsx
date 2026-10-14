import { useEffect, useState } from "react";
import { motion, MotionConfig } from "framer-motion";
import Logo from "./Logo";
import DotMatrix from "./hero/DotMatrix";
import "./hero/dotmatrix-motion.css";

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
 * Hero (rebuild 2026-10-14 — founder order: rebuild in the SPIRIT of
 * usecarry.xyz, adapted to HALLPASS, never a copy).
 *
 * CARRY's grammar, our voice: deep warm-black field, a fine dotted
 * dot-matrix particle field, one soft shaft of AMBER light pouring from
 * the top-center, a huge calm centered headline in sentence case, muted
 * gray subcopy, two CTAs (filled gradient + outlined), and a tiny
 * letterspaced microcopy line beneath.
 *
 * Palette: #121110 bg, #FFB224 amber, #FAF6EE cream. Headline set in
 * Inter semibold with tight tracking — confident and calm, never loud.
 * Entrance motion is opacity + translateY ≤0.8s, reduced-motion safe.
 */
export default function Hero() {
  const stats = useLiveStats();

  return (
    <MotionConfig reducedMotion="user">
      <section
        id="top"
        className="relative overflow-hidden bg-[#121110] text-[#FAF6EE]"
      >
        {/* living background: dot matrix + amber beam + rising motes */}
        <DotMatrix />

        {/* ---- content: centered, minimal, generous whitespace ---- */}
        <div className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-4xl flex-col items-center justify-center px-6 pb-24 pt-36 text-center">
          {/* eyebrow */}
          <motion.div {...rise(0)} className="flex items-center gap-3">
            <Logo size={22} />
            <span className="text-[12px] font-bold uppercase tracking-[0.4em] text-[#FAF6EE]/60">
              Hall&nbsp;Pass&nbsp;&nbsp;·&nbsp;&nbsp;ERC-6900 policy plugins
            </span>
          </motion.div>

          {/* headline — calm, centered, sentence case */}
          <motion.h1
            {...rise(0.12)}
            className="mt-8 max-w-[20ch] text-[clamp(2.6rem,5.6vw,5rem)] font-semibold leading-[1.04] tracking-[-0.02em] text-[#FAF6EE]"
          >
            Give your agent a{" "}
            <span className="text-[#FFB224]">hall&nbsp;pass</span>,
            <br />
            not your keys.
          </motion.h1>

          {/* subcopy — muted gray */}
          <motion.p
            {...rise(0.26)}
            className="mt-7 max-w-[52ch] text-base leading-[1.7] text-[#FAF6EE]/55 md:text-lg"
          >
            Session-key plugins for agent smart wallets. Set the bounds —
            spend caps, allowed targets, expiry — and everything outside them
            reverts on-chain. Revoke anytime.
          </motion.p>

          {/* CTAs */}
          <motion.div
            {...rise(0.4)}
            className="mt-11 flex w-full flex-col items-center gap-4 sm:w-auto sm:flex-row"
          >
            <a
              href="/app"
              className="inline-flex min-h-[52px] w-full items-center justify-center rounded-md bg-gradient-to-b from-[#FFC95C] to-[#FFB224] px-9 text-[15px] font-bold tracking-wide text-[#121110] shadow-[0_0_0_1px_rgba(255,178,36,0.55),0_8px_32px_-8px_rgba(255,178,36,0.45)] transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98] sm:w-auto"
            >
              Install the plugin
            </a>
            <a
              href="#live-proof"
              className="inline-flex min-h-[52px] w-full items-center justify-center rounded-md border border-[#FAF6EE]/25 px-9 text-[15px] font-semibold tracking-wide text-[#FAF6EE]/85 transition-colors hover:border-[#FFB224]/70 hover:text-[#FFB224] sm:w-auto"
            >
              See live proof
            </a>
          </motion.div>

          {/* microcopy */}
          <motion.p
            {...rise(0.52)}
            className="mt-9 text-[11px] font-medium uppercase tracking-[0.32em] text-[#FAF6EE]/35"
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
              className="mt-16 grid w-full max-w-2xl grid-cols-3 gap-6 border-t border-[#FAF6EE]/10 pt-8 text-center"
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
                  <div className="text-3xl font-semibold tabular-nums text-[#FAF6EE] md:text-4xl">
                    {s.value.toLocaleString()}
                  </div>
                  <div className="mt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[#FAF6EE]/40">
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
