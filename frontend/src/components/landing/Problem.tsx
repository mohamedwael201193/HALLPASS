"use client";

import { motion } from "framer-motion";
import { useHidden, EASE_OUT } from "./reveal";
import { CarrySection, SectionH2 } from "./carry/Section";

/**
 * THE PROBLEM — "Your agent has your keys. That's insane."
 * Carry-exact shell: numbered label row, Satoshi H2 (second clause white/50),
 * dark cards, blue accents. All copy byte-identical; only styling changed.
 */

const AMBER = "#FFB224";
const DENY = "#E0655F";

const PANELS = [
  {
    id: "keys" as const,
    eyebrow: "Option one.",
    title: "Hand over the keys.",
    body: "Your agent holds your private key. It can pay for the API call you asked for — and also empty the account while you're asleep. There is no partial trust.",
  },
  {
    id: "leash" as const,
    eyebrow: "Option two.",
    title: "Choke the leash.",
    body: "You approve every spend by hand. Every 1-cent API call waits for you. Your agent stops being an agent and becomes a very expensive email.",
  },
];

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
        <ellipse cx="160" cy="178" rx="110" ry="10" fill={AMBER} opacity="0.08" />
        {/* vault door */}
        <rect x="52" y="60" width="216" height="120" rx="18" stroke="#3A4356" strokeWidth="2" />
        <circle cx="244" cy="120" r="7" stroke="#3A4356" strokeWidth="2" />
        {/* open crack */}
        <path d="M140 60 V180" stroke={DENY} strokeWidth="2" strokeDasharray="6 6" opacity="0.8" />
        {/* key */}
        <g transform="rotate(-18 160 130)">
          <circle cx="160" cy="98" r="18" stroke={DENY} strokeWidth="5" />
          <line x1="160" y1="116" x2="160" y2="168" stroke={DENY} strokeWidth="5" strokeLinecap="round" />
          <line x1="160" y1="136" x2="176" y2="136" stroke={DENY} strokeWidth="5" strokeLinecap="round" />
          <line x1="160" y1="152" x2="172" y2="152" stroke={DENY} strokeWidth="5" strokeLinecap="round" />
        </g>
        {/* falling coins — everything leaves at once */}
        <circle cx="110" cy="40" r="5" fill={AMBER} opacity="0.9" />
        <circle cx="205" cy="30" r="4" fill={AMBER} opacity="0.6" />
        <circle cx="246" cy="52" r="3.5" fill={AMBER} opacity="0.4" />
        <path d="M96 44 q8 10 2 22 M200 34 q-6 12 -1 24 M242 56 q6 8 2 18" stroke={AMBER} strokeWidth="1.5" opacity="0.7" />
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
      <ellipse cx="160" cy="178" rx="110" ry="10" fill={AMBER} opacity="0.08" />
      {/* post */}
      <rect x="236" y="52" width="14" height="126" rx="7" stroke="#5A6070" strokeWidth="2" />
      {/* tight leash */}
      <path d="M160 96 C 200 96, 216 96, 236 96" stroke="#8A93A6" strokeWidth="3" />
      {/* key held back, straining toward a distant coin it can't reach */}
      <g transform="rotate(24 160 130)">
        <circle cx="160" cy="112" r="18" stroke="#8A93A6" strokeWidth="5" />
        <line x1="160" y1="130" x2="160" y2="182" stroke="#8A93A6" strokeWidth="5" strokeLinecap="round" />
        <line x1="160" y1="150" x2="176" y2="150" stroke="#8A93A6" strokeWidth="5" strokeLinecap="round" />
      </g>
      <circle cx="66" cy="120" r="10" stroke={AMBER} strokeWidth="2" opacity="0.9" />
      <text x="66" y="125" textAnchor="middle" fill={AMBER} fontSize="12" fontWeight="bold">¢</text>
      <path d="M132 108 L96 112 M132 132 L98 128" stroke="#8A93A6" strokeWidth="1.5" strokeDasharray="4 4" />
      <text x="66" y="150" textAnchor="middle" fill="#8A93A6" fontSize="11">"not today"</text>
    </svg>
  );
}

export default function Problem() {
  const h1 = useHidden(24);
  const h2 = useHidden(32);
  const bridge = useHidden(40);

  return (
    <CarrySection id="problem" number="01" label="The problem">
      {/* faint denied-red wash — the only place red lives on the page */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(224,101,95,0.06),transparent)]"
      />
      <div className="relative">
        <motion.div
          initial={h1}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
        >
          <SectionH2>
            Your agent has your keys. That&apos;s <span className="text-white/50">insane.</span>
          </SectionH2>
        </motion.div>
        <motion.p
          initial={h2}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: EASE_OUT }}
          className="mt-6 max-w-md text-lg font-light leading-relaxed text-gray-400"
        >
          Crypto keys are all-or-nothing. There is no &ldquo;just a
          little&rdquo; access — so teams running AI agents face a choice that
          isn&apos;t really a choice.
        </motion.p>

        <div className="mt-14 grid gap-6 md:mt-20 md:grid-cols-2 md:gap-8">
          {PANELS.map((panel, i) => (
            <PanelCard key={panel.id} panel={panel} index={i} />
          ))}
        </div>

        <motion.div
          initial={bridge}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: EASE_OUT }}
          className="mt-12 flex flex-col gap-6 border border-dashed border-white/20 bg-white/[0.02] p-8 md:mt-16 md:flex-row md:items-center md:gap-10 md:p-10"
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center ring-1 ring-[#FFB224]/40 md:h-16 md:w-16">
            <svg viewBox="0 0 32 32" className="h-8 w-8 md:h-9 md:w-9" fill="none" stroke={AMBER} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 24 L24 7" />
              <path d="M16 7 h8 v8" />
            </svg>
          </div>
          <div>
            <h3 className="text-2xl font-normal text-white md:text-3xl">
              The middle ground crypto forgot.
            </h3>
            <p className="mt-2 max-w-2xl text-lg font-light leading-relaxed text-gray-400">
              What if your agent could spend — a little, to the right places,
              until the bell rings — and you could take it all back in one tap?
              That&apos;s the hall pass.
            </p>
          </div>
        </motion.div>
      </div>
    </CarrySection>
  );
}

function PanelCard({
  panel,
  index,
}: {
  panel: (typeof PANELS)[number];
  index: number;
}) {
  const hidden = useHidden(48);
  return (
    <motion.div
      initial={hidden}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, ease: EASE_OUT, delay: index * 0.12 }}
      className="border border-dashed border-white/20 bg-white/[0.02] p-8 md:p-10"
    >
      <KeyLeashArt variant={panel.id} />
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#E0655F]/80">
        {panel.eyebrow}
      </p>
      <h3 className="mt-2 text-2xl font-normal text-white md:text-3xl">
        {panel.title}
      </h3>
      <p className="mt-3 font-light leading-[1.6] text-gray-400">{panel.body}</p>
    </motion.div>
  );
}
