"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import heroImg from "@/assets/hero.png";

type Stats = {
  pluginsInstalled: number;
  spendsAllowed: number;
  spendsBlocked: number;
};

const STAT_DEFS: { key: keyof Stats; label: string }[] = [
  { key: "pluginsInstalled", label: "plugins installed" },
  { key: "spendsAllowed", label: "spends allowed" },
  { key: "spendsBlocked", label: "spends blocked" },
];

function useLiveStats(): { stats: Stats | null; error: boolean } {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats")
      .then((r) => {
        if (!r.ok) throw new Error("stats fetch failed");
        return r.json();
      })
      .then((data: Stats) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        // Honest zeros: the live feed is down, so we show 0 — never invented numbers.
        if (!cancelled) {
          setError(true);
          setStats({ pluginsInstalled: 0, spendsAllowed: 0, spendsBlocked: 0 });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { stats, error };
}

const ease = [0.22, 1, 0.36, 1] as const;

export default function Hero() {
  const { stats, error } = useLiveStats();

  return (
    <section className="relative overflow-hidden bg-[#121110] text-[#FFF9EF]">
      <div className="relative mx-auto grid min-h-screen max-w-7xl grid-cols-1 items-center gap-10 px-6 pb-24 pt-32 lg:grid-cols-2 lg:px-10">
        {/* ---- Type block ---- */}
        <div className="relative z-10">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#FFB224]/40 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[#FFB224]"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#FFB224]" />
            Live on Arc mainnet · ERC-6900
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.1, ease }}
            className="text-[clamp(3rem,7.5vw,6.5rem)] font-black leading-[0.95] tracking-tight"
          >
            Give your agent a <span className="text-[#FFB224]">hall&nbsp;pass</span>
            <br />
            — not your keys.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25, ease }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-[#FFF9EF]/70 md:text-xl"
          >
            Handing your agent a private key is reckless. Hall&nbsp;Pass installs a
            policy plugin on your smart wallet, so it can spend only inside the
            bounds you set — caps, windows, expiry, destinations — and everything
            else reverts on-chain.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <Link
              href="/app"
              className="rounded-full bg-[#FFB224] px-9 py-4 text-base font-bold text-[#121110] transition-transform hover:scale-[1.04] active:scale-[0.98]"
            >
              Launch app
            </Link>
            <Link
              href="#live-proof"
              className="rounded-full border border-[#FFF9EF]/30 px-9 py-4 text-base font-semibold text-[#FFF9EF] transition-colors hover:border-[#FFB224] hover:text-[#FFB224]"
            >
              See live proof
            </Link>
          </motion.div>

          {/* ---- Live stats row ---- */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.55, ease }}
            className="mt-14 border-t border-[#FFF9EF]/10 pt-8"
            aria-live="polite"
          >
            <div className="grid grid-cols-3 gap-6">
              {STAT_DEFS.map((s) => (
                <div key={s.key}>
                  {stats === null ? (
                    <div className="h-10 w-20 animate-pulse rounded-md bg-[#FFF9EF]/10" />
                  ) : (
                    <div className="text-4xl font-extrabold tabular-nums text-[#FFB224] md:text-5xl">
                      {stats[s.key].toLocaleString()}
                    </div>
                  )}
                  <div className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-[#FFF9EF]/50">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-[#FFF9EF]/40">
              {stats === null
                ? "Loading live on-chain stats…"
                : error
                  ? "Live feed unavailable — showing zeros, not estimates."
                  : "Live from Arc mainnet."}
            </p>
          </motion.div>
        </div>

        {/* ---- Hero visual: melts into #121110 (image edges are pixel-matched) ---- */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.2, ease }}
          className="relative z-0 lg:-mr-16"
          aria-hidden="true"
        >
          <motion.div
            animate={{ y: [0, -14, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            className="[mask-image:radial-gradient(ellipse_78%_78%_at_50%_50%,black_62%,transparent_100%)]"
          >
            <Image
              src={heroImg}
              alt=""
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="h-auto w-full select-none"
              draggable={false}
            />
          </motion.div>
          {/* Amber ambient bleed — subtle, keeps the melt seamless */}
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_45%,rgba(255,178,36,0.10),transparent_70%)]" />
        </motion.div>
      </div>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.8 }}
        className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 md:flex"
        aria-hidden="true"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#FFF9EF]/40">
          Scroll
        </span>
        <div className="h-10 w-px bg-gradient-to-b from-[#FFB224] to-transparent" />
      </motion.div>
    </section>
  );
}
