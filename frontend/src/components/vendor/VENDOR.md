# Vendored components — manifest

Third-party UI code vendored LOCALLY into this repo (self-hosted, never
hotlinked), per the founder's 2026-10-15 directive: take concrete components
from the reference libraries, adapt them to the HALLPASS palette and the
dashboard performance discipline (transform/opacity only, no blur() filters,
reduced-motion safe) — never verbatim copies.

## reactbits — Aurora
- Source: https://github.com/DavidHDev/react-bits/blob/main/src/ts-tailwind/Backgrounds/Aurora/Aurora.tsx
- License: MIT + Commons Clause v1.0 (c) David Haz. Embedded as a UI element
  inside the HALLPASS app (the use the Commons Clause permits); NOT
  redistributed standalone.
- File: `vendor/reactbits/Aurora.tsx`
- Adaptations: 'use client' removed; calm dashboard defaults (speed 0.35,
  amplitude 0.6, brightness 0.7, no mouse interaction, no intro sweep);
  HALLPASS palette (amber #8a6a24 → bronze → warm black); DPR capped at 1.5.
  WEBGL_lose_context.loseContext() removed from cleanup — it broke React 18
  StrictMode dev double-mount (remount reused the lost canvas context, all GL
  calls became no-ops); program/buffer/VAO deletion kept, context reclaimed
  with the canvas. Production behavior unchanged.
  Reduced-motion + tab-hidden + off-screen handling kept from upstream.
- Used: subtle animated backdrop behind the Accounts page header band.

## pixel-perfect.space — CornerTicks
- Source concept: "borders/border1" — https://github.com/vansh-nagar/Pixel-Perfect/blob/main/registry/new-york/borders/border1.tsx
- File: `vendor/pixelperfect/CornerTicks.tsx`
- Adaptations: recolored to amber on charcoal, sized by prop,
  pointer-events-none, static (no animation).
- Used: dashed corner registration marks on hall-pass session cards (the
  "tape" frame language).

## Magic UI — CountUp (NumberTicker concept)
- Reference: https://magicui.design/docs/components/number-ticker (MIT)
- File: `vendor/magicui/CountUp.tsx`
- Adaptations: implemented on framer-motion's `animate` (already a
  dependency), useInView once, reduced-motion renders the final value
  immediately, fresh chain reads snap to the exact value.
- Used: stats strip values. The target is always the real chain number —
  only the reveal is animated, never the data.

## Aceternity UI — SpotlightCard concept
- Reference: https://ui.aceternity.com/components/spotlight
- File: `vendor/aceternity/SpotlightCard.tsx`
- Adaptations: pointer tracked in CSS custom properties; glow is a plain
  radial-gradient overlay (NO blur() filters); hover-only, decorative,
  hidden under reduced-motion.
- Used: hall-pass session cards.

## Checked and NOT vendored
- cursify.ui-layouts.com — cursor-animation library only (fairydust,
  bubble, snowflake cursors). Cursor gimmicks are banned on the dashboard
  by the design discipline; nothing usable. Dropped with reason.
- pixel-perfect.space "Svg Asset 1" (GSAP-animated SVG) — GSAP is too heavy
  for the dashboard; the dashed language is covered by CornerTicks.
  Dropped with reason.
- shadcn/ui chrome — the relay shell is hand-built to the HALLPASS tokens;
  pulling shadcn primitives would add cva/tailwind-merge weight for no
  visual gain. Dropped with reason.
- Motion Primitives / MicroKit UI — no component beat the adapted
  CountUp/SpotlightCard for the stats + cards job. Dropped with reason.

## 3dicons.co — 3D key icon
- License VERIFIED: Creative Commons CC0 (free for personal and commercial
  use, no attribution required) — see `public/assets/icons-3d/LICENSE-3dicons.md`.
- File: `public/assets/icons-3d/key-3d.png` (400×400 RGBA, silver key).
- Used: tasteful 3D touch in the "no hall pass" empty states.
