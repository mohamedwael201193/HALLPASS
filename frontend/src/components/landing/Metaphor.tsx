"use client";

import { motion } from "framer-motion";
import { useHidden, EASE_OUT } from "./reveal";

/**
 * THE HALL-PASS METAPHOR — the emotional core of the page.
 * "You may leave the room — but only to the bathroom, and only until the bell rings."
 *
 * Design-standard §2 rhythm device: the three bound cards reuse ONE identical
 * module skeleton with swapped content, following the 7-slot pattern:
 * label → contents list → asterisk fine-print → imperative how-to →
 * name as heading → one-line tagline (sentence case, ends with period) → bespoke visual.
 */

const STROKE = "#FFB224";

function PinIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-16 w-16" fill="none" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Map pin marking the one approved destination">
      <path d="M24 42 C24 42 10 26 10 17 a14 14 0 0 1 28 0 C38 26 24 42 24 42 Z" />
      <circle cx="24" cy="17" r="5.5" />
      <circle cx="24" cy="17" r="10.5" stroke="#121110" strokeWidth="1.5" strokeDasharray="3 3" />
    </svg>
  );
}

function CapIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-16 w-16" fill="none" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" role="img" aria-label="Coin stack under a spending ceiling">
      <ellipse cx="24" cy="34" rx="13" ry="5" />
      <path d="M11 34 v-8 M37 34 v-8" />
      <ellipse cx="24" cy="26" rx="13" ry="5" opacity="0.7" />
      <path d="M11 26 v-7 M37 26 v-7" />
      <ellipse cx="24" cy="19" rx="13" ry="5" opacity="0.45" />
      <path d="M8 10 H40" stroke="#121110" strokeWidth="3" />
      <path d="M8 10 v-3 M40 10 v-3" stroke="#121110" strokeWidth="3" />
      <text x="24" y="6.5" textAnchor="middle" fontSize="7" fill="#121110" stroke="none" fontWeight="bold">MAX</text>
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-16 w-16" fill="none" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Ringing school bell with clock hands">
      <path d="M24 6 c-8 0 -13 7 -13 15 v7 l-4 6 h34 l-4 -6 v-7 c0 -8 -5 -15 -13 -15 Z" />
      <circle cx="24" cy="40" r="3" fill={STROKE} stroke="none" />
      <path d="M7 14 q-4 8 0 16 M41 14 q4 8 0 16" opacity="0.7" />
      <path d="M24 18 v6 l4 3" stroke="#121110" strokeWidth="2.5" />
    </svg>
  );
}

type BoundCard = {
  key: string;
  label: string;
  contents: string[];
  finePrint: string;
  howTo: string;
  name: string;
  tagline: string;
  visual: React.ReactNode;
};

const CARDS: BoundCard[] = [
  {
    key: "where",
    label: "Bound 01 — where.",
    contents: [
      "One allowlist, written by you.",
      "New addresses need your approval first.",
      "Anywhere else is refused on the spot.",
    ],
    finePrint: "Refusals happen on-chain — the transaction reverts before a cent moves.",
    howTo: "Add the addresses your agent may pay. Leave the list empty for caps-only mode.",
    name: "Only to the bathroom.",
    tagline: "The money goes where you wrote, or it goes nowhere.",
    visual: <PinIcon />,
  },
  {
    key: "howmuch",
    label: "Bound 02 — how much.",
    contents: [
      "A ceiling on every single payment.",
      "A ceiling per hour that resets on its own.",
      "Both enforced by the account itself.",
    ],
    finePrint: "Caps are read live from your policy — raise them anytime with one transaction.",
    howTo: "Drag the sliders until the preview matches what you'd hand a teenager.",
    name: "Pocket money, not the safe.",
    tagline: "Small spends flow freely; the treasury never drains.",
    visual: <CapIcon />,
  },
  {
    key: "untilwhen",
    label: "Bound 03 — until when.",
    contents: [
      "An expiry stamped on the pass.",
      "Expired passes stop working on their own.",
      "Revoke early with one tap.",
    ],
    finePrint: "Expiry is enforced on-chain — no cleanup step, no remembering.",
    howTo: "Pick the bell time. Friday 18:00 works for most teams.",
    name: "Dead when the bell rings.",
    tagline: "Permission ends exactly when you said it would.",
    visual: <BellIcon />,
  },
];

/** The single shared module skeleton — used ×3 with swapped content. */
function BoundModule({ card, index }: { card: BoundCard; index: number }) {
  const hidden = useHidden(48);
  return (
    <motion.article
      initial={hidden}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, ease: EASE_OUT, delay: index * 0.12 }}
      aria-label={card.name}
      className="relative rounded-2xl border-2 border-dashed border-[#FFB224]/40 bg-[#FAF6EE] p-7 text-[#121110] shadow-[0_20px_60px_-20px_rgba(255,178,36,0.35)] md:p-8"
    >
      {/* punched hole — the slip hangs on the classroom peg */}
      <div aria-hidden className="absolute -top-3 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full border-2 border-dashed border-[#FFB224]/60 bg-[#121110]" />

      {/* 1 · label */}
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#121110]/55">
        {card.label}
      </p>

      {/* 2 · contents list */}
      <ul className="mt-4 space-y-2">
        {card.contents.map((line) => (
          <li key={line} className="flex items-start gap-2 text-base leading-[1.6]">
            <svg viewBox="0 0 16 16" className="mt-1 h-4 w-4 shrink-0" fill="none" stroke={STROKE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 8.5 L7 12 L13 4" />
            </svg>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {/* 3 · asterisk fine-print */}
      <p className="mt-4 text-sm leading-relaxed text-[#121110]/60">
        <span aria-hidden className="font-bold">*</span> {card.finePrint}
      </p>

      {/* 4 · imperative how-to */}
      <p className="mt-4 border-t-2 border-dashed border-[#121110]/15 pt-4 text-base leading-relaxed text-[#121110]/80">
        {card.howTo}
      </p>

      {/* 5 · name as heading */}
      <h3 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight">
        {card.name}
      </h3>

      {/* 6 · one-line tagline, sentence case, ends with period */}
      <p className="mt-2 text-lg leading-relaxed text-[#121110]/70">{card.tagline}</p>

      {/* 7 · bespoke visual */}
      <div className="mt-6 flex justify-center">{card.visual}</div>
    </motion.article>
  );
}

export default function Metaphor() {
  const headHidden = useHidden(32);
  const quoteHidden = useHidden(40);
  const tailHidden = useHidden(32);

  return (
    <section
      id="metaphor"
      className="relative overflow-hidden bg-[#121110] py-28 md:py-40"
    >
      {/* static amber permission rings — no animation (ambient loops capped by §5) */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#FFB224]/10" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#FFB224]/15" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(ellipse_55%_45%_at_50%_35%,rgba(255,178,36,0.10),transparent)]" />

      <div className="relative mx-auto max-w-6xl px-6 md:px-10">
        <motion.p
          initial={headHidden}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
          className="mb-6 text-center text-sm font-semibold uppercase tracking-[0.3em] text-[#FFB224]"
        >
          The idea, in one sentence.
        </motion.p>

        <motion.blockquote
          initial={quoteHidden}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: EASE_OUT }}
          className="mx-auto max-w-4xl text-center"
        >
          <p className="text-4xl font-black leading-[1.1] tracking-tight text-[#FFF9EF] md:text-6xl">
            &ldquo;You may leave the room —{" "}
            <span className="text-[#FFB224]">but only to the bathroom,</span>{" "}
            and only until the{" "}
            <span className="text-[#FFB224]">bell rings</span>.&rdquo;
          </p>
          <footer className="mt-6 text-base leading-[1.6] text-[#FFF9EF]/60">
            Every schoolkid knows this deal. Your AI agent is about to learn it too.
          </footer>
        </motion.blockquote>

        <div className="mt-16 grid gap-8 md:mt-24 md:grid-cols-3 md:gap-6 lg:gap-10">
          {CARDS.map((card, i) => (
            <BoundModule key={card.key} card={card} index={i} />
          ))}
        </div>

        <motion.p
          initial={tailHidden}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: EASE_OUT }}
          className="mx-auto mt-14 max-w-2xl text-center text-lg leading-[1.6] text-[#FFF9EF]/70 md:mt-20"
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
