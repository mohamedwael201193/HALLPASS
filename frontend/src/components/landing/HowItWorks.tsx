"use client";

import { motion } from "framer-motion";

/**
 * HOW IT WORKS — 5 scroll-animated steps.
 * Install plugin → Set bounds → Agent spends → Over-cap reverts on-chain → Revoke anytime.
 * Each step gets a hand-drawn SVG icon in one consistent 2.5px stroke language.
 * Plain words, zero jargon. Amber marks every "allowed" moment.
 */

const AMBER = "#FFB224";
const CREAM = "#FFF9EF";

function IconSlip() {
  // Install: the hall-pass slip being stamped onto the account
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11" fill="none" stroke={AMBER} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="12" y="6" width="24" height="32" rx="3" />
      <path d="M18 14 h12 M18 20 h12 M18 26 h7" />
      <path d="M30 30 l6 6 M36 30 l-6 6" stroke={CREAM} />
      <circle cx="24" cy="44" r="1.5" fill={AMBER} stroke="none" />
    </svg>
  );
}

function IconSliders() {
  // Set bounds: sliders for cap, window, expiry
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11" fill="none" stroke={AMBER} strokeWidth="2.5" strokeLinecap="round">
      <path d="M8 16 h32 M8 24 h32 M8 32 h32" stroke={CREAM} opacity="0.5" />
      <circle cx="30" cy="16" r="5" fill="#121110" />
      <circle cx="18" cy="24" r="5" fill="#121110" />
      <circle cx="34" cy="32" r="5" fill="#121110" />
    </svg>
  );
}

function IconKey() {
  // Agent spends: the session key turning, amber trail
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11" fill="none" stroke={AMBER} strokeWidth="2.5" strokeLinecap="round">
      <circle cx="17" cy="17" r="9" />
      <path d="M24 24 L40 40" />
      <path d="M33 33 l5 0 M37 37 l4 0" />
      {/* motion arc — it's turning */}
      <path d="M8 34 a12 12 0 0 0 8 8" stroke={CREAM} opacity="0.6" strokeDasharray="3 3" />
    </svg>
  );
}

function IconShieldX() {
  // Over-cap revert: the shield slamming shut
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M24 4 L40 10 v12 c0 10 -7 17 -16 22 C15 39 8 32 8 22 V10 Z" stroke={AMBER} strokeWidth="2.5" />
      <path d="M18 18 l12 12 M30 18 l-12 12" stroke="#FF5C5C" strokeWidth="2.5" />
    </svg>
  );
}

function IconRevoke() {
  // Revoke: the slip torn in two
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11" fill="none" stroke={AMBER} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 8 h14 l-4 8 4 8 -4 8 4 8 H10 Z" />
      <path d="M38 8 H26 l4 8 -4 8 4 8 -4 8 h12 Z" opacity="0.45" />
      <path d="M24 8 l-3 6 M24 20 l3 6 M24 32 l-3 6" stroke="#FF5C5C" />
    </svg>
  );
}

const STEPS = [
  {
    n: "01",
    icon: <IconSlip />,
    title: "Install the plugin",
    body: "One transaction adds the hall-pass policy to your smart account. From that moment, the account enforces your rules on every spend — nothing can sneak past it.",
    tag: "One-time setup",
  },
  {
    n: "02",
    icon: <IconSliders />,
    title: "Set the bounds",
    body: "How much per payment, how much per hour, which addresses are allowed, and when the pass expires. Plain sliders, plain words — what you set is what the chain enforces.",
    tag: "You decide",
  },
  {
    n: "03",
    icon: <IconKey />,
    title: "Your agent spends",
    body: "The agent gets its own session key holding the pass. Spending inside the bounds works instantly — no approvals, no waiting, no babysitting.",
    tag: "Amber means go",
    amber: true,
  },
  {
    n: "04",
    icon: <IconShieldX />,
    title: "Over the line? Blocked on-chain",
    body: "The moment a spend breaks a bound — too big, wrong address, expired pass — the transaction reverts with a plain reason like “over your per-payment cap.” The money never moves. Not a warning: a wall.",
    tag: "Enforced, not promised",
  },
  {
    n: "05",
    icon: <IconRevoke />,
    title: "Revoke anytime",
    body: "Changed your mind? One transaction kills the pass instantly. The session key becomes a dead piece of paper. You stay in control, always.",
    tag: "One tap",
  },
] as const;

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative overflow-hidden bg-[#121110] py-28 md:py-40"
    >
      {/* the connecting thread down the timeline (desktop) */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 top-0 hidden w-px bg-gradient-to-b from-transparent via-[#FFB224]/25 to-transparent md:block"
      />

      <div className="relative mx-auto max-w-6xl px-6 md:px-10">
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="mb-6 text-center text-sm font-semibold uppercase tracking-[0.3em] text-[#FFB224]"
        >
          How it works
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mx-auto max-w-3xl text-center text-5xl font-black leading-[1.02] tracking-tight text-[#FFF9EF] md:text-7xl"
        >
          Five steps. <span className="text-[#FFB224]">Zero trust falls.</span>
        </motion.h2>

        <div className="mt-16 space-y-6 md:mt-24 md:space-y-0">
          {STEPS.map((step, i) => {
            const left = i % 2 === 0;
            return (
              <motion.div
                key={step.n}
                initial={{ opacity: 0, y: 56 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-70px" }}
                transition={{ duration: 0.7 }}
                className="relative md:grid md:grid-cols-2 md:gap-16 md:py-8"
              >
                {/* step node on the timeline */}
                <div
                  aria-hidden
                  className="absolute left-1/2 top-1/2 hidden h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#FFB224] bg-[#121110] md:block"
                />
                <div
                  className={`rounded-3xl border p-8 md:p-10 ${
                    left ? "md:col-start-1 md:mr-4" : "md:col-start-2 md:ml-4"
                  } ${
                    "amber" in step && step.amber
                      ? "border-[#FFB224]/40 bg-gradient-to-br from-[#1A1815] to-[#241a08] shadow-[0_20px_70px_-24px_rgba(255,178,36,0.45)]"
                      : "border-[#FFB224]/10 bg-[#1A1815]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#121110] ring-1 ring-[#FFB224]/20">
                      {step.icon}
                    </div>
                    <span className="text-6xl font-black text-[#FFB224]/15 md:text-7xl">
                      {step.n}
                    </span>
                  </div>
                  <p className="mt-6 text-xs font-bold uppercase tracking-[0.25em] text-[#FFB224]">
                    {step.tag}
                  </p>
                  <h3 className="mt-2 text-2xl font-extrabold text-[#FFF9EF] md:text-3xl">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-lg leading-relaxed text-[#FFF9EF]/65">
                    {step.body}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7 }}
          className="mx-auto mt-16 max-w-3xl rounded-3xl bg-[#FFB224] p-8 text-center md:mt-24 md:p-12"
        >
          <p className="text-2xl font-black leading-tight text-[#121110] md:text-4xl">
            Every step above is real — proven on Arc mainnet, not a mockup.
          </p>
          <p className="mt-3 text-lg font-medium text-[#121110]/75">
            Install, in-policy spend, over-cap revert, revoke: all executed
            on-chain. Check the chain yourself in the live proof below.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
