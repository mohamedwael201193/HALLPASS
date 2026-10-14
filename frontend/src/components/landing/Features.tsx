/**
 * Features — every module follows the design-standard §2 7-slot skeleton:
 * label → contents list → asterisk fine-print → imperative how-to →
 * name heading → tagline (sentence case, ends with period) → bespoke visual.
 * The skeleton is IDENTICAL for every module; only content and the
 * hand-made SVG visual swap.
 */

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useHidden, EASE_OUT } from "./reveal";

const TOKENS = {
  bg: "#121110",
  amber: "#FFB224",
  cream: "#FAF6EE",
  textDark: "#FFF9EF",
  muted: "rgba(255,249,239,0.62)",
  card: "rgba(250,246,238,0.045)",
  border: "rgba(255,178,36,0.22)",
  finePrint: "rgba(255,249,239,0.48)",
};

type Feature = {
  label: string;
  contents: string[];
  asterisk: string;
  howTo: string;
  name: string;
  tagline: string;
  visual: ReactNode;
};

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 72 72"
      style={{ display: "block", marginTop: 18 }}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const A = TOKENS.amber;

const FEATURES: Feature[] = [
  {
    label: "CONTROL 01",
    contents: ["One ceiling per transaction.", "Decoded from calldata at execution time."],
    asterisk: "*over-cap spends revert with a reason; nothing moves.",
    howTo: "Name the largest amount the agent may move in one go when you install the plugin.",
    name: "Per-tx caps",
    tagline: "One transaction can never outrun the ceiling.",
    visual: (
      <Glyph>
        <rect x="14" y="30" width="30" height="6" rx="3" fill={A} />
        <rect x="14" y="42" width="44" height="6" rx="3" fill={A} opacity="0.35" />
        <path d="M58 33 L66 33 M62 29 L62 37" stroke={A} strokeWidth="2.5" strokeLinecap="round" />
      </Glyph>
    ),
  },
  {
    label: "CONTROL 02",
    contents: ["Window cap + window length in seconds.", "windowSpent tracked on-chain."],
    asterisk: "*accounting survives reverts; the window never double-counts.",
    howTo: "Pick a budget per window — say 0.02 USDC per hour — and the plugin enforces it atomically.",
    name: "Spending windows",
    tagline: "The budget refills on your schedule, not the agent's.",
    visual: (
      <Glyph>
        <circle cx="36" cy="36" r="22" fill="none" stroke={A} strokeWidth="2.5" />
        <circle cx="36" cy="36" r="22" fill="none" stroke={A} strokeWidth="2.5" strokeDasharray="34 104" strokeLinecap="round" />
        <circle cx="36" cy="36" r="4" fill={A} />
      </Glyph>
    ),
  },
  {
    label: "CONTROL 03",
    contents: ["Absolute expiry timestamp.", "No revocation ceremony needed."],
    asterisk: "*after expiry the key is inert; the account is untouched.",
    howTo: "Set the expiry at install and let the pass die on its own.",
    name: "Expiry",
    tagline: "The pass dies on its own, even if you forget.",
    visual: (
      <Glyph>
        <circle cx="36" cy="38" r="20" fill="none" stroke={A} strokeWidth="2.5" />
        <line x1="36" y1="38" x2="36" y2="26" stroke={A} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="36" y1="38" x2="46" y2="42" stroke={A} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="30" y1="10" x2="42" y2="10" stroke={A} strokeWidth="2.5" strokeLinecap="round" />
      </Glyph>
    ),
  },
  {
    label: "CONTROL 04",
    contents: ["Explicit address list.", "Everything else is unreachable."],
    asterisk: "*the list is checked on-chain per spend, not in your client.",
    howTo: "Write down the only addresses the agent may ever pay, and lock the list in.",
    name: "Destination allowlists",
    tagline: "Money only goes where you wrote it down.",
    visual: (
      <Glyph>
        <rect x="18" y="14" width="36" height="44" rx="6" fill="none" stroke={A} strokeWidth="2.5" />
        <line x1="26" y1="26" x2="46" y2="26" stroke={A} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="26" y1="36" x2="46" y2="36" stroke={A} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="26" y1="46" x2="38" y2="46" stroke={A} strokeWidth="2.5" strokeLinecap="round" opacity="0.45" />
      </Glyph>
    ),
  },
  {
    label: "CONTROL 05",
    contents: ["EIP-712 typed data.", "EIP-3009 transfer authorizations."],
    asterisk: "*unauthorized digests return 0xffffffff or revert — never silent.",
    howTo: "Pre-authorize each digest through the account; facilitators verify via the plugin's isValidSignature gate.",
    name: "Typed-data coverage",
    tagline: "The policy holds where signatures live, too.",
    visual: (
      <Glyph>
        <path d="M20 52 L34 20 L40 32 L46 20 L60 52" fill="none" stroke={A} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="28" y1="44" x2="52" y2="44" stroke={A} strokeWidth="2.5" strokeLinecap="round" opacity="0.45" />
      </Glyph>
    ),
  },
  {
    label: "CONTROL 06",
    contents: ["Owner-only revokeSession().", "Takes effect immediately."],
    asterisk: "*caps stay intact after revoke; hand out a fresh pass anytime.",
    howTo: "Pull the pass the moment anything looks wrong — one owner call, final state revoked = true.",
    name: "Instant revoke",
    tagline: "One call and the pass is gone for good.",
    visual: (
      <Glyph>
        <circle cx="36" cy="36" r="20" fill="none" stroke={A} strokeWidth="2.5" />
        <line x1="22" y1="22" x2="50" y2="50" stroke={A} strokeWidth="3" strokeLinecap="round" />
      </Glyph>
    ),
  },
  {
    label: "CONTROL 07",
    contents: ["ERC-6900 plugin, v0.7 manifest.", "Same machinery as Circle's own plugins."],
    asterisk: "*no wrapper, no middleware — the policy lives in the account.",
    howTo: "Install it like any first-class plugin; hook lists compose, validation slots stay exclusive.",
    name: "ERC-6900 native",
    tagline: "Not a bolt-on. A first-class citizen of the account.",
    visual: (
      <Glyph>
        <rect x="22" y="22" width="28" height="28" rx="4" fill="none" stroke={A} strokeWidth="2.5" />
        <rect x="30" y="30" width="12" height="12" rx="2" fill={A} />
      </Glyph>
    ),
  },
];

function Module({ f, index }: { f: Feature; index: number }) {
  const hidden = useHidden(36);
  return (
    <motion.article
      initial={hidden}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, ease: EASE_OUT, delay: (index % 3) * 0.06 }}
      style={{
        background: TOKENS.card,
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 14,
        padding: 26,
      }}
    >
      {/* 1 — label */}
      <p
        style={{
          fontSize: 12,
          letterSpacing: "0.2em",
          color: TOKENS.amber,
          fontWeight: 700,
          margin: "0 0 14px",
        }}
      >
        {f.label}
      </p>
      {/* 2 — contents list */}
      <ul style={{ margin: "0 0 10px", padding: "0 0 0 18px", color: TOKENS.muted, fontSize: 15, lineHeight: 1.7 }}>
        {f.contents.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      {/* 3 — asterisk fine print */}
      <p style={{ fontSize: 13, color: TOKENS.finePrint, margin: "0 0 16px" }}>
        {f.asterisk}
      </p>
      {/* 4 — imperative how-to */}
      <p style={{ fontSize: 15, lineHeight: 1.6, color: TOKENS.textDark, margin: "0 0 18px" }}>
        {f.howTo}
      </p>
      {/* 5 — name heading */}
      <h3 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>
        {f.name}
      </h3>
      {/* 6 — tagline, sentence case, ends with period */}
      <p style={{ fontSize: 15.5, color: TOKENS.muted, margin: 0, lineHeight: 1.55 }}>
        {f.tagline}
      </p>
      {/* 7 — bespoke visual */}
      {f.visual}
    </motion.article>
  );
}

export default function Features() {
  return (
    <section
      style={{ background: TOKENS.bg, color: TOKENS.textDark, padding: "clamp(96px, 10vw, 128px) 24px" }}
    >
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <p
          style={{
            color: TOKENS.amber,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            fontSize: 13,
            fontWeight: 700,
            margin: "0 0 16px",
          }}
        >
          What the pass controls
        </p>
        <h2
          style={{
            fontSize: "clamp(30px, 4.5vw, 48px)",
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
            margin: "0 0 48px",
            fontWeight: 800,
          }}
        >
          Every bound, enforced on-chain.
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 16,
          }}
        >
          {FEATURES.map((f, i) => (
            <Module key={f.name} f={f} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
