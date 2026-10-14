/**
 * Aurora — the living hero background for HALLPASS.
 *
 * CSS/SVG animation ONLY: zero JS animation loops, zero shaders. Every
 * animated property is transform or opacity (GPU-composited, no layout
 * thrash), running at 60fps. All motion honors prefers-reduced-motion
 * (static gradient fallback — see hero-motion.css).
 *
 * Layers (back → front):
 *  1. Ambient base wash — faint radial amber lift on #121110
 *  2. Aurora blobs — two slow-drifting blurred amber/cream gradients
 *  3. Beam sweep — a thin diagonal light band drifting across the hero
 *  4. Particles — a handful of faint drifting motes
 *  5. Tag motif — an oversized ghost SVG hall-pass tag, stroke-only
 *
 * Palette discipline: #121110 bg, #FFB224 amber, #FAF6EE cream —
 * nothing else enters the hero.
 */

const PARTICLES: { left: string; top: string; size: number; dur: string; delay: string }[] = [
  { left: "8%",  top: "22%", size: 3, dur: "11s", delay: "0s" },
  { left: "16%", top: "68%", size: 4, dur: "14s", delay: "-3s" },
  { left: "24%", top: "38%", size: 2, dur: "9s",  delay: "-5s" },
  { left: "31%", top: "80%", size: 3, dur: "13s", delay: "-1s" },
  { left: "42%", top: "14%", size: 2, dur: "10s", delay: "-7s" },
  { left: "52%", top: "58%", size: 3, dur: "15s", delay: "-2s" },
  { left: "61%", top: "26%", size: 4, dur: "12s", delay: "-6s" },
  { left: "68%", top: "72%", size: 2, dur: "9s",  delay: "-4s" },
  { left: "75%", top: "40%", size: 3, dur: "13s", delay: "-8s" },
  { left: "83%", top: "18%", size: 2, dur: "11s", delay: "-2s" },
  { left: "90%", top: "62%", size: 4, dur: "14s", delay: "-5s" },
  { left: "5%",  top: "48%", size: 2, dur: "12s", delay: "-9s" },
  { left: "58%", top: "86%", size: 3, dur: "10s", delay: "-3s" },
  { left: "38%", top: "46%", size: 2, dur: "16s", delay: "-6s" },
];

export default function Aurora() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden">
      {/* 1 — ambient wash */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_20%,rgba(255,178,36,0.055),transparent_70%)]" />

      {/* 2 — aurora blobs: soft radial gradients, NO blur() filter.
           blur on animated layers forces per-frame re-rasterization;
           gradients fade by construction and move as cheap textures. */}
      <div className="hp-aurora-a absolute -left-[12%] top-[-18%] h-[70vh] w-[55vw] rounded-full bg-[radial-gradient(closest-side,rgba(255,178,36,0.10),rgba(255,178,36,0.03)_55%,transparent_75%)]" />
      <div className="hp-aurora-b absolute -right-[10%] top-[8%] h-[80vh] w-[48vw] rounded-full bg-[radial-gradient(closest-side,rgba(250,246,238,0.06),rgba(250,246,238,0.015)_55%,transparent_75%)]" />
      <div className="hp-aurora-c absolute bottom-[-30%] left-[28%] h-[55vh] w-[60vw] rounded-full bg-[radial-gradient(closest-side,rgba(255,178,36,0.07),rgba(255,178,36,0.02)_55%,transparent_75%)]" />

      {/* 3 — beam sweep: a thin diagonal band of light drifting left → right */}
      <div className="hp-beam absolute inset-y-[-20%] left-0 w-[24vw] -skew-x-12 bg-[linear-gradient(90deg,transparent,rgba(255,178,36,0.06),transparent)]" />

      {/* 4 — particles */}
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="hp-particle absolute rounded-full bg-[#FFB224]"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            animationDuration: p.dur,
            animationDelay: p.delay,
          }}
        />
      ))}

      {/* 5 — ghost hall-pass tag motif, stroke-only, huge and barely there */}
      <svg
        viewBox="0 0 420 560"
        className="hp-tag-motif absolute right-[-8%] top-1/2 h-[135%] w-auto -translate-y-1/2 text-[#FFB224]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        {/* tag body */}
        <path
          d="M120 70 L330 70 C 362 70 388 96 388 128 L 388 462 C 388 494 362 520 330 520 L 120 520 C 88 520 62 494 62 462 L 62 128 C 62 96 88 70 120 70 Z"
          opacity="0.14"
        />
        {/* punched hole */}
        <circle cx="128" cy="132" r="15" opacity="0.18" />
        {/* string loop */}
        <path
          d="M122 122 C 70 80, 44 44, 30 4"
          opacity="0.12"
          strokeLinecap="round"
          className="hp-tag-string"
        />
        {/* ghost text lines — a pass form, abstracted */}
        <path d="M112 200 L338 200" opacity="0.10" strokeLinecap="round" />
        <path d="M112 244 L338 244" opacity="0.07" strokeLinecap="round" />
        <path d="M112 288 L268 288" opacity="0.07" strokeLinecap="round" />
        <path d="M112 452 L208 452" opacity="0.10" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/**
 * TagMark — the small refined tag accent used in the hero eyebrow.
 * A tiny punched-tag glyph in amber; decorative only.
 */
export function TagMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      {/* classic hang-tag silhouette */}
      <path
        d="M3 11.5 V4 a1 1 0 0 1 1-1 h7.5 L20 11.5 a1.5 1.5 0 0 1 0 2.1 l-6.4 6.4 a1.5 1.5 0 0 1-2.1 0 Z"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
