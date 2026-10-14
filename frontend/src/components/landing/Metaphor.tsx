"use client";

import { motion } from "framer-motion";

/**
 * THE HALL-PASS METAPHOR — the emotional core of the page.
 * "You may leave the room — but only to the bathroom, and only until the bell rings."
 * Three permission-slip cards, each one a bound: Where, How much, Until when.
 * Amber = allowed. All art is hand-drawn SVG.
 */

const STROKE = "#FFB224";

function SlipFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl border-2 border-dashed border-[#FFB224]/40 bg-[#FAF6EE] p-7 text-[#121110] shadow-[0_20px_60px_-20px_rgba(255,178,36,0.35)] md:p-8">
      {/* punched hole */}
      <div aria-hidden className="absolute -top-3 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full border-2 border-dashed border-[#FFB224]/60 bg-[#121110]" />
      {children}
    </div>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12" fill="none" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M24 42 C24 42 10 26 10 17 a14 14 0 0 1 28 0 C38 26 24 42 24 42 Z" />
      <circle cx="24" cy="17" r="5.5" />
      {/* the one approved destination, circled */}
      <circle cx="24" cy="17" r="10.5" stroke="#121110" strokeWidth="1.5" strokeDasharray="3 3" />
    </svg>
  );
}

function CapIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12" fill="none" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round">
      {/* stack of coins with a cap line above */}
      <ellipse cx="24" cy="34" rx="13" ry="5" />
      <path d="M11 34 v-8 M37 34 v-8" />
      <ellipse cx="24" cy="26" rx="13" ry="5" opacity="0.7" />
      <path d="M11 26 v-7 M37 26 v-7" />
      <ellipse cx="24" cy="19" rx="13" ry="5" opacity="0.45" />
      {/* the cap */}
      <path d="M8 10 H40" stroke="#121110" strokeWidth="3" />
      <path d="M8 10 v-3 M40 10 v-3" stroke="#121110" strokeWidth="3" />
      <text x="24" y="7" textAnchor="middle" fontSize="7" fill="#121110" stroke="none" fontWeight="bold">MAX</text>
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12" fill="none" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {/* school bell */}
      <path d="M24 6 c-8 0 -13 7 -13 15 v7 l-4 6 h34 l-4 -6 v-7 c0 -8 -5 -15 -13 -15 Z" />
      <circle cx="24" cy="40" r="3" fill={STROKE} stroke="none" />
      {/* ringing motion */}
      <path d="M7 14 q-4 8 0 16 M41 14 q4 8 0 16" opacity="0.7" />
      {/* clock hands = the deadline */}
      <path d="M24 18 v6 l4 3" stroke="#121110" strokeWidth="2.5" />
    </svg>
  );
}

const CARDS = [
  {
    key: "where",
    icon: <PinIcon />,
    stamp: "WHERE",
    title: "Only to the bathroom",
    body: "Your pass lists exactly where the money may go. Try anywhere else and the payment is refused on the spot — the money never moves.",
    detail: "Destination allowlist — or caps-only mode, your call.",
  },
  {
    key: "howmuch",
    icon: <CapIcon />,
    stamp: "HOW MUCH",
    title: "Pocket money, not the safe",
    body: "A ceiling on every single spend, plus a ceiling per hour that resets on its own. The agent can buy what it needs — it can never drain you.",
    detail: "Per-transaction cap + rolling spending window.",
  },
  {
    key: "untilwhen",
    icon: <BellIcon />,
    stamp: "UNTIL WHEN",
    title: "Dead when the bell rings",
    body: "Every pass has an expiry stamped on it. When the time comes, the pass simply stops working. No cleanup, no remembering to revoke.",
    detail: "Automatic expiry — plus one-tap revoke anytime.",
  },
] as const;

export default function Metaphor() {
  return (
    <section
      id="metaphor"
      className="relative overflow-hidden bg-[#121110] py-28 md:py-40"
    >
      {/* amber permission rings radiating behind the story */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#FFB224]/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#FFB224]/15"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(ellipse_55%_45%_at_50%_35%,rgba(255,178,36,0.10),transparent)]"
      />

      <div className="relative mx-auto max-w-6xl px-6 md:px-10">
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="mb-6 text-center text-sm font-semibold uppercase tracking-[0.3em] text-[#FFB224]"
        >
          The idea, in one sentence
        </motion.p>

        <motion.blockquote
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8 }}
          className="mx-auto max-w-4xl text-center"
        >
          <p className="text-4xl font-black leading-[1.1] tracking-tight text-[#FFF9EF] md:text-6xl">
            &ldquo;You may leave the room —{" "}
            <span className="text-[#FFB224]">but only to the bathroom,</span>{" "}
            and only until the{" "}
            <span className="text-[#FFB224]">bell rings</span>.&rdquo;
          </p>
          <footer className="mt-6 text-base text-[#FFF9EF]/60">
            Every schoolkid knows this deal. Your AI agent is about to learn it too.
          </footer>
        </motion.blockquote>

        <div className="mt-16 grid gap-8 md:mt-24 md:grid-cols-3 md:gap-6 lg:gap-10">
          {CARDS.map((card, i) => (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 56, rotate: i === 1 ? 0 : i === 0 ? -2 : 2 }}
              whileInView={{ opacity: 1, y: 0, rotate: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.7, delay: i * 0.14 }}
              whileHover={{ y: -8, rotate: i === 0 ? -1 : i === 2 ? 1 : 0 }}
            >
              <SlipFrame>
                <div className="flex items-start justify-between">
                  {card.icon}
                  <span className="rounded-full border-2 border-[#FFB224] px-3 py-1 text-[11px] font-black tracking-[0.2em] text-[#121110]">
                    {card.stamp}
                  </span>
                </div>
                <h3 className="mt-5 text-2xl font-extrabold leading-tight">
                  {card.title}
                </h3>
                <p className="mt-3 leading-relaxed text-[#121110]/75">{card.body}</p>
                <p className="mt-5 border-t-2 border-dashed border-[#121110]/15 pt-4 text-sm font-semibold text-[#121110]/60">
                  {card.detail}
                </p>
              </SlipFrame>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mx-auto mt-14 max-w-2xl text-center text-lg text-[#FFF9EF]/70 md:mt-20"
        >
          That slip of paper runs <span className="font-semibold text-[#FFF9EF]">on-chain</span>,
          enforced by your own smart account — not by a promise, not by a server
          that could be talked out of it. The account checks the pass on every
          spend, and <span className="font-semibold text-[#FFB224]">amber means go</span>.
        </motion.p>
      </div>
    </section>
  );
}
