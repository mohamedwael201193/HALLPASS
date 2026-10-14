"use client";

import { motion } from "framer-motion";
import { useHidden, EASE_OUT } from "./reveal";
import { CarrySection, SectionH2 } from "./carry/Section";

/**
 * HOW IT WORKS — 5 scroll-animated steps.
 * Install plugin → Set bounds → Agent spends → Over-cap reverts on-chain → Revoke anytime.
 * Carry-exact shell; each step keeps its hand-drawn SVG icon in one consistent
 * 2.5px stroke language, recolored to the blue family. All copy byte-identical.
 */

const AMBER = "#FFB224";
const DENY = "#E0655F";

function IconSlip() {
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11" fill="none" stroke={AMBER} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Hall-pass slip being installed">
      <rect x="12" y="6" width="24" height="32" rx="3" />
      <path d="M18 14 h12 M18 20 h12 M18 26 h7" />
      <path d="M30 30 l6 6 M36 30 l-6 6" stroke="#FFFFFF" />
    </svg>
  );
}

function IconSliders() {
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11" fill="none" stroke={AMBER} strokeWidth="2.5" strokeLinecap="round" role="img" aria-label="Sliders for spending bounds">
      <path d="M8 16 h32 M8 24 h32 M8 32 h32" stroke="#FFFFFF" opacity="0.5" />
      <circle cx="30" cy="16" r="5" fill="#050505" />
      <circle cx="18" cy="24" r="5" fill="#050505" />
      <circle cx="34" cy="32" r="5" fill="#050505" />
    </svg>
  );
}

function IconKey() {
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11" fill="none" stroke={AMBER} strokeWidth="2.5" strokeLinecap="round" role="img" aria-label="Session key turning">
      <circle cx="17" cy="17" r="9" />
      <path d="M24 24 L40 40" />
      <path d="M33 33 l5 0 M37 37 l4 0" />
      <path d="M8 34 a12 12 0 0 0 8 8" stroke="#FFFFFF" opacity="0.6" strokeDasharray="3 3" />
    </svg>
  );
}

function IconShieldX() {
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11" fill="none" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Shield blocking an over-cap spend">
      <path d="M24 4 L40 10 v12 c0 10 -7 17 -16 22 C15 39 8 32 8 22 V10 Z" stroke={AMBER} strokeWidth="2.5" />
      <path d="M18 18 l12 12 M30 18 l-12 12" stroke={DENY} strokeWidth="2.5" />
    </svg>
  );
}

function IconRevoke() {
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11" fill="none" stroke={AMBER} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Hall-pass slip torn in two">
      <path d="M10 8 h14 l-4 8 4 8 -4 8 4 8 H10 Z" />
      <path d="M38 8 H26 l4 8 -4 8 4 8 -4 8 h12 Z" opacity="0.45" />
      <path d="M24 8 l-3 6 M24 20 l3 6 M24 32 l-3 6" stroke={DENY} />
    </svg>
  );
}

const STEPS = [
  {
    n: "01",
    icon: <IconSlip />,
    title: "Install the plugin.",
    body: "One transaction adds the hall-pass policy to your smart account. From that moment, the account enforces your rules on every spend — nothing can sneak past it.",
    tag: "One-time setup.",
  },
  {
    n: "02",
    icon: <IconSliders />,
    title: "Set the bounds.",
    body: "How much per payment, how much per hour, which addresses are allowed, and when the pass expires. Plain sliders, plain words — what you set is what the chain enforces.",
    tag: "You decide.",
  },
  {
    n: "03",
    icon: <IconKey />,
    title: "Your agent spends.",
    body: "The agent gets its own session key holding the pass. Spending inside the bounds works instantly — no approvals, no waiting, no babysitting.",
    tag: "Amber means go.",
    blue: true,
  },
  {
    n: "04",
    icon: <IconShieldX />,
    title: "Over the line? Blocked on-chain.",
    body: "The moment a spend breaks a bound — too big, wrong address, expired pass — the transaction reverts with a plain reason like “over your per-payment cap.” The money never moves. Not a warning: a wall.",
    tag: "Enforced, not promised.",
  },
  {
    n: "05",
    icon: <IconRevoke />,
    title: "Revoke anytime.",
    body: "Changed your mind? One transaction kills the pass instantly. The session key becomes a dead piece of paper. You stay in control, always.",
    tag: "One tap.",
  },
] as const;

export default function HowItWorks() {
  const headHidden = useHidden(24);
  const tailHidden = useHidden(40);

  return (
    <CarrySection id="how-it-works" number="03" label="How it works">
      <motion.div
        initial={headHidden}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: EASE_OUT }}
      >
        <SectionH2>
          Five steps. <span className="text-white/50">Zero trust falls.</span>
        </SectionH2>
      </motion.div>

      <div className="mt-14 grid gap-6 md:mt-20 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
        {STEPS.map((step, i) => (
          <StepCard key={step.n} step={step} index={i} />
        ))}
      </div>

      <motion.div
        initial={tailHidden}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.7, ease: EASE_OUT }}
        className="mx-auto mt-14 max-w-3xl border border-dashed border-[#FFB224]/40 bg-white/[0.02] p-8 text-center md:mt-20 md:p-10"
      >
        <p className="text-xl font-normal leading-tight text-white md:text-3xl">
          Every step above is real — proven on Arc mainnet, not a mockup.
        </p>
        <p className="mt-3 text-base font-light leading-[1.6] text-gray-400 md:text-lg">
          Install, in-policy spend, over-cap revert, revoke: all executed
          on-chain. Check the chain yourself in the live proof below.
        </p>
      </motion.div>
    </CarrySection>
  );
}

function StepCard({ step, index }: { step: (typeof STEPS)[number]; index: number }) {
  const hidden = useHidden(56);
  return (
    <motion.div
      initial={hidden}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.7, ease: EASE_OUT, delay: (index % 3) * 0.08 }}
      className={`border p-8 ${
        "blue" in step && step.blue
          ? "border-[#FFB224]/40 bg-white/[0.03]"
          : "border-dashed border-white/20 bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex h-20 w-20 items-center justify-center bg-[#050505] ring-1 ring-[#FFB224]/20">
          {step.icon}
        </div>
        <span className="font-geist text-5xl tracking-tighter text-[#FFB224]/20 md:text-6xl">
          {step.n}
        </span>
      </div>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.25em] text-[#FFB224]">
        {step.tag}
      </p>
      <h3 className="mt-2 text-2xl font-normal text-white md:text-3xl">
        {step.title}
      </h3>
      <p className="mt-3 text-lg font-light leading-[1.6] text-gray-400">
        {step.body}
      </p>
    </motion.div>
  );
}
