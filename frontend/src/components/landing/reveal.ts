"use client";

import { useReducedMotion } from "framer-motion";

/**
 * Shared reduced-motion-safe entrance helper (design-standard §5).
 * Scroll entrances = opacity + translateY only, ≤0.8s easeOut.
 * When the user prefers reduced motion, elements render in their final state.
 */
export function useHidden(y = 40): false | { opacity: number; y: number } {
  const reduce = useReducedMotion();
  return reduce ? false : { opacity: 0, y };
}

export const EASE_OUT = "easeOut" as const;
