"use client";

import { motion } from "framer-motion";

/**
 * THE PROBLEM — "Your agent has your keys. That's insane."
 * The all-or-nothing trap: hand over the keys (reckless) or keep the agent
 * on a leash so short it can't move (useless). Original SVG art only.
 */

const PANELS = [
  {
    id: "keys",
    eyebrow: "Option one",
    title: "Hand over the keys",
    body: "Your agent holds your private key. It can pay for the API call you asked for — and also empty the account while you're asleep. There is no partial trust.",
    accent: false,
  },
  {
    id: "leash",
    eyebrow: "Option two",
    title: "Choke the leash",
    body: "You approve every spend by hand. Every 1-cent API call waits for you. Your agent stops being an agent and becomes a very expensive email.",
    accent: false,
  },
] as const;

function KeyLeashArt({ variant }: { variant: "keys" | "leash" }) {
  if (variant === "keys") {
    // A full key, offered to a grasping hand-shadow — everything goes with it.
    return (
      <svg
        viewBox="0 0 320 200"
        className="h-44 w-full"
        role="img"
        aria-label="A house key floating above an open vault door"
        fill="none"
      >
        <ellipse cx="160" cy="178" rx="110" ry="10" fill="#FFB224" opacity="0.08" />
        {/* vault door */}
        <rect x="52" y="60" width="216" height="120" rx="18" stroke="#3A352C" strokeWidth="2" />
        <circle cx="244" cy="120" r="7" stroke="#3A352C" strokeWidth="2" />
        <rect x="52" y="60" width="216" height="120" rx="18" stroke="#7A6A55" strokeWidth="1" opacity="0.5" />
        {/* open crack */}
        <path d="M140 60 V180" stroke="#FF5C5C" strokeWidth="2" strokeDasharray="6 6" opacity="0.8" />
        {/* key */}
        <g transform="rotate(-18 160 130)">
          <circle cx="160" cy="98" r="18" stroke="#FF5C5C" strokeWidth="5" />
          <line x1="160" y1="116" x2="160" y2="168" stroke="#FF5C5C" strokeWidth="5" strokeLinecap="round" />
          <line x1="160" y1="136" x2="176" y2="136" stroke="#FF5C5C" strokeWidth="5" strokeLinecap="round" />
          <line x1="160" y1="152" x2="172" y2="152" stroke="#FF5C5C" strokeWidth="5" strokeLinecap="round" />
        </g>
        {/* falling coins — everything leaves at once */}
        <circle cx="110" cy="40" r="5" fill="#FFB224" opacity="0.9" />
        <circle cx="205" cy="30" r="4" fill="#FFB224" opacity="0.6" />
        <circle cx="246" cy="52" r="3.5" fill="#FFB224" opacity="0.4" />
        <path d="M96 44 q8 10 2 22 M200 34 q-6 12 -1 24 M242 56 q6 8 2 18" stroke="#FFB224" strokeWidth="1.5" opacity="0.7" />
      </svg>
    );
  }
  // Leash so short the key can't reach anything — a key tied to a post.
  return (
    <svg
      viewBox="0 0 320 200"
      className="h-44 w-full"
      role="img"
      aria-label="A key on a very short leash tied to a post"
      fill="none"
    >
      <ellipse cx="160" cy="178" rx="110" ry="10" fill="#FFB224" opacity="0.08" />
      {/* post */}
      <rect x="236" y="52" width="14" height="126" rx="7" stroke="#5A5348" strokeWidth="2" />
      {/* tight leash */}
      <path d="M160 96 C 200 96, 216 96, 236 96" stroke="#8A8177" strokeWidth="3" />
      {/* key held back, straining toward a distant coin it can't reach */}
      <g transform="rotate(24 160 130)">
        <circle cx="160" cy="112" r="18" stroke="#8A8177" strokeWidth="5" />
        <line x1="160" y1="130" x2="160" y2="182" stroke="#8A8177" strokeWidth="5" strokeLinecap="round" />
        <line x1="160" y1="150" x2="176" y2="150" stroke="#8A8177" strokeWidth="5" strokeLinecap="round" />
      </g>
      <circle cx="66" cy="120" r="10" stroke="#FFB224" strokeWidth="2" opacity="0.9" />
      <text x="66" y="125" textAnchor="middle" fill="#FFB224" fontSize="12" fontWeight="bold">¢</text>
      <path d="M132 108 L96 112 M132 132 L98 128" stroke="#8A8177" strokeWidth="1.5" strokeDasharray="4 4" />
      <text x="66" y="150" textAnchor="middle" fill="#8A8177" fontSize="11">"not today"</text>
    </svg>
  );
}

export default function Problem() {
  return (
    <section
      id="problem"
      className="relative overflow-hidden bg-[#121110] py-28 md:py-40"
    >
      {/* faint red wash — the only place denied-red lives on the page */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(255,92,92,0.07),transparent)]"
      />
      <div className="mx-auto max-w-6xl px-6 md:px-10">
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="mb-6 text-sm font-semibold uppercase tracking-[0.3em] text-[#FFB224]"
        >
          The problem
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="max-w-4xl text-5xl font-black leading-[1.02] tracking-tight text-[#FFF9EF] md:text-7xl"
        >
          Your agent has your keys. <span className="text-[#FFB224]">That&apos;s insane.</span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-6 max-w-2xl text-lg leading-relaxed text-[#FFF9EF]/70 md:text-xl"
        >
          Crypto keys are all-or-nothing. There is no &ldquo;just a little&rdquo; access —
          so teams running AI agents face a choice that isn&apos;t really a choice.
        </motion.p>

        <div className="mt-14 grid gap-6 md:mt-20 md:grid-cols-2 md:gap-8">
          {PANELS.map((panel, i) => (
            <motion.div
              key={panel.id}
              initial={{ opacity: 0, y: 48 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.7, delay: i * 0.12 }}
              className="rounded-3xl border border-[#FFB224]/10 bg-[#1A1815] p-8 md:p-10"
            >
              <KeyLeashArt variant={panel.id} />
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#FF5C5C]/80">
                {panel.eyebrow}
              </p>
              <h3 className="mt-2 text-2xl font-extrabold text-[#FFF9EF] md:text-3xl">
                {panel.title}
              </h3>
              <p className="mt-3 leading-relaxed text-[#FFF9EF]/65">{panel.body}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7 }}
          className="mt-12 flex flex-col gap-5 rounded-3xl border border-[#FFB224]/25 bg-gradient-to-br from-[#1A1815] to-[#211a0e] p-8 md:mt-16 md:flex-row md:items-center md:gap-10 md:p-12"
        >
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#FFB224] md:h-20 md:w-20">
            <svg viewBox="0 0 32 32" className="h-9 w-9 md:h-11 md:w-11" fill="none" stroke="#121110" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 24 L24 7" />
              <path d="M16 7 h8 v8" />
            </svg>
          </div>
          <div>
            <h3 className="text-2xl font-extrabold text-[#FFF9EF] md:text-3xl">
              The middle ground crypto forgot.
            </h3>
            <p className="mt-2 max-w-2xl text-lg leading-relaxed text-[#FFF9EF]/70">
              What if your agent could spend — a little, to the right places,
              until the bell rings — and you could take it all back in one tap?
              That&apos;s the hall pass.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
