/**
 * DotMatrix — the living hero background for HALLPASS.
 *
 * Built in the spirit of usecarry.xyz's hero: a fine dotted dot-matrix
 * particle field spread across the hero, with a soft shaft of light
 * pouring from the top-center. Ours, not theirs: warm-black #121110,
 * amber #FFB224 light (never blue), original composition.
 *
 * Performance discipline (founder hard requirement):
 *  - Every animated property is transform or opacity ONLY (GPU-composited).
 *  - Zero blur() filters, zero shaders, zero JS loops.
 *  - Soft edges come from gradient falloff + mask-image, never filters.
 *  - Full prefers-reduced-motion: everything static, beam + dots remain.
 *
 * Layers (back → front):
 *  1. Dot field far — tiny dots, slow drift
 *  2. Dot field near — slightly larger dots, slower counter-drift (parallax)
 *  3. Amber beam — top-center light shaft, gentle breathing pulse
 *  4. Rising motes — a few faint dots ascending inside the beam
 */

const MOTES: { left: string; size: number; dur: string; delay: string }[] = [
  { left: "44%", size: 3, dur: "14s", delay: "0s" },
  { left: "47%", size: 2, dur: "11s", delay: "-4s" },
  { left: "51%", size: 4, dur: "16s", delay: "-8s" },
  { left: "54%", size: 2, dur: "12s", delay: "-2s" },
  { left: "49%", size: 3, dur: "15s", delay: "-6s" },
  { left: "45.5%", size: 2, dur: "13s", delay: "-9s" },
  { left: "52.5%", size: 3, dur: "17s", delay: "-3s" },
  { left: "50%", size: 2, dur: "10s", delay: "-7s" },
];

export default function DotMatrix() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden"
    >
      {/* 1 — far dot field: fine matrix, fades toward edges via mask */}
      <div
        className="hp-dots-far absolute inset-[-60px]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,178,36,0.16) 1px, transparent 1.5px)",
          backgroundSize: "26px 26px",
          WebkitMaskImage:
            "radial-gradient(ellipse 75% 65% at 50% 42%, black 30%, transparent 78%)",
          maskImage:
            "radial-gradient(ellipse 75% 65% at 50% 42%, black 30%, transparent 78%)",
        }}
      />

      {/* 2 — near dot field: larger, dimmer, counter-drift for depth */}
      <div
        className="hp-dots-near absolute inset-[-60px]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(250,246,238,0.10) 1px, transparent 1.6px)",
          backgroundSize: "52px 52px",
          WebkitMaskImage:
            "radial-gradient(ellipse 60% 55% at 50% 45%, black 20%, transparent 72%)",
          maskImage:
            "radial-gradient(ellipse 60% 55% at 50% 45%, black 20%, transparent 72%)",
        }}
      />

      {/* 3 — amber beam: soft shaft pouring from top-center.
             Horizontal softness from the gradient itself, vertical fade
             from the mask. Breathes almost imperceptibly. */}
      <div
        className="hp-beam absolute left-1/2 top-[-10%] h-[85%] w-[46vw] min-w-[420px] -translate-x-1/2"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,178,36,0.05) 22%, rgba(255,178,36,0.13) 50%, rgba(255,178,36,0.05) 78%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(180deg, black 0%, rgba(0,0,0,0.55) 45%, transparent 88%)",
          maskImage:
            "linear-gradient(180deg, black 0%, rgba(0,0,0,0.55) 45%, transparent 88%)",
        }}
      />
      {/* beam core — a brighter narrow spine inside the shaft */}
      <div
        className="hp-beam-core absolute left-1/2 top-[-10%] h-[70%] w-[10vw] min-w-[120px] -translate-x-1/2"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,214,130,0.10) 50%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(180deg, black 0%, transparent 80%)",
          maskImage: "linear-gradient(180deg, black 0%, transparent 80%)",
        }}
      />

      {/* 4 — rising motes inside the beam */}
      {MOTES.map((m, i) => (
        <span
          key={i}
          className="hp-mote absolute top-[78%] rounded-full bg-[#FFD682]"
          style={{
            left: m.left,
            width: m.size,
            height: m.size,
            animationDuration: m.dur,
            animationDelay: m.delay,
          }}
        />
      ))}

      {/* bottom fade into the page */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#121110] to-transparent" />
    </div>
  );
}
