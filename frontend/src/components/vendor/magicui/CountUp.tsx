/**
 * CountUp — animated number that counts to its real value on first view.
 *
 * ADAPTED from Magic UI's NumberTicker concept (https://magicui.design/docs/components/number-ticker,
 * MIT). Not verbatim: implemented directly on framer-motion's `animate`
 * (already a dependency) with useInView, no extra packages.
 *
 * Rules: the target value is ALWAYS the real chain number passed in — this
 * component only animates the reveal. With prefers-reduced-motion it renders
 * the final value immediately, no animation.
 */

import { useEffect, useRef, useState } from 'react';
import { animate, useInView } from 'framer-motion';

export interface CountUpProps {
  /** The REAL value to count to. */
  value: number;
  /** Decimals to display. */
  decimals?: number;
  /** Seconds for the count. */
  duration?: number;
  className?: string;
  /** Accessible label override. Defaults to the formatted value. */
  label?: string;
}

function fmt(v: number, decimals: number): string {
  return v.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function CountUp({
  value,
  decimals = 0,
  duration = 0.9,
  className = '',
  label,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-20px' });
  const [display, setDisplay] = useState(() => fmt(0, decimals));
  const doneRef = useRef(false);

  useEffect(() => {
    if (!inView || doneRef.current) return;
    doneRef.current = true;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      setDisplay(fmt(value, decimals));
      return;
    }
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(fmt(v, decimals)),
      onComplete: () => setDisplay(fmt(value, decimals)),
    });
    return () => controls.stop();
  }, [inView, value, decimals, duration]);

  // A fresh chain read after the first reveal snaps to the exact value —
  // no fake intermediate animation.
  useEffect(() => {
    if (doneRef.current) setDisplay(fmt(value, decimals));
  }, [value, decimals]);

  return (
    <span ref={ref} className={className} aria-label={label ?? fmt(value, decimals)}>
      {display}
    </span>
  );
}
